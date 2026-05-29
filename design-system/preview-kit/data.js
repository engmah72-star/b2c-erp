/* Business2Card ERP UI Kit — sample data (official system v2)
   Icon fields hold Lucide icon names (stroke SVG), not emoji. */
window.B2C = (function () {
  const STAGES = {
    design:     { label:'تصميم', ico:'pen-tool', cls:'stage-design',     color:'var(--purple)', soft:'var(--purple-soft)',  line:'var(--purple-line)',  next:'printing' },
    printing:   { label:'طباعة', ico:'printer',  cls:'stage-printing',   color:'var(--orange)', soft:'var(--orange-soft)',  line:'var(--orange-line)',  next:'production' },
    production: { label:'تنفيذ', ico:'factory',  cls:'stage-production', color:'var(--info)',   soft:'var(--info-soft)',    line:'var(--info-line)',    next:'shipping' },
    shipping:   { label:'شحن',   ico:'truck',    cls:'stage-shipping',   color:'var(--teal)',   soft:'var(--teal-soft)',    line:'var(--teal-line)',    next:'archived' },
    archived:   { label:'أرشيف', ico:'archive',  cls:'stage-archived',   color:'var(--ink-3)',  soft:'var(--surface-2)',    line:'var(--border)',       next:null },
  };
  const STAGE_ORDER = ['design', 'printing', 'production', 'shipping', 'archived'];

  const ROLES = {
    admin:             { label:'مدير النظام', ico:'crown' },
    operation_manager: { label:'مدير العمليات', ico:'clipboard-list' },
    customer_service:  { label:'خدمة العملاء', ico:'headset' },
  };

  const NAV = [
    { group:'الرئيسية', items:[
      { id:'home',     ico:'layout-dashboard', label:'صفحتي' },
      { id:'orders',   ico:'package', label:'الطلبات', count:'47' },
      { id:'clients',  ico:'users', label:'العملاء' },
      { id:'inbox',    ico:'message-circle', label:'الرسائل', count:'3' },
    ]},
    { group:'التشغيل', items:[
      { id:'design',     ico:'pen-tool', label:'لوحة التصميم' },
      { id:'production', ico:'factory', label:'الإنتاج والطباعة' },
      { id:'shipping',   ico:'truck', label:'الشحن' },
      { id:'approvals',  ico:'check-circle-2', label:'الاعتمادات', count:'5' },
    ]},
    { group:'المالية', items:[
      { id:'accounts', ico:'wallet', label:'الحسابات' },
      { id:'reports',  ico:'bar-chart-3', label:'التقارير' },
    ]},
  ];

  const ORDERS = [
    { id:'ORD-48213', client:'شركة النور للدعاية', req:'1000 كارت شخصي · كوشيه 350 جم', stage:'design',
      pay:'partial', sale:2450, paid:800, deadline:'٢٥ مايو', designer:'سارة أحمد', late:false,
      products:[{name:'كارت شخصي',qty:1000,spec:'كوشيه 350 جم — وش وضهر'}] },
    { id:'ORD-48190', client:'مطعم البيت الدمشقي', req:'بنر 3×2 م · فلكس', stage:'production',
      pay:'partial', sale:1800, paid:900, deadline:'٢٣ مايو', designer:'كريم منير', late:true,
      products:[{name:'بنر فلكس',qty:1,spec:'3×2 متر — مع عيون تثبيت'}] },
    { id:'ORD-48201', client:'عيادة د. هاني سمير', req:'500 وصفة طبية · ورق ٨٠ جم', stage:'printing',
      pay:'paid', sale:600, paid:600, deadline:'٢٤ مايو', designer:'سارة أحمد', late:false,
      products:[{name:'وصفة طبية',qty:500,spec:'A5 — ورق أبيض 80 جم'}] },
    { id:'ORD-48177', client:'بوتيك لمسة أناقة', req:'2000 إكسسوار تعليق · كوشيه', stage:'shipping',
      pay:'paid', sale:3200, paid:3200, deadline:'٢٢ مايو', designer:'منى خالد', late:false,
      products:[{name:'تاج إكسسوار',qty:2000,spec:'كوشيه 300 جم — مقصوص ليزر'}] },
    { id:'ORD-48150', client:'مكتب الإنشاء للمحاماة', req:'300 كارت + ظرف رسمي', stage:'design',
      pay:'pending', sale:1500, paid:0, deadline:'٢٦ مايو', designer:'كريم منير', late:false,
      products:[{name:'كارت شخصي',qty:300,spec:'كلاسيك — تذهيب'},{name:'ظرف رسمي',qty:300,spec:'مقاس DL'}] },
    { id:'ORD-48099', client:'كافيه ضي القمر', req:'منيو 8 صفحات · لاميكو', stage:'production',
      pay:'partial', sale:2750, paid:1500, deadline:'٢٧ مايو', designer:'منى خالد', late:false,
      products:[{name:'منيو',qty:50,spec:'8 صفحات — لاميكو مط'}] },
    { id:'ORD-48044', client:'صيدلية الحياة', req:'1500 كيس ورقي مطبوع', stage:'shipping',
      pay:'paid', sale:4100, paid:4100, deadline:'٢١ مايو', designer:'سارة أحمد', late:false,
      products:[{name:'كيس ورقي',qty:1500,spec:'كرافت بني — طباعة لون واحد'}] },
    { id:'ORD-47980', client:'شركة النور للدعاية', req:'رول أب 85×200', stage:'archived',
      pay:'paid', sale:950, paid:950, deadline:'١٨ مايو', designer:'كريم منير', late:false,
      products:[{name:'رول أب',qty:2,spec:'85×200 سم — استاند معدن'}] },
  ];

  const PAY = {
    paid:    { label:'مدفوع', cls:'status-success', ico:'check-circle-2' },
    partial: { label:'جزئي',  cls:'status-warning', ico:'clock' },
    pending: { label:'بانتظار الدفع', cls:'status-neutral', ico:'circle-dashed' },
  };

  const NOTIFS = [
    { ico:'check-circle-2', tone:'success', title:'تم اعتماد تصميم #ORD-48201', time:'منذ ٥ دقائق', unread:true },
    { ico:'wallet',         tone:'info',    title:'دفعة جديدة 900 ج — البيت الدمشقي', time:'منذ ٢٥ دقيقة', unread:true },
    { ico:'alarm-clock',    tone:'danger',  title:'#ORD-48190 تأخّر عن الموعد', time:'منذ ساعة', unread:true },
    { ico:'truck',          tone:'neutral', title:'تم تسليم #ORD-48044', time:'أمس', unread:false },
  ];

  return { STAGES, STAGE_ORDER, ROLES, NAV, ORDERS, PAY, NOTIFS };
})();
