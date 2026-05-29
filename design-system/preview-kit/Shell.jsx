/* Business2Card ERP UI Kit — shell components (official system v2) */
const { useState, useRef, useEffect } = React;
const { STAGES, STAGE_ORDER, ROLES, NAV, ORDERS, PAY, NOTIFS } = window.B2C;

/* ─────────── Lucide icon (imperatively managed leaf) ───────────
   React owns the <span>; lucide replaces an inner <i> with <svg>.
   Because the span has no React children, there's no diff conflict. */
function Icon({ name, size = 18, color, style, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || !window.lucide) return;
    host.innerHTML = "";
    const i = document.createElement("i");
    i.setAttribute("data-lucide", name);
    host.appendChild(i);
    window.lucide.createIcons();
  }, [name]);
  return <span ref={ref} className={"lic" + (className ? " " + className : "")}
               style={{ fontSize: size, color, ...style }} />;
}

/* ─────────── Sidebar ─────────── */
function Sidebar({ active, onNav, role }) {
  const r = ROLES[role];
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-logo"><Icon name="contact" size={20} color="var(--accent-fg)" /></div>
        <div className="sidebar-brand-text">
          <b>Business2Card</b>
          <small>{r.label}</small>
        </div>
      </div>
      <nav className="sidebar-nav">
        {NAV.map(g => (
          <div className="sidebar-group" key={g.group}>
            <div className="sidebar-group-label">{g.group}</div>
            {g.items.map(it => (
              <a key={it.id} className={"nav-item" + (active === it.id ? " is-active" : "")}
                 onClick={() => onNav(it.id)}>
                <span className="nav-ic"><Icon name={it.ico} size={18} /></span>
                <span>{it.label}</span>
                {it.count && <span className="nav-count">{it.count}</span>}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="sidebar-user">
          <div className="avatar">ع</div>
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>عمر فاروق</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.label}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ─────────── Topbar + Notifications ─────────── */
function Topbar({ title, sub, onLogout }) {
  const [open, setOpen] = useState(false);
  const unread = NOTIFS.filter(n => n.unread).length;
  return (
    <header className="ds-topbar">
      <div>
        <h1 className="ds-topbar-title">{title}</h1>
        {sub && <div className="ds-topbar-sub">{sub}</div>}
      </div>
      <div className="topbar-spacer"></div>
      <button className="ds-btn ds-btn-ghost ds-btn-sm" onClick={onLogout}>
        <Icon name="log-out" size={14} /> خروج
      </button>
      <div style={{ position: "relative" }}>
        <button className="icon-btn" onClick={() => setOpen(o => !o)}>
          <Icon name="bell" size={18} />
          {unread > 0 && <span className="dot">{unread}</span>}
        </button>
        {open && <NotifPanel onClose={() => setOpen(false)} />}
      </div>
    </header>
  );
}

const TONE_BG = { success: "var(--success-soft)", info: "var(--info-soft)", danger: "var(--danger-soft)", neutral: "var(--surface-2)" };
const TONE_FG = { success: "var(--success)", info: "var(--info)", danger: "var(--danger)", neutral: "var(--ink-3)" };

function NotifPanel({ onClose }) {
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 95 }} onClick={onClose}></div>
      <div className="popover" style={{ top: 48, insetInlineStart: 0, width: 300, zIndex: 100 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 14, fontWeight: 700 }}>الإشعارات</div>
        {NOTIFS.map((n, i) => (
          <div key={i} className="notif-item" style={{ background: n.unread ? "var(--accent-soft)" : "transparent" }}>
            <div className="notif-ic" style={{ background: TONE_BG[n.tone], color: TONE_FG[n.tone] }}>
              <Icon name={n.ico} size={15} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{n.time}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ─────────── Shared chips ─────────── */
function StageChip({ stage }) {
  const s = STAGES[stage];
  return <span className={"stage " + s.cls}><Icon name={s.ico} size={11} /> {s.label}</span>;
}
function PayChip({ pay }) {
  const p = PAY[pay];
  return <span className={"status " + p.cls}><Icon name={p.ico} size={11} /> {p.label}</span>;
}
function money(n) { return n.toLocaleString("en-US"); }

/* ─────────── Order card ─────────── */
function OrderCard({ order, onClick }) {
  const s = STAGES[order.stage];
  return (
    <div className="order-card" style={{ "--oc": s.color }} onClick={() => onClick(order)}>
      {order.late && <span className="oc-late status status-danger"><Icon name="alarm-clock" size={11} /> متأخر</span>}
      <div className="oc-id">#{order.id}</div>
      <div className="oc-client">{order.client}</div>
      <div className="oc-req">{order.req}</div>
      <div className="oc-meta">
        <span className="oc-m"><Icon name="user" size={13} /> {order.designer}</span>
        <span className="oc-m"><Icon name="calendar" size={13} /> {order.deadline}</span>
      </div>
      <div className="oc-footer">
        <StageChip stage={order.stage} />
        <span className={"oc-money " + (order.pay === "paid" ? "ds-text-success" : "ds-text-warning")}>
          {money(order.sale)} ج
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { Icon, Sidebar, Topbar, StageChip, PayChip, OrderCard, b2cMoney: money });
