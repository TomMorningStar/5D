import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR } from './db.js';

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const ymd = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dmyhm = (ms) => `${ymd(ms).split('-').reverse().join('.')} ${hhmm(ms)}`;

// ---------- папка для Excel (настраивается админом) ----------

export const defaultExportDir = () => process.env.EXPORT_DIR || path.join(DATA_DIR, 'exports');

export function getExportDir() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'export_dir'").get();
  return row?.value || defaultExportDir();
}

// Проверяет, что в папку можно писать, и сохраняет её в настройках
export function setExportDir(dir) {
  dir = String(dir ?? '').trim();
  if (!dir) {
    db.prepare("DELETE FROM settings WHERE key = 'export_dir'").run();
    return getExportDir();
  }
  if (!path.isAbsolute(dir)) throw new Error('Укажите полный путь, например D:\\Номерки');
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, `.write-test-${Date.now()}`);
  fs.writeFileSync(probe, 'ok');
  fs.unlinkSync(probe);
  db.prepare("INSERT INTO settings (key, value) VALUES ('export_dir', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(dir);
  return dir;
}

// ---------- сама таблица ----------

export async function buildWorkbook(shiftId) {
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
  if (!shift) throw new Error('Смена не найдена');
  const rows = db
    .prepare(
      `SELECT t.*, f.name AS film, f.prefix FROM tickets t JOIN films f ON f.id = t.film_id
       WHERE t.shift_id = ? ORDER BY t.id`
    )
    .all(shiftId);

  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet('Номерки');
  ws.columns = [
    { header: '№', key: 'n', width: 6 },
    { header: 'Номерок', key: 'num', width: 12 },
    { header: 'Фильм', key: 'film', width: 28 },
    { header: 'Выдан в', key: 'issued', width: 12 },
    { header: 'Прийти к', key: 'slot', width: 12 },
    { header: 'Статус', key: 'status', width: 14 },
  ];
  rows.forEach((t, i) =>
    ws.addRow({
      n: i + 1,
      num: `${t.prefix}${String(t.seq).padStart(3, '0')}`,
      film: t.film,
      issued: hhmm(t.issued_at),
      slot: hhmm(t.slot_at),
      status: t.cancelled ? 'аннулирован' : 'выдан',
    })
  );
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const sum = wb.addWorksheet('Итого');
  sum.columns = [{ width: 30 }, { width: 22 }];
  sum.addRow(['Смена №', shift.id]);
  sum.addRow(['Открыта', dmyhm(shift.opened_at)]);
  sum.addRow(['Закрыта', shift.closed_at ? dmyhm(shift.closed_at) : 'ещё идёт']);
  sum.addRow([]);
  const head = sum.addRow(['Фильм', 'Выдано номерков']);
  head.font = { bold: true };
  const per = new Map();
  for (const t of rows) if (!t.cancelled) per.set(t.film, (per.get(t.film) || 0) + 1);
  for (const [name, c] of per) sum.addRow([name, c]);
  const total = sum.addRow(['Всего', [...per.values()].reduce((a, b) => a + b, 0)]);
  total.font = { bold: true };
  const cancelled = rows.filter((t) => t.cancelled).length;
  if (cancelled) sum.addRow(['Аннулировано', cancelled]);

  return { wb, shift };
}

export async function workbookBuffer(shiftId) {
  const { wb, shift } = await buildWorkbook(shiftId);
  return { buffer: await wb.xlsx.writeBuffer(), name: fileBase(shift) + '.xlsx' };
}

// Название файла - дата дня (когда открыта смена): 2026-11-10.xlsx
const fileBase = (shift) => ymd(shift.opened_at);

// Сохраняет файл в папку; если в этот день уже есть файл, добавляет (2), (3)...
export async function saveShiftXlsx(shiftId) {
  const { wb, shift } = await buildWorkbook(shiftId);
  const dir = getExportDir();
  fs.mkdirSync(dir, { recursive: true });
  let file = path.join(dir, `${fileBase(shift)}.xlsx`);
  for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${fileBase(shift)} (${i}).xlsx`);
  await wb.xlsx.writeFile(file);
  return file;
}
