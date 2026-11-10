async function req(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'Ошибка'), { status: r.status });
  return data;
}

export const api = {
  get: (u) => req('GET', u),
  post: (u, b) => req('POST', u, b ?? {}),
  put: (u, b) => req('PUT', u, b),
  del: (u) => req('DELETE', u),
};

let locale = 'ru-RU';
export const setLocale = (l) => (locale = l);
const o24 = { hour: '2-digit', minute: '2-digit', hour12: false };
export const fmtTime = (ms) => new Date(ms).toLocaleTimeString(locale, o24);
export const fmtDate = (ms) => new Date(ms).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtDateTime = (ms) => `${fmtDate(ms)} ${fmtTime(ms)}`;
