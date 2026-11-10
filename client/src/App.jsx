import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, setLocale } from './api.js';
import Login from './Login.jsx';
import Operator from './Operator.jsx';
import { Films, History, Settings } from './Admin.jsx';
import Ticket from './Ticket.jsx';

export default function App() {
  const [config, setConfig] = useState({ brand: 'Билеты', footer: '', locale: 'ru-RU' });
  const [role, setRole] = useState(undefined); // undefined - грузится, null - не вошли
  const [tab, setTab] = useState('issue');
  const [toast, setToast] = useState(null);
  const [printing, setPrinting] = useState(null);

  useEffect(() => {
    api.get('/api/config').then((c) => { setConfig(c); setLocale(c.locale); document.title = c.brand; });
    api.get('/api/me').then((m) => setRole(m.role));
  }, []);

  // размер страницы печати берём из CSS-переменных (theme.css)
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const w = cs.getPropertyValue('--ticket-width').trim() || '58mm';
    const hgt = cs.getPropertyValue('--ticket-height').trim() || '80mm';
    const el = document.createElement('style');
    el.textContent = `@page { size: ${w} ${hgt}; margin: 0; }`;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);

  const notify = useCallback((msg, kind = 'error') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), kind === 'ok' ? 8000 : 5000);
  }, []);

  // печать: показываем номерок в скрытой области и вызываем окно печати
  useEffect(() => {
    if (!printing) return;
    const id = setTimeout(() => window.print(), 100);
    return () => clearTimeout(id);
  }, [printing]);

  async function logout() {
    await api.post('/api/logout');
    setRole(null);
    setTab('issue');
  }

  if (role === undefined) return null;

  return (
    <Fragment>
      <div className="app">
        {!role ? (
          <Login brand={config.brand} onLogin={setRole} />
        ) : (
          <>
            <div className="topbar">
              <div className="brand">{config.brand}</div>
              <div className="tabs">
                <button className={`tab ${tab === 'issue' ? 'active' : ''}`} onClick={() => setTab('issue')}>Выдача</button>
                {role === 'admin' && (
                  <>
                    <button className={`tab ${tab === 'films' ? 'active' : ''}`} onClick={() => setTab('films')}>Фильмы</button>
                    <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>История</button>
                    <button className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>Настройки</button>
                  </>
                )}
              </div>
              <span className="role">{role === 'admin' ? 'Администратор' : 'Оператор'}</span>
              <button className="btn small" onClick={logout}>Выйти</button>
            </div>
            {tab === 'issue' && <Operator onPrint={setPrinting} notify={notify} />}
            {tab === 'films' && role === 'admin' && <Films notify={notify} />}
            {tab === 'history' && role === 'admin' && <History notify={notify} />}
            {tab === 'settings' && role === 'admin' && <Settings notify={notify} />}
          </>
        )}
        {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      </div>
      <div id="print-area">
        <Ticket ticket={printing} config={config} />
      </div>
    </Fragment>
  );
}
