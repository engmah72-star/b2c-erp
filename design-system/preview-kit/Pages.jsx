/* Business2Card ERP UI Kit — pages + drawer + login (official system v2) */

/* ─────────── Login ─────────── */
function Login({ onLogin }) {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div className="login-logo">B2C</div>
          <div className="b2c-h3" style={{ fontSize: 20 }}>Business2Card ERP</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4 }}>نظام إدارة المطبعة الداخلي</div>
        </div>
        <div className="ds-card ds-card-lg">
          <div className="field" style={{ marginBottom: 16 }}>
            <span className="field-label">رقم الموبايل</span>
            <div className="input-group">
              <span className="input-icon"><Icon name="phone" size={16} /></span>
              <input className="input" placeholder="01XXXXXXXXX" dir="ltr" style={{ textAlign: "right" }} />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 20 }}>
            <span className="field-label">كلمة السر</span>
            <div className="input-group">
              <span className="input-icon"><Icon name="lock" size={16} /></span>
              <input className="input" type="password" placeholder="••••••••" />
            </div>
          </div>
          <button className="ds-btn ds-btn-primary ds-btn-lg ds-btn-block" onClick={onLogin}>دخول</button>
          <div style={{ textAlign: "center", fontSize: 12, color: "var(--ink-3)", marginTop: 14 }}>
            نسيت كلمة السر؟ كلّم مدير النظام
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Dashboard ─────────── */
function Dashboard({ onOpen }) {
  const counts = {};
  STAGE_ORDER.forEach(s => counts[s] = ORDERS.filter(o => o.stage === s).length);
  const active = ORDERS.filter(o => o.stage !== "archived").slice(0, 4);

  const kpis = [
    { ico: "package", bg: "var(--accent-soft)", fg: "var(--accent)", val: ORDERS.length, lbl: "إجمالي الطلبات", delta: "up", d: "12%" },
    { ico: "wallet", bg: "var(--success-soft)", fg: "var(--success)", val: "128k", lbl: "تحصيل الشهر", delta: "up", d: "8%" },
    { ico: "clock", bg: "var(--warning-soft)", fg: "var(--warning)", val: ORDERS.filter(o => o.pay !== "paid").length, lbl: "بانتظار الدفع", delta: "flat", d: "ثابت" },
    { ico: "alarm-clock", bg: "var(--danger-soft)", fg: "var(--danger)", val: ORDERS.filter(o => o.late).length, lbl: "متأخرة", delta: "down", d: "2" },
  ];

  return (
    <div className="content">
      <div className="stats">
        {kpis.map((k, i) => (
          <div className="ds-kpi" key={i}>
            <div className="ds-kpi-icon" style={{ background: k.bg, color: k.fg }}><Icon name={k.ico} size={18} /></div>
            <span className="ds-kpi-label">{k.lbl}</span>
            <span className="ds-kpi-value ds-kpi-value-sm" style={k.delta === "down" ? { color: "var(--danger)" } : null}>{k.val}</span>
            <span className={"ds-kpi-delta " + k.delta}>
              {k.delta !== "flat" && <Icon name={k.delta === "up" ? "trending-up" : "trending-down"} size={12} />} {k.d}
            </span>
          </div>
        ))}
      </div>

      <div className="pipeline">
        {STAGE_ORDER.map((s, i) => (
          <React.Fragment key={s}>
            <div className="pipe-step">
              <div className="ps-ico"><Icon name={STAGES[s].ico} size={18} color={STAGES[s].color} /></div>
              <div className="ps-count" style={{ color: STAGES[s].color }}>{counts[s]}</div>
              <div className="ps-name">{STAGES[s].label}</div>
            </div>
            {i < STAGE_ORDER.length - 1 && <span className="pipe-arrow"><Icon name="chevron-left" size={16} /></span>}
          </React.Fragment>
        ))}
      </div>

      <div className="ds-card">
        <div className="ds-card-head">
          <div className="ds-card-title">الطلبات النشطة</div>
          <span className="ds-badge ds-badge-accent">{active.length}</span>
        </div>
        {active.map(o => <OrderCard key={o.id} order={o} onClick={onOpen} />)}
      </div>
    </div>
  );
}

/* ─────────── Orders board ─────────── */
function OrdersPage({ onOpen }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  let list = ORDERS;
  if (filter !== "all") list = list.filter(o => o.stage === filter);
  if (q.trim()) list = list.filter(o => (o.client + o.id).includes(q.trim()));

  return (
    <div className="content">
      <div className="toolbar">
        <div className="input-group search-box">
          <span className="input-icon"><Icon name="search" size={16} /></span>
          <input className="input" placeholder="ابحث برقم الطلب أو اسم العميل…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button className="ds-btn ds-btn-primary"><Icon name="plus" size={16} /> طلب جديد</button>
      </div>
      <div className="ds-tabs" style={{ marginBottom: 16 }}>
        <div className={"ds-tab" + (filter === "all" ? " is-active" : "")} onClick={() => setFilter("all")}>الكل</div>
        {STAGE_ORDER.map(s => (
          <div key={s} className={"ds-tab" + (filter === s ? " is-active" : "")} onClick={() => setFilter(s)}>
            <Icon name={STAGES[s].ico} size={14} /> {STAGES[s].label}
          </div>
        ))}
      </div>
      {list.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
          {list.map(o => <OrderCard key={o.id} order={o} onClick={onOpen} />)}
        </div>
      ) : (
        <div className="ds-empty">
          <div className="ds-empty-icon"><Icon name="inbox" size={26} /></div>
          <div className="ds-empty-title">لا توجد طلبات</div>
          <div className="ds-empty-msg">لا يوجد طلبات في هذه المرحلة حالياً.</div>
        </div>
      )}
    </div>
  );
}

/* ─────────── Stub page ─────────── */
function StubPage({ ico, title }) {
  return (
    <div className="content">
      <div className="ds-empty">
        <div className="ds-empty-icon"><Icon name={ico} size={26} /></div>
        <div className="ds-empty-title">{title}</div>
        <div className="ds-empty-msg">
          هذه الشاشة جزء من النظام الكامل. الـ UI kit يركّز على تدفّق الطلبات — صفحتي والطلبات وتفاصيل الطلب.
        </div>
      </div>
    </div>
  );
}

/* ─────────── Order drawer ─────────── */
function OrderDrawer({ order, onClose, onAdvance }) {
  const open = !!order;
  return (
    <>
      <div className={"drawer-backdrop" + (open ? " is-open" : "")} onClick={onClose}></div>
      <div className={"drawer" + (open ? " is-open" : "")}>
        {order && <DrawerInner order={order} onClose={onClose} onAdvance={onAdvance} />}
      </div>
    </>
  );
}

function DrawerInner({ order, onClose, onAdvance }) {
  const s = STAGES[order.stage];
  const curIdx = STAGE_ORDER.indexOf(order.stage);
  const remaining = Math.max(0, order.sale - order.paid);
  const next = s.next;
  return (
    <>
      <div className="drawer-head">
        <div>
          <div className="oc-id" style={{ marginBottom: 6 }}>#{order.id}</div>
          <div className="b2c-h3" style={{ fontSize: 19 }}>{order.client}</div>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <StageChip stage={order.stage} />
            <PayChip pay={order.pay} />
          </div>
        </div>
        <button className="ds-btn ds-btn-ghost ds-btn-icon" onClick={onClose}><Icon name="x" size={18} /></button>
      </div>
      <div className="drawer-body">
        <div className="sp-wrap">
          <div className="sp-row">
            {STAGE_ORDER.map((st, i) => (
              <div key={st} className={"sp-step" + (i < curIdx ? " done" : i === curIdx ? " current" : "")}>
                <div className="sp-dot"><Icon name={i < curIdx ? "check" : STAGES[st].ico} size={18} /></div>
                <div className="sp-name">{STAGES[st].label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="ds-card" style={{ marginBottom: 16, padding: "4px 16px" }}>
          <div className="kv"><span className="kv-k">سعر البيع</span><span className="kv-v b2c-num">{b2cMoney(order.sale)} ج</span></div>
          <div className="kv"><span className="kv-k">المدفوع</span><span className="kv-v b2c-num ds-text-success">{b2cMoney(order.paid)} ج</span></div>
          <div className="kv"><span className="kv-k">المتبقّي</span><span className={"kv-v b2c-num " + (remaining ? "ds-text-danger" : "ds-text-success")}>{b2cMoney(remaining)} ج</span></div>
        </div>

        <div className="ds-card" style={{ marginBottom: 16 }}>
          <div className="ds-card-head" style={{ marginBottom: 12 }}><div className="ds-card-title" style={{ fontSize: 15 }}>المنتجات</div></div>
          {order.products.map((p, i) => (
            <div key={i} className="kv">
              <div><div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{p.spec}</div></div>
              <span className="ds-badge b2c-num">×{p.qty}</span>
            </div>
          ))}
        </div>

        <div className="ds-card">
          <div className="ds-card-head" style={{ marginBottom: 12 }}><div className="ds-card-title" style={{ fontSize: 15 }}>سجلّ الطلب</div></div>
          <ul className="tl">
            <li className="tl-item"><div className="tl-dot"><Icon name={s.ico} size={13} /></div><div>
              <div className="tl-act">المرحلة الحالية: {s.label}</div><div className="tl-meta">{order.designer} · {order.deadline}</div></div></li>
            <li className="tl-item"><div className="tl-dot"><Icon name="wallet" size={13} /></div><div>
              <div className="tl-act">دفعة {b2cMoney(order.paid)} ج</div><div className="tl-meta">خدمة العملاء</div></div></li>
            <li className="tl-item"><div className="tl-dot"><Icon name="plus" size={13} /></div><div>
              <div className="tl-act">تم إنشاء الطلب</div><div className="tl-meta">{order.id}</div></div></li>
          </ul>
        </div>
      </div>
      {next && (
        <div className="drawer-foot">
          <button className="ds-btn ds-btn-ghost" onClick={onClose}>إغلاق</button>
          <button className="ds-btn ds-btn-primary ds-btn-block" onClick={() => onAdvance(order)}>
            <Icon name={STAGES[next].ico} size={16} /> نقل إلى {STAGES[next].label}
          </button>
        </div>
      )}
    </>
  );
}

Object.assign(window, { Login, Dashboard, OrdersPage, StubPage, OrderDrawer });
