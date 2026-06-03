/**
 * VIEWS · services-edit — مدير خدمات البروفايل (overlay): إضافة/تعديل/حذف/ترتيب/إظهار.
 * تركيب مكوّنات + نداء Services. الحفظ عبر clientActions (H1.1). (STANDARDS §6 · L1)
 */
import { escapeHtml, qs } from '../utils/dom.js';
import { Card, Button, Input, Badge } from '../components/index.js';
import { cropResize } from '../utils/image.js';
import { normalizeServices } from '../utils/services.js';

export function create(ctx) {
  const { services: svc, store, shell } = ctx;
  let items = [];
  let mode = 'list';   // 'list' | 'form'
  let editIdx = -1;    // -1 = إضافة
  let draftImg = null; // { file, dataUrl } صورة بانتظار الرفع
  let busy = false;

  const uid = () => store.get('user')?.uid || '';
  const email = () => store.get('user')?.email || '';
  const uname = () => store.get('client')?.name || store.get('user')?.displayName || 'عميل';
  const paint = () => { shell.modal.body.innerHTML = mode === 'form' ? form() : listView(); };

  function row(s, i) {
    const thumb = s.imageUrl ? `<img class="cp-thumb cp-thumb--mini" src="${escapeHtml(s.imageUrl)}" alt="">` : '';
    const inner = `<div class="cp-stack cp-stack--sm">
      <div class="cp-row cp-row--between">
        <div class="cp-row">${thumb}<strong>${escapeHtml(s.name)}</strong></div>
        ${Badge(s.active ? { text: 'نشطة', tone: 'ok' } : { text: 'مخفية', tone: 'neutral' })}
      </div>
      ${s.desc ? `<div class="cp-muted">${escapeHtml(s.desc)}</div>` : ''}
      ${s.price ? `<div class="cp-muted">💰 ${escapeHtml(String(s.price))}</div>` : ''}
      <div class="cp-row cp-row--wrap">
        ${Button({ label: 'تعديل', icon: '✏️', variant: 'ghost', size: 'sm', block: false, action: `edit:${i}` })}
        ${Button({ label: s.active ? 'إخفاء' : 'إظهار', icon: s.active ? '🙈' : '👁', variant: 'ghost', size: 'sm', block: false, action: `tog:${i}` })}
        ${Button({ label: '⬆', variant: 'ghost', size: 'sm', block: false, action: `up:${i}`, disabled: i === 0 })}
        ${Button({ label: '⬇', variant: 'ghost', size: 'sm', block: false, action: `down:${i}`, disabled: i === items.length - 1 })}
        ${Button({ label: 'حذف', icon: '🗑', variant: 'danger', size: 'sm', block: false, action: `del:${i}` })}
      </div>
    </div>`;
    return Card({ body: inner });
  }

  function listView() {
    const add = Button({ label: 'إضافة خدمة', icon: '➕', action: 'add', loading: busy, disabled: busy });
    if (!items.length) {
      return `<div class="cp-stack cp-stack--lg">${add}
        <div class="cp-empty"><span class="cp-empty__icon">🛠</span>
        <div class="cp-empty__title">لا توجد خدمات بعد</div>
        <div class="cp-muted">أضِف خدماتك لتظهر في صفحتك العامة.</div></div></div>`;
    }
    return `<div class="cp-stack cp-stack--lg">${add}
      <div class="cp-stack">${items.map(row).join('')}</div></div>`;
  }

  function form() {
    const s = editIdx >= 0 ? items[editIdx] : { name: '', desc: '', price: '', imageUrl: '' };
    const img = draftImg?.dataUrl || s.imageUrl || '';
    const preview = img ? `<img class="cp-thumb" src="${escapeHtml(img)}" alt="">` : '';
    const inner = `<div class="cp-stack cp-stack--sm">
      ${Input({ id: 'sv-name', label: 'اسم الخدمة', value: s.name, required: true })}
      ${Input({ id: 'sv-desc', label: 'وصف مختصر', type: 'textarea', value: s.desc })}
      ${Input({ id: 'sv-price', label: 'السعر (اختياري)', value: s.price, placeholder: 'مثال: 150 ج أو يبدأ من 100' })}
      <div class="cp-field"><label class="cp-field__label">صورة (اختياري)</label>${preview}
        <input type="file" id="sv-img" accept="image/*" hidden>
        ${Button({ label: img ? 'تغيير الصورة' : 'إضافة صورة', icon: '🖼', variant: 'ghost', size: 'sm', block: false, action: 'pick-img' })}
      </div>
      <div class="cp-row cp-row--wrap">
        ${Button({ label: editIdx >= 0 ? 'حفظ التعديل' : 'إضافة', icon: '💾', size: 'sm', block: false, action: 'save', loading: busy, disabled: busy })}
        ${Button({ label: 'رجوع', variant: 'ghost', size: 'sm', block: false, action: 'back' })}
      </div>
    </div>`;
    return `<div class="cp-stack cp-stack--lg">${Card({ body: inner })}</div>`;
  }

  async function persist() {
    items.forEach((s, i) => { s.order = i; });
    busy = true; paint();
    const r = await svc.profile.saveServices({ uid: uid(), email: email(), name: uname(), services: items });
    busy = false; paint();
    if (!r?.ok) shell.notify((r?.errors && r.errors[0]) || 'تعذّر الحفظ', 'danger');
    return r?.ok;
  }

  return {
    async mount() {
      try {
        const client = await svc.profile.loadClient(uid());
        if (client) store.set({ client });
        items = normalizeServices(client?.businessProfile?.services);
      } catch (_) { items = normalizeServices(store.get('client')?.businessProfile?.services); }
      return listView();
    },
    async onUpload(input) {
      if (input.id !== 'sv-img') return;
      const file = input.files && input.files[0]; input.value = '';
      if (!file || !/^image\//.test(file.type)) { shell.notify('يُسمح بالصور فقط', 'danger'); return; }
      try {
        const { file: cropped, dataUrl } = await cropResize(file, { aspect: 1, maxW: 600 });
        draftImg = { file: cropped, dataUrl }; paint();
      } catch (_) { shell.notify('تعذّر تجهيز الصورة', 'danger'); }
    },
    async onAction(a) {
      if (a === 'add') { mode = 'form'; editIdx = -1; draftImg = null; return paint(); }
      if (a === 'back') { mode = 'list'; draftImg = null; return paint(); }
      if (a === 'pick-img') { qs('#sv-img', document)?.click(); return; }
      if (a.startsWith('edit:')) { mode = 'form'; editIdx = parseInt(a.slice(5), 10); draftImg = null; return paint(); }
      if (a.startsWith('tog:')) { const i = parseInt(a.slice(4), 10); items[i].active = !items[i].active; return persist(); }
      if (a.startsWith('del:')) { const i = parseInt(a.slice(4), 10); items.splice(i, 1); return persist(); }
      if (a.startsWith('up:')) { const i = parseInt(a.slice(3), 10); if (i > 0) { [items[i - 1], items[i]] = [items[i], items[i - 1]]; await persist(); } return; }
      if (a.startsWith('down:')) { const i = parseInt(a.slice(5), 10); if (i < items.length - 1) { [items[i + 1], items[i]] = [items[i], items[i + 1]]; await persist(); } return; }
      if (a === 'save') {
        const name = (qs('#sv-name', document)?.value || '').trim();
        if (!name) { shell.notify('اسم الخدمة مطلوب', 'danger'); return; }
        const desc = (qs('#sv-desc', document)?.value || '').trim();
        const price = (qs('#sv-price', document)?.value || '').trim();
        busy = true; paint();
        let imageUrl = editIdx >= 0 ? items[editIdx].imageUrl : '';
        try {
          if (draftImg?.file) imageUrl = await svc.profile.uploadServiceImage({ uid: uid(), file: draftImg.file });
        } catch (_) { busy = false; paint(); shell.notify('تعذّر رفع الصورة', 'danger'); return; }
        const base = editIdx >= 0 ? items[editIdx] : { id: `s${Date.now()}`, order: items.length, active: true };
        const next = { ...base, name, desc, price, imageUrl };
        if (editIdx >= 0) items[editIdx] = next; else items.push(next);
        draftImg = null; mode = 'list';
        await persist();
      }
    },
  };
}
