import { db, tx, backupDb } from './db.js';
import { saveShiftXlsx } from './export.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// "HH:MM" -> ms этого времени сегодня (локальное время ПК)
function atTime(hhmm, ref) {
  const [h, m] = hhmm.split(':').map(Number);
  const x = new Date(ref);
  x.setHours(h, m, 0, 0);
  return x.getTime();
}

export const numberOf = (film, seq) => `${film.prefix}${String(seq).padStart(3, '0')}`;

// ---------- смены ----------

export const currentShift = () =>
  db.prepare('SELECT * FROM shifts WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1').get() || null;

export function openShift(role) {
  return tx(() => {
    if (currentShift()) throw new HttpError(409, 'Смена уже открыта');
    const r = db
      .prepare('INSERT INTO shifts (opened_at, opened_by) VALUES (?, ?)')
      .run(Date.now(), role);
    return db.prepare('SELECT * FROM shifts WHERE id = ?').get(Number(r.lastInsertRowid));
  });
}

// Закрывает смену, сохраняет Excel в настроенную папку и делает копию базы.
// Сбой экспорта не мешает закрытию: данные всё равно в базе, Excel можно скачать из истории.
export async function closeShift() {
  const s = currentShift();
  if (!s) throw new HttpError(409, 'Нет открытой смены');
  db.prepare('UPDATE shifts SET closed_at = ? WHERE id = ?').run(Date.now(), s.id);

  let file = null;
  let exportError = null;
  try {
    file = await saveShiftXlsx(s.id);
  } catch (e) {
    console.error('Не удалось сохранить Excel:', e);
    exportError = e.message;
  }
  try {
    backupDb(`-shift${s.id}`);
  } catch (e) {
    console.error('Не удалось сделать копию базы:', e.message);
  }
  return { shift: db.prepare('SELECT * FROM shifts WHERE id = ?').get(s.id), file, exportError };
}

// ---------- очередь ----------

/**
 * Время для следующего номерка фильма в смене.
 * Первый - "сейчас" (или open_time, если ещё рано), каждый следующий -
 * через slot_minutes после предыдущего.
 * Пример: 6 мин, сейчас 18:00 -> 18:00, 18:06, ... 6-й = 18:30.
 */
export function nextSlot(film, shiftId, now = new Date()) {
  const nowMs = now.getTime();
  let base = nowMs;
  if (film.open_time) base = Math.max(base, atTime(film.open_time, now));

  const last = db
    .prepare('SELECT MAX(slot_at) AS m FROM tickets WHERE film_id = ? AND shift_id = ? AND cancelled = 0')
    .get(film.id, shiftId).m;

  const slotMs = film.slot_minutes * 60000;
  const slotAt = last != null ? Math.max(base, last + slotMs) : base;
  const closed = !!film.close_time && slotAt >= atTime(film.close_time, now);

  const waiting = db
    .prepare(
      'SELECT COUNT(*) AS c FROM tickets WHERE film_id = ? AND shift_id = ? AND cancelled = 0 AND slot_at + ? > ?'
    )
    .get(film.id, shiftId, slotMs, nowMs).c;

  return { slotAt, closed, waiting };
}

export function ticketView(t, film) {
  return {
    id: t.id,
    number: numberOf(film, t.seq),
    film: film.name,
    film_id: film.id,
    shift_id: t.shift_id,
    slot_at: t.slot_at,
    issued_at: t.issued_at,
    cancelled: !!t.cancelled,
  };
}

export function issueTicket(filmId) {
  return tx(() => {
    const shift = currentShift();
    if (!shift) throw new HttpError(409, 'Смена не открыта. Начните смену.');

    const film = db.prepare('SELECT * FROM films WHERE id = ? AND active = 1').get(filmId);
    if (!film) throw new HttpError(404, 'Фильм не найден или отключён');

    const now = new Date();
    const { slotAt, closed, waiting } = nextSlot(film, shift.id, now);
    if (closed) throw new HttpError(409, 'На сегодня запись на этот фильм закончилась');

    const { s } = db
      .prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM tickets WHERE film_id = ? AND shift_id = ?')
      .get(film.id, shift.id);

    const seq = s + 1;
    const issuedAt = now.getTime();
    const r = db
      .prepare('INSERT INTO tickets (film_id, shift_id, seq, slot_at, issued_at) VALUES (?, ?, ?, ?, ?)')
      .run(film.id, shift.id, seq, slotAt, issuedAt);

    const t = { id: Number(r.lastInsertRowid), shift_id: shift.id, seq, slot_at: slotAt, issued_at: issuedAt, cancelled: 0 };
    return { ...ticketView(t, film), ahead: waiting };
  });
}
