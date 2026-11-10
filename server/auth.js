import crypto from 'node:crypto';
import { HttpError } from './queue.js';

const SECRET = process.env.SESSION_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const OPERATOR_PASSWORD = process.env.OPERATOR_PASSWORD;
const HOURS = Number(process.env.SESSION_HOURS || 12);

if (!SECRET || !ADMIN_PASSWORD || !OPERATOR_PASSWORD) {
  console.error('Заполните SESSION_SECRET, ADMIN_PASSWORD и OPERATOR_PASSWORD в файле .env');
  process.exit(1);
}

const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('hex');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function roleFromRequest(req) {
  const token = readCookie(req, 'tk');
  if (!token) return null;
  const [role, exp, sig] = token.split('.');
  if (!role || !exp || !sig) return null;
  if (!safeEqual(sig, sign(`${role}.${exp}`))) return null;
  if (Number(exp) < Date.now()) return null;
  return role === 'admin' || role === 'operator' ? role : null;
}

// простая защита от подбора пароля
const fails = new Map();
export function login(req, res) {
  const ip = req.ip;
  const f = fails.get(ip) || { n: 0, until: 0 };
  if (f.until > Date.now()) throw new HttpError(429, 'Слишком много попыток, подождите несколько минут');

  const pw = String(req.body?.password ?? '');
  let role = null;
  if (safeEqual(pw, ADMIN_PASSWORD)) role = 'admin';
  else if (safeEqual(pw, OPERATOR_PASSWORD)) role = 'operator';

  if (!role) {
    f.n += 1;
    if (f.n >= 8) {
      f.until = Date.now() + 5 * 60000;
      f.n = 0;
    }
    fails.set(ip, f);
    throw new HttpError(401, 'Неверный пароль');
  }
  fails.delete(ip);
  const exp = Date.now() + HOURS * 3600000;
  const token = `${role}.${exp}.${sign(`${role}.${exp}`)}`;
  res.setHeader('Set-Cookie', `tk=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${HOURS * 3600}`);
  res.json({ role });
}

export function logout(_req, res) {
  res.setHeader('Set-Cookie', 'tk=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
}

// need('operator') пускает оператора и админа; need('admin') - только админа
export const need = (level) => (req, _res, next) => {
  const role = roleFromRequest(req);
  if (!role) return next(new HttpError(401, 'Нужен вход'));
  if (level === 'admin' && role !== 'admin') return next(new HttpError(403, 'Только для администратора'));
  req.role = role;
  next();
};
