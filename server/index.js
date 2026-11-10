import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, backupDb, DB_FILE } from './db.js';
import { getExportDir, defaultExportDir, setExportDir, workbookBuffer } from './export.js';
import { login, logout, need, roleFromRequest } from './auth.js';
import { HttpError, currentShift, openShift, closeShift, nextSlot, issueTicket, ticketView } from './queue.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1'; // 0.0.0.0 - если нужен доступ с других устройств в сети

const app = express();
app.use(express.json());

// обёртка: ошибки из async/sync-обработчиков -> в общий обработчик
const h = (fn) => (req, res, next) => {
  try {
    fn(req, res, next);
  } catch (e) {
    next(e);
  }
};

// ---------- публичное ----------
app.get('/api/config', (_req, res) =>
  res.json({
    brand: process.env.BRAND_NAME || 'Билеты',
    footer: process.env.TICKET_FOOTER || '',
    locale: process.env.LOCALE || 'ru-RU',
  })
);
app.post('/api/login', h(login));
app.post('/api/logout', logout);
app.get('/api/me', (req, res) => res.json({ role: roleFromRequest(req) }));

// ---------- смена ----------
app.get('/api/shift', need('operator'), h((_req, res) => {
  const s = currentShift();
  res.json({ shift: s, tickets: s ? db.prepare('SELECT COUNT(*) c FROM tickets WHERE shift_id=? AND cancelled=0').get(s.id).c : 0 });
}));
app.post('/api/shift/open', need('operator'), h((req, res) => res.json({ shift: openShift(req.role) })));
app.post('/api/shift/close', need('operator'), async (_req, res, next) => {
  try {
    res.json(await closeShift());
  } catch (e) {
    next(e);
  }
});

// ---------- настройки (админ) ----------
app.get('/api/settings', need('admin'), h((_req, res) => res.json({ export_dir: getExportDir(), default_dir: defaultExportDir() })));
app.put('/api/settings', need('admin'), h((req, res) => {
  try {
    res.json({ export_dir: setExportDir(req.body?.export_dir) });
  } catch (e) {
    throw new HttpError(400, `Папка недоступна: ${e.message}`);
  }
}));

// ---------- фильмы ----------
app.get('/api/films', need('operator'), h((req, res) => {
  const all = req.query.all === '1' && req.role === 'admin';
  const films = db.prepare(`SELECT * FROM films ${all ? '' : 'WHERE active = 1'} ORDER BY id`).all();
  const shift = currentShift();
  res.json(
    films.map((f) => {
      const info = shift && f.active ? nextSlot(f, shift.id) : null;
      return { ...f, next_at: info?.slotAt ?? null, closed: info?.closed ?? false, waiting: info?.waiting ?? 0 };
    })
  );
}));

function filmInput(b) {
  const name = String(b?.name ?? '').trim();
  const prefix = String(b?.prefix ?? '').trim().toUpperCase();
  const slot = Number(b?.slot_minutes);
  const time = (v) => {
    v = String(v ?? '').trim();
    if (!v) return null;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new HttpError(400, 'Время должно быть в формате ЧЧ:ММ');
    return v;
  };
  if (!name || name.length > 60) throw new HttpError(400, 'Укажите название (до 60 символов)');
  if (!/^[A-ZА-Я0-9]{1,3}$/.test(prefix)) throw new HttpError(400, 'Буква номерка: 1-3 символа (A, Б, 5D...)');
  if (!Number.isInteger(slot) || slot < 1 || slot > 240) throw new HttpError(400, 'Минут на человека: от 1 до 240');
  return { name, prefix, slot_minutes: slot, open_time: time(b.open_time), close_time: time(b.close_time), active: b.active === false || b.active === 0 ? 0 : 1 };
}

app.post('/api/films', need('admin'), h((req, res) => {
  const f = filmInput(req.body);
  const r = db
    .prepare('INSERT INTO films (name,prefix,slot_minutes,open_time,close_time,active) VALUES (?,?,?,?,?,?)')
    .run(f.name, f.prefix, f.slot_minutes, f.open_time, f.close_time, f.active);
  res.json({ id: Number(r.lastInsertRowid) });
}));
app.put('/api/films/:id', need('admin'), h((req, res) => {
  const f = filmInput(req.body);
  db.prepare('UPDATE films SET name=?,prefix=?,slot_minutes=?,open_time=?,close_time=?,active=? WHERE id=?')
    .run(f.name, f.prefix, f.slot_minutes, f.open_time, f.close_time, f.active, req.params.id);
  res.json({ ok: true });
}));
app.delete('/api/films/:id', need('admin'), h((req, res) => {
  const used = db.prepare('SELECT COUNT(*) c FROM tickets WHERE film_id=?').get(req.params.id).c;
  if (used) throw new HttpError(409, 'По фильму есть выданные номерки. Лучше отключите его (галочка «активен»), чтобы сохранить историю.');
  db.prepare('DELETE FROM films WHERE id=?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- номерки ----------
app.post('/api/films/:id/ticket', need('operator'), h((req, res) => res.json(issueTicket(Number(req.params.id)))));

const filmOf = (id) => db.prepare('SELECT * FROM films WHERE id=?').get(id);

app.get('/api/tickets', need('operator'), h((req, res) => {
  let shiftId;
  if (req.query.shift && req.role === 'admin') shiftId = Number(req.query.shift);
  else shiftId = currentShift()?.id;
  if (!shiftId) return res.json([]);
  const rows = db.prepare('SELECT * FROM tickets WHERE shift_id=? ORDER BY id DESC').all(shiftId);
  res.json(rows.map((t) => ticketView(t, filmOf(t.film_id))));
}));
app.get('/api/tickets/:id', need('operator'), h((req, res) => {
  const t = db.prepare('SELECT * FROM tickets WHERE id=?').get(req.params.id);
  if (!t) throw new HttpError(404, 'Не найден');
  res.json(ticketView(t, filmOf(t.film_id)));
}));
app.post('/api/tickets/:id/cancel', need('admin'), h((req, res) => {
  db.prepare('UPDATE tickets SET cancelled=1 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- история (админ) ----------
app.get('/api/shifts', need('admin'), h((_req, res) => {
  const shifts = db.prepare('SELECT * FROM shifts ORDER BY id DESC LIMIT 200').all();
  const per = db.prepare(
    `SELECT f.name, COUNT(t.id) c FROM tickets t JOIN films f ON f.id=t.film_id
     WHERE t.shift_id=? AND t.cancelled=0 GROUP BY f.id ORDER BY f.id`
  );
  res.json(shifts.map((s) => ({ ...s, films: per.all(s.id).map((r) => ({ name: r.name, count: r.c })) })));
}));

app.get('/api/shifts/:id/xlsx', need('admin'), async (req, res, next) => {
  try {
    const { buffer, name } = await workbookBuffer(Number(req.params.id));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.send(Buffer.from(buffer));
  } catch (e) {
    next(new HttpError(404, e.message));
  }
});

app.get('/api/backup', need('admin'), h((_req, res) => {
  const file = backupDb('-manual');
  res.download(file);
}));

// ---------- фронтенд ----------
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.send('Фронтенд не собран. Выполните: npm run build'));
}

app.use((err, _req, res, _next) => {
  if (!(err instanceof HttpError)) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Внутренняя ошибка' });
});

app.listen(PORT, HOST, () => {
  console.log(`Готово: http://localhost:${PORT}  (база: ${DB_FILE})`);
});
