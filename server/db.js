import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });

export const DB_FILE = path.join(DATA_DIR, 'tickets.db');
export const db = new DatabaseSync(DB_FILE);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS films (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  prefix       TEXT    NOT NULL,           -- буква номерка, напр. "A"
  slot_minutes INTEGER NOT NULL,           -- сколько минут на одного человека
  open_time    TEXT,                       -- "HH:MM" - раньше этого времени не назначаем
  close_time   TEXT,                       -- "HH:MM" - позже этого времени не назначаем
  active       INTEGER NOT NULL DEFAULT 1
);

-- смена: оператор открывает и закрывает; у каждой смены своя очередь и нумерация
CREATE TABLE IF NOT EXISTS shifts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  opened_by TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  film_id   INTEGER NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  shift_id  INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  seq       INTEGER NOT NULL,              -- номер внутри смены и фильма
  slot_at   INTEGER NOT NULL,              -- на какое время приглашён (ms)
  issued_at INTEGER NOT NULL,              -- когда выдан (ms)
  cancelled INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tickets_shift_film ON tickets(shift_id, film_id);
`);

// Первый запуск: один фильм по умолчанию. 5 минут сеанс + 1 минута запас = 6 минут на человека.
// Админ может изменить или добавить фильмы во вкладке «Фильмы».
if (db.prepare('SELECT COUNT(*) AS c FROM films').get().c === 0) {
  db.prepare('INSERT INTO films (name, prefix, slot_minutes) VALUES (?, ?, ?)').run('5D кинотеатр', 'A', 6);
}

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// Копия базы в data/backups (хранится последние 30)
export function backupDb(tag = '') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(DATA_DIR, 'backups', `tickets-${stamp}${tag}.db`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const all = fs
    .readdirSync(path.join(DATA_DIR, 'backups'))
    .filter((f) => f.endsWith('.db'))
    .sort();
  for (const old of all.slice(0, Math.max(0, all.length - 30))) {
    fs.unlinkSync(path.join(DATA_DIR, 'backups', old));
  }
  return file;
}
