/**
 * features/design/views/library-view.js
 *
 * Tab "المكتبة" — يعرض تصاميم العملاء.
 * يحل محل client-design-library.html.
 *
 * RULE 8 enforced: phone عرض مُقنَّع للأدوار غير المصرَّحة.
 */

import { subscribeDesignItems, subscribeClients } from '../repository.js';
import { canSeePhone, displayPhone } from '../permissions.js';
import { $, escapeHtml, fn, debounce, setText } from '../components/utils.js';
import { libraryCard, clientCard } from '../components/grid-card.js';

const state = {
  items: [],
  clients: [],
  activeClientId: '',
  activeFilter: '',
  searchTerm: '',
  unsubItems: null,
  unsubClients: null,
  role: null,
  userPerms: null,
  onOpenWorkItem: null,
};

export function mountLibraryView({ container, role, userPerms, onOpenWorkItem }) {
  state.role = role;
  state.userPerms = userPerms;
  state.onOpenWorkItem = onOpenWorkItem || (() => {});

  container.innerHTML = `
    <div class="dh-lib-stats" id="dh-lib-stats"></div>

    <div class="dh-toolbar">
      <input type="text" class="dh-search" id="dh-lib-search" placeholder="🔍 بحث عن عميل أو تصميم…">
      <button class="dh-back-btn" id="dh-lib-back" style="display:none">← كل العملاء</button>
    </div>

    <div class="dh-chips" id="dh-lib-chips"></div>
    <div class="dh-sub" id="dh-lib-sub"></div>

    <div id="dh-lib-body">
      <div class="dh-loader"><div class="dh-spinner"></div></div>
    </div>
  `;

  $('dh-lib-search').addEventListener('input', debounce(() => {
    state.searchTerm = ($('dh-lib-search').value || '').toLowerCase().trim();
    render();
  }, 200));

  $('dh-lib-back').addEventListener('click', () => {
    setClient('');
  });

  $('dh-lib-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('.dh-chip');
    if (!btn) return;
    state.activeFilter = btn.dataset.filter || '';
    render();
  });

  $('dh-lib-body').addEventListener('click', (e) => {
    const clientCardEl = e.target.closest('[data-action="open-client"]');
    if (clientCardEl) {
      setClient(clientCardEl.dataset.clientId);
      return;
    }
    const itemCardEl = e.target.closest('[data-action="open-work-item"]');
    if (itemCardEl) {
      const orderId = itemCardEl.dataset.orderId;
      const itemId = itemCardEl.dataset.itemId;
      state.onOpenWorkItem({ orderId, itemId });
    }
  });

  // Subscribe
  state.unsubItems = subscribeDesignItems({
    scope: 'all',
    onUpdate: (items) => {
      state.items = items;
      render();
    },
    onError: (err) => console.error('[library-view] items error:', err),
  });
  state.unsubClients = subscribeClients({
    onUpdate: (clients) => {
      state.clients = clients;
      render();
    },
    onError: (err) => console.error('[library-view] clients error:', err),
  });
}

export function unmountLibraryView() {
  state.unsubItems?.();
  state.unsubClients?.();
  state.unsubItems = null;
  state.unsubClients = null;
}

function setClient(cid) {
  state.activeClientId = cid;
  state.activeFilter = '';
  render();
  const url = new URL(location.href);
  if (cid) url.searchParams.set('client', cid);
  else url.searchParams.delete('client');
  history.replaceState({}, '', url);
}

function render() {
  if (!state.items.length && !state.clients.length) {
    $('dh-lib-body').innerHTML = '<div class="dh-loader"><div class="dh-spinner"></div></div>';
    return;
  }
  if (state.activeClientId) renderClientMode();
  else renderAllClientsMode();
}

function renderAllClientsMode() {
  $('dh-lib-back').style.display = 'none';
  $('dh-lib-chips').innerHTML = '';

  const byClient = new Map();
  for (const it of state.items) {
    const cid = it.clientId || '_unknown';
    if (!byClient.has(cid)) {
      byClient.set(cid, {
        items: [],
        name: it.clientName || '—',
        phone: '',
      });
    }
    byClient.get(cid).items.push(it);
  }
  // enrich with client phone (لو الدور يقدر يشوفها)
  if (canSeePhone(state.role, state.userPerms)) {
    for (const c of state.clients) {
      const g = byClient.get(c._id || c.id);
      if (g) g.phone = c.phone || c.phone1 || '';
    }
  }

  const totalItems = state.items.length;
  const totalClients = byClient.size;
  $('dh-lib-stats').innerHTML = `
    <div class="dh-stat"><div class="dh-stat-val">${fn(totalClients)}</div><div class="dh-stat-lbl">👥 عميل</div></div>
    <div class="dh-stat"><div class="dh-stat-val">${fn(totalItems)}</div><div class="dh-stat-lbl">🎨 تصميم</div></div>
  `;

  let entries = [...byClient.entries()];
  if (state.searchTerm) {
    entries = entries.filter(([_, g]) => (g.name || '').toLowerCase().includes(state.searchTerm));
  }
  entries.sort((a, b) => b[1].items.length - a[1].items.length);

  setText('dh-lib-sub', `${totalClients} عميل · ${totalItems} تصميم`);

  if (!entries.length) {
    $('dh-lib-body').innerHTML = `<div class="dh-empty"><div class="dh-empty-ico">🎨</div><div>لا توجد تصاميم بعد</div></div>`;
    return;
  }

  const showPhone = canSeePhone(state.role, state.userPerms);
  $('dh-lib-body').innerHTML = `<div class="dh-clients">${entries.map(([cid, g]) => {
    const ctx = {
      showPhone,
      maskedPhone: showPhone ? g.phone : displayPhone(g.phone, state.role, state.userPerms),
    };
    return clientCard(cid, g, ctx);
  }).join('')}</div>`;
}

function renderClientMode() {
  $('dh-lib-back').style.display = '';
  const items = state.items.filter(i => (i.clientId || '') === state.activeClientId);
  const clientName = items[0]?.clientName
    || state.clients.find(c => (c._id || c.id) === state.activeClientId)?.name
    || 'العميل';

  setText('dh-lib-sub', `${escapeHtml(clientName)} · ${items.length} تصميم`);

  const approved = items.filter(i => i.isApproved).length;
  const printReady = items.filter(i => i.isPrintReady).length;
  const published = items.filter(i => i.visibility === 'published').length;
  $('dh-lib-stats').innerHTML = `
    <div class="dh-stat"><div class="dh-stat-val">${fn(items.length)}</div><div class="dh-stat-lbl">🎨 تصميم</div></div>
    <div class="dh-stat"><div class="dh-stat-val">${fn(approved)}</div><div class="dh-stat-lbl">✅ معتمد</div></div>
    <div class="dh-stat"><div class="dh-stat-val">${fn(printReady)}</div><div class="dh-stat-lbl">🖨️ جاهز للطباعة</div></div>
    <div class="dh-stat"><div class="dh-stat-val">${fn(published)}</div><div class="dh-stat-lbl">👁 منشور للعميل</div></div>
  `;

  const chips = [
    { v: '', label: 'الكل', n: items.length },
    { v: 'approved', label: '✅ معتمد', n: approved },
    { v: 'print-ready', label: '🖨️ جاهز للطباعة', n: printReady },
    { v: 'published', label: '👁 منشور', n: published },
  ];
  $('dh-lib-chips').innerHTML = chips.map(c =>
    `<button class="dh-chip ${state.activeFilter === c.v ? 'active' : ''}" data-filter="${c.v}">${c.label} <span class="dh-chip-count">${c.n}</span></button>`
  ).join('');

  let filtered = items;
  if (state.activeFilter === 'approved') filtered = filtered.filter(i => i.isApproved);
  else if (state.activeFilter === 'print-ready') filtered = filtered.filter(i => i.isPrintReady);
  else if (state.activeFilter === 'published') filtered = filtered.filter(i => i.visibility === 'published');

  if (state.searchTerm) {
    filtered = filtered.filter(i =>
      (i.itemName || '').toLowerCase().includes(state.searchTerm) ||
      (i.orderCode || '').toLowerCase().includes(state.searchTerm)
    );
  }

  if (!filtered.length) {
    $('dh-lib-body').innerHTML = `<div class="dh-empty"><div class="dh-empty-ico">🔍</div><div>لا نتائج بالفلاتر الحالية</div></div>`;
    return;
  }

  $('dh-lib-body').innerHTML = `<div class="dh-grid">${filtered.map(item => libraryCard(item)).join('')}</div>`;
}
