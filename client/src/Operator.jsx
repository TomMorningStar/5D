import { useCallback, useEffect, useState } from 'react';
import { api, fmtDateTime, fmtTime } from './api.js';

export default function Operator({ onPrint, notify }) {
  const [films, setFilms] = useState([]);
  const [shift, setShift] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, f, t] = await Promise.all([api.get('/api/shift'), api.get('/api/films'), api.get('/api/tickets')]);
      setShift(s.shift);
      setFilms(f);
      setTickets(t);
    } catch (e) {
      notify(e.message);
    }
  }, [notify]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  async function issue(film) {
    if (busy) return;
    setBusy(true);
    try {
      const t = await api.post(`/api/films/${film.id}/ticket`);
      onPrint(t);
    } catch (e) {
      notify(e.message);
    } finally {
      await load();
      setBusy(false);
    }
  }

  async function openShift() {
    try { await api.post('/api/shift/open'); } catch (e) { notify(e.message); }
    load();
  }
  async function closeShift() {
    if (!confirm('Закрыть смену? Новые номерки выдавать будет нельзя, пока не начнёте следующую.')) return;
    try {
      const r = await api.post('/api/shift/close');
      if (r.file) notify(`Смена закрыта. Таблица сохранена: ${r.file}`, 'ok');
      else notify(`Смена закрыта, но Excel не сохранился: ${r.exportError}. Сообщите администратору.`);
    } catch (e) { notify(e.message); }
    load();
  }
  async function reprint(id) {
    try { onPrint(await api.get(`/api/tickets/${id}`)); } catch (e) { notify(e.message); }
  }

  return (
    <div className="page">
      <div className="card shiftbar">
        <div className="state">
          <span className={`dot ${shift ? 'on' : ''}`} />
          {shift ? (
            <>Смена открыта с {fmtDateTime(shift.opened_at)} · выдано номерков: {tickets.filter((t) => !t.cancelled).length}</>
          ) : (
            <>Смена не открыта</>
          )}
        </div>
        {shift ? (
          <button className="btn danger" onClick={closeShift}>Закончить смену</button>
        ) : (
          <button className="btn primary" onClick={openShift}>Начать смену</button>
        )}
      </div>

      <div className="films">
        {films.map((f) => (
          <button key={f.id} className="film-btn" disabled={!shift || f.closed || busy} onClick={() => issue(f)}>
            <div>
              <div className="film-title">{f.name}</div>
              <div className="film-meta">{f.slot_minutes} мин на человека · в очереди: {f.waiting}</div>
            </div>
            {shift && (f.closed
              ? <div className="film-closed">Запись закончена</div>
              : <div className="film-time"><span className="film-meta">Следующий: </span>{fmtTime(f.next_at)}</div>)}
          </button>
        ))}
        {!films.length && <div className="muted">Нет фильмов. Администратор должен добавить их во вкладке «Фильмы».</div>}
      </div>

      <h3>Выданные в этой смене</h3>
      <div className="card">
        <table>
          <thead><tr><th>Номер</th><th>Фильм</th><th>Выдан</th><th>Прийти к</th><th /></tr></thead>
          <tbody>
            {tickets.slice(0, 30).map((t) => (
              <tr key={t.id} className={t.cancelled ? 'cancelled' : ''}>
                <td><b>{t.number}</b></td>
                <td>{t.film}</td>
                <td>{fmtTime(t.issued_at)}</td>
                <td>{fmtTime(t.slot_at)}</td>
                <td>{!t.cancelled && <button className="btn small" onClick={() => reprint(t.id)}>Печать ещё раз</button>}</td>
              </tr>
            ))}
            {!tickets.length && <tr><td colSpan="5" className="muted">Пока пусто</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
