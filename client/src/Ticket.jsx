import { fmtDate, fmtTime } from './api.js';

// Содержимое печатаемого номерка. Размеры и цвета - в theme.css (--ticket-*)
export default function Ticket({ ticket, config }) {
  if (!ticket) return null;
  return (
    <div className="ticket">
      <div className="t-brand">{config.brand}</div>
      <div className="t-film">{ticket.film}</div>
      <div className="t-number">{ticket.number}</div>
      <div className="t-label">Приходите к</div>
      <div className="t-time">{fmtTime(ticket.slot_at)}</div>
      {typeof ticket.ahead === 'number' && <div className="t-small">Перед вами: {ticket.ahead}</div>}
      <div className="t-small">
        {fmtDate(ticket.issued_at)} · выдан {fmtTime(ticket.issued_at)}
      </div>
      {config.footer && <div className="t-small">{config.footer}</div>}
    </div>
  );
}
