import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, fmtDateTime, fmtTime } from './api.js';

const empty = { id: null, name: '', prefix: '', slot_minutes: 6, open_time: '', close_time: '', active: true };

export function Films({ notify }) {
  const [films, setFilms] = useState([]);
  const [form, setForm] = useState(null);

  const load = useCallback(() => api.get('/api/films?all=1').then(setFilms).catch((e) => notify(e.message)), [notify]);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save(e) {
    e.preventDefault();
    try {
      const body = { ...form, slot_minutes: Number(form.slot_minutes) };
      if (form.id) await api.put(`/api/films/${form.id}`, body);
      else await api.post('/api/films', body);
      setForm(null);
      load();
    } catch (err) { notify(err.message); }
  }
  async function remove(f) {
    if (!confirm(`Удалить «${f.name}»?`)) return;
    try { await api.del(`/api/films/${f.id}`); load(); } catch (err) { notify(err.message); }
  }

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, marginRight: 'auto' }}>Фильмы</h2>
        <button className="btn primary" onClick={() => setForm(empty)}>+ Добавить</button>
      </div>

      {form && (
        <form className="card form" onSubmit={save} style={{ marginBottom: 20 }}>
          <div className="grid2">
            <div><label>Название</label><input value={form.name} onChange={set('name')} required /></div>
            <div><label>Буква номерка (A, Б, 5D)</label><input value={form.prefix} onChange={set('prefix')} maxLength={3} required /></div>
            <div><label>Минут на одного человека (сеанс + запас, напр. 5 + 1 = 6)</label><input type="number" min="1" max="240" value={form.slot_minutes} onChange={set('slot_minutes')} required /></div>
            <div />
            <div><label>Не раньше (ЧЧ:ММ, необязательно)</label><input value={form.open_time || ''} onChange={set('open_time')} placeholder="10:00" /></div>
            <div><label>Запись до (ЧЧ:ММ, необязательно)</label><input value={form.close_time || ''} onChange={set('close_time')} placeholder="22:00" /></div>
          </div>
          <label className="row"><input type="checkbox" style={{ width: 'auto', margin: 0 }} checked={!!form.active} onChange={set('active')} /> Активен (показывать оператору)</label>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn primary">Сохранить</button>
            <button type="button" className="btn" onClick={() => setForm(null)}>Отмена</button>
          </div>
        </form>
      )}

      <div className="card">
        <table>
          <thead><tr><th>Название</th><th>Буква</th><th>Мин/чел</th><th>Окно</th><th>Статус</th><th /></tr></thead>
          <tbody>
            {films.map((f) => (
              <tr key={f.id}>
                <td>{f.name}</td>
                <td>{f.prefix}</td>
                <td>{f.slot_minutes}</td>
                <td>{f.open_time || '—'} – {f.close_time || '—'}</td>
                <td><span className={`pill ${f.active ? 'ok' : 'off'}`}>{f.active ? 'активен' : 'отключён'}</span></td>
                <td className="row">
                  <button className="btn small" onClick={() => setForm({ ...f, open_time: f.open_time || '', close_time: f.close_time || '' })}>Изменить</button>
                  <button className="btn small danger" onClick={() => remove(f)}>Удалить</button>
                </td>
              </tr>
            ))}
            {!films.length && <tr><td colSpan="6" className="muted">Добавьте первый фильм</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Settings({ notify }) {
  const [dir, setDir] = useState('');
  const [def, setDef] = useState('');

  useEffect(() => {
    api.get('/api/settings').then((s) => { setDir(s.export_dir); setDef(s.default_dir); }).catch((e) => notify(e.message));
  }, [notify]);

  async function save(e) {
    e.preventDefault();
    try {
      const r = await api.put('/api/settings', { export_dir: dir });
      setDir(r.export_dir);
      notify(`Сохранено. Таблицы будут попадать в: ${r.export_dir}`, 'ok');
    } catch (err) { notify(err.message); }
  }

  return (
    <div className="page">
      <h2>Настройки</h2>
      <form className="card form" onSubmit={save} style={{ maxWidth: 640 }}>
        <label>Папка для Excel-таблиц смен</label>
        <input value={dir} onChange={(e) => setDir(e.target.value)} placeholder="D:\Номерки" />
        <div className="muted" style={{ marginBottom: 14 }}>
          Полный путь к папке на этом ПК (на Ubuntu, например, /home/user/nomerki). При закрытии смены туда сохраняется файл
          с названием-датой, например 2026-11-10.xlsx. Если смен в день несколько, добавится (2), (3). Папка создаётся сама.
          Пустое поле вернёт папку по умолчанию: {def}
        </div>
        <button className="btn primary">Сохранить</button>
      </form>
    </div>
  );
}

export function History({ notify }) {
  const [shifts, setShifts] = useState([]);
  const [open, setOpen] = useState(null);
  const [tickets, setTickets] = useState([]);

  const load = useCallback(() => api.get('/api/shifts').then(setShifts).catch((e) => notify(e.message)), [notify]);
  useEffect(() => { load(); }, [load]);

  async function toggle(id) {
    if (open === id) return setOpen(null);
    setOpen(id);
    setTickets(await api.get(`/api/tickets?shift=${id}`).catch(() => []));
  }
  async function cancel(t) {
    if (!confirm(`Аннулировать ${t.number}?`)) return;
    await api.post(`/api/tickets/${t.id}/cancel`).catch((e) => notify(e.message));
    setTickets(await api.get(`/api/tickets?shift=${t.shift_id}`));
    load();
  }

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, marginRight: 'auto' }}>История смен</h2>
        <a className="btn" href="/api/backup">Скачать копию базы</a>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Смена</th><th>Открыта</th><th>Закрыта</th><th>Номерков</th><th /></tr></thead>
          <tbody>
            {shifts.map((s) => (
              <Fragment key={s.id}>
                <tr>
                  <td>№{s.id}</td>
                  <td>{fmtDateTime(s.opened_at)}</td>
                  <td>{s.closed_at ? fmtDateTime(s.closed_at) : <span className="pill ok">идёт</span>}</td>
                  <td>{s.films.map((f) => `${f.name}: ${f.count}`).join(' · ') || '—'}</td>
                  <td className="row">
                    <button className="btn small" onClick={() => toggle(s.id)}>{open === s.id ? 'Скрыть' : 'Номерки'}</button>
                    <a className="btn small" href={`/api/shifts/${s.id}/xlsx`}>Excel</a>
                  </td>
                </tr>
                {open === s.id && (
                  <tr><td colSpan="5">
                    <table>
                      <tbody>
                        {tickets.map((t) => (
                          <tr key={t.id} className={t.cancelled ? 'cancelled' : ''}>
                            <td><b>{t.number}</b></td><td>{t.film}</td>
                            <td>выдан {fmtTime(t.issued_at)}</td><td>на {fmtTime(t.slot_at)}</td>
                            <td>{!t.cancelled && <button className="btn small danger" onClick={() => cancel(t)}>Аннулировать</button>}</td>
                          </tr>
                        ))}
                        {!tickets.length && <tr><td className="muted">Нет номерков</td></tr>}
                      </tbody>
                    </table>
                  </td></tr>
                )}
              </Fragment>
            ))}
            {!shifts.length && <tr><td colSpan="5" className="muted">Смен ещё не было</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
