import { useState } from 'react';
import { api } from './api.js';

export default function Login({ brand, onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    try {
      const { role } = await api.post('/api/login', { password });
      onLogin(role);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="card login" onSubmit={submit}>
      <h2>{brand}</h2>
      <label className="muted">Пароль</label>
      <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <div className="error">{error}</div>}
      <button className="btn primary" style={{ width: '100%' }}>Войти</button>
    </form>
  );
}
