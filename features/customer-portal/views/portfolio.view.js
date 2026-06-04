/**
 * VIEWS · portfolio — «أعمالي»: معرض أعمال العميل + رفع/حذف (صور/فيديو/PDF).
 * الرفع/الحفظ عبر Services (storage-helpers + clientActions · H1.1 · S1). (STANDARDS §6 · L1)
 */
import { escapeHtml, qs } from '../utils/dom.js';
import { Card, Button, EmptyState } from '../components/index.js';
import { worksLimit } from '../../../core/entitlements.js';

const MAX_BYTES = 60 * 1024 * 1024;
const okType = (f) => /^image\//.test(f.type) || /^video\//.test(f.type) || f.type === 'application/pdf';

function media(w) {
  const url = escapeHtml(w.url || '');
  if (w.type === 'video') return `<video class="cp-thumb" src="${url}" controls preload="none"></video>`;
  if (w.type === 'pdf') return `<a class="cp-thumb cp-thumb--file" href="${url}" target="_blank" rel="noopener" aria-label="ملف PDF">📄</a>`;
  return `<img class="cp-thumb" loading="lazy" src="${url}" alt="${escapeHtml(w.name || 'عمل')}">`;
}

export function create(ctx) {
  const { services, store, shell } = ctx;
  let works = [];
  let busy = false;

  const uid = () => store.get('user')?.uid || '';
  const email = () => store.get('user')?.email || '';
  const uname = () => store.get('client')?.name || store.get('user')?.displayName || 'عميل';
  // استهلاك الاستحقاق المركزي (Premium gating): سقف الأعمال حسب الخطة الموثوقة (subscriptions).
  const planCard = () => store.get('entitlement') || { plan: 'free' };
  const cap = () => worksLimit(planCard());
  const atCap = () => works.length >= cap();

  function tile(w, i) {
    const body = `<div class="cp-stack cp-stack--sm">${media(w)}
      ${w.name ? `<div class="cp-muted">${escapeHtml(w.name)}</div>` : ''}
      ${Button({ label: 'حذف', icon: '🗑', variant: 'danger', size: 'sm', block: false, action: `del:${i}` })}</div>`;
    return Card({ body });
  }

  function uploader() {
    const limit = cap();
    const counter = Number.isFinite(limit) ? ` (${works.length}/${limit})` : '';
    const fileInput = '<input type="file" id="pf-file" accept="image/*,video/*,application/pdf" hidden>';
    if (atCap()) {
      return `<div class="cp-cta-banner">
        <div class="cp-cta-banner__title">⭐ وصلت حدّ خطتك المجانية${counter}</div>
        <div class="cp-muted">رقِّ خطتك لرفع أعمال غير محدودة.</div>
        ${Button({ label: 'ترقية الخطة', icon: '⭐', action: 'upgrade' })}
      </div>${fileInput}`;
    }
    return `${fileInput}${Button({ label: (busy ? 'جاري الرفع…' : 'أضف عملاً') + counter, icon: '➕', action: 'pick', loading: busy, disabled: busy })}`;
  }

  function html() {
    if (!works.length) {
      return `<div class="cp-stack cp-stack--lg">
        <h2 class="cp-sec">أعمالي</h2>
        ${EmptyState({ icon: '📁', title: 'لا توجد أعمال بعد',
          hint: 'أضِف صور/فيديو/ملفات أعمالك لتظهر في كارتك الرقمي.', action: uploader() })}
      </div>`;
    }
    return `<div class="cp-stack cp-stack--lg">
      <div class="cp-row cp-row--between"><h2 class="cp-sec">أعمالي (${works.length})</h2></div>
      ${uploader()}
      <div class="cp-grid cp-grid--2">${works.map(tile).join('')}</div>
    </div>`;
  }

  const paint = () => ctx.repaint(html());

  return {
    async mount() {
      let client = store.get('client');
      if (!client && uid()) { client = await services.profile.loadClient(uid()); store.set({ client }); }
      works = Array.isArray(client?.businessProfile?.works) ? client.businessProfile.works.slice() : [];
      return html();
    },
    async onAction(a) {
      if (a === 'upgrade') return ctx.openChat({ kind: 'support' });
      if (a === 'pick' && !busy) { qs('#pf-file', document)?.click(); return; }
      if (a.startsWith('del:')) {
        const i = parseInt(a.slice(4), 10);
        const removed = works[i];
        works.splice(i, 1); paint();
        const r = await services.profile.removeWork({ uid: uid(), email: email(), name: uname(), index: i });
        if (!r?.ok) { works.splice(i, 0, removed); paint(); shell.notify('تعذّر الحذف', 'danger'); }
        else shell.notify('تم الحذف ✅', 'ok');
      }
    },
    async onUpload(input) {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file || busy) return;
      if (atCap()) { shell.notify(`وصلت حدّ خطتك (${cap()} عمل) — رقِّ خطتك للمزيد`, 'danger'); return; }
      if (!okType(file)) { shell.notify('يُسمح بصور/فيديو/PDF فقط', 'danger'); return; }
      if (file.size > MAX_BYTES) { shell.notify('الحجم الأقصى 60 ميجا', 'danger'); return; }
      busy = true; paint();
      try {
        const r = await services.profile.addWork({ uid: uid(), email: email(), name: uname(), file });
        busy = false;
        if (r?.ok && r.work) { works.push(r.work); paint(); shell.notify('تم إضافة العمل ✅', 'ok'); }
        else { paint(); shell.notify((r?.errors && r.errors[0]) || 'تعذّر الرفع', 'danger'); }
      } catch (e) {
        busy = false; paint();
        shell.notify('تعذّر الرفع: ' + ((e && e.message) || ''), 'danger');
      }
    },
  };
}
