/**
 * VIEWS · profile — بروفايل الأعمال + الكارت الرقمي العام + تحرير البيانات.
 * تركيب مكوّنات + نداء Services + Validator. الكتابة عبر clientActions. (STANDARDS §6 · L1)
 */
import { escapeHtml, qs } from '../utils/dom.js';
import { Card, Button, Input, Avatar } from '../components/index.js';
import { validateProfile } from '../validators/profile.validator.js';

export function create(ctx) {
  const { services, store, shell } = ctx;
  let client = null;
  let editing = false;
  let errors = [];

  const cardUrl = (uid) => `${location.origin}/card.html?u=${encodeURIComponent(uid)}`;

  function view() {
    const name = client?.name || store.get('user')?.displayName || 'عميل';
    const biz = client?.businessProfile || {};
    const phone = client?.phone1 || '';
    const uid = store.get('user')?.uid || '';
    const head = Card({ body: `<div class="cp-row">
      ${Avatar({ initial: name, size: 'lg' })}
      <div class="cp-row__grow">
        <div class="cp-title">${escapeHtml(biz.bizName || name)}</div>
        <div class="cp-muted">${escapeHtml(biz.tagline || '—')}</div>
      </div>
    </div>` });
    const info = Card({ body: `<div class="cp-stack cp-stack--sm">
      <div class="cp-kv"><span class="cp-kv__k">الاسم</span><span class="cp-kv__v">${escapeHtml(name)}</span></div>
      <div class="cp-kv"><span class="cp-kv__k">الهاتف</span><span class="cp-kv__v">${escapeHtml(phone || '—')}</span></div>
      <div class="cp-kv"><span class="cp-kv__k">النشاط</span><span class="cp-kv__v">${escapeHtml(biz.activity || '—')}</span></div>
    </div>` });
    const actions = `<div class="cp-stack cp-stack--sm">
      ${Button({ label: 'مشاركة الكارت الرقمي', icon: '🔗', action: 'share', disabled: !uid })}
      ${Button({ label: 'تعديل البيانات', icon: '✏️', variant: 'ghost', action: 'edit' })}
      ${Button({ label: 'تسجيل الخروج', icon: '🚪', variant: 'ghost', action: 'logout' })}
    </div>`;
    return `<div class="cp-stack cp-stack--lg">${head}${info}${actions}</div>`;
  }

  function form() {
    const biz = client?.businessProfile || {};
    const errBox = errors.length
      ? `<div class="cp-field__error" role="alert">${errors.map(escapeHtml).join('<br>')}</div>` : '';
    const body = `<div class="cp-stack cp-stack--sm">
      <h2 class="cp-sec">تعديل البيانات</h2>
      ${Input({ id: 'f-biz', label: 'اسم النشاط', value: biz.bizName || '', required: true })}
      ${Input({ id: 'f-phone', label: 'رقم التواصل', type: 'tel', value: client?.phone1 || '', required: true, dir: 'ltr', placeholder: '01xxxxxxxxx' })}
      ${Input({ id: 'f-tagline', label: 'وصف مختصر', value: biz.tagline || '' })}
      ${Input({ id: 'f-activity', label: 'النشاط', value: biz.activity || '' })}
      ${errBox}
      <div class="cp-row cp-row--wrap">
        ${Button({ label: 'حفظ', icon: '💾', size: 'sm', block: false, action: 'save' })}
        ${Button({ label: 'إلغاء', variant: 'ghost', size: 'sm', block: false, action: 'cancel' })}
      </div>
    </div>`;
    return `<div class="cp-stack cp-stack--lg">${Card({ body })}</div>`;
  }

  function paint() { ctx.repaint(editing ? form() : view()); }

  return {
    async mount() {
      const uid = store.get('user')?.uid;
      client = uid ? await services.profile.loadClient(uid) : null;
      return editing ? form() : view();
    },
    async onAction(a) {
      if (a === 'edit') { editing = true; errors = []; return paint(); }
      if (a === 'cancel') { editing = false; errors = []; return paint(); }
      if (a === 'logout') return services.auth.signOut();
      if (a === 'share') {
        const uid = store.get('user')?.uid; if (!uid) return;
        const url = cardUrl(uid);
        if (navigator.share) { try { await navigator.share({ title: 'كارتي الرقمي', url }); } catch (_) {} }
        else { try { await navigator.clipboard.writeText(url); shell.notify('تم نسخ رابط الكارت ✅', 'ok'); } catch (_) { shell.notify(url, 'ok'); } }
        return;
      }
      if (a === 'save') {
        const get = (id) => (qs('#' + id)?.value || '').trim();
        const bizName = get('f-biz'); const phone = get('f-phone');
        const v = validateProfile({ bizName, phone });
        if (!v.ok) { errors = v.errors; return paint(); }
        const user = store.get('user');
        const businessProfile = { ...(client?.businessProfile || {}), bizName, tagline: get('f-tagline'), activity: get('f-activity') };
        const r = await services.profile.saveProfile({ uid: user.uid, email: user.email, name: user.displayName, phone, businessProfile });
        if (r?.ok) {
          client = await services.profile.loadClient(user.uid);
          editing = false; errors = [];
          shell.notify('تم حفظ البيانات ✅', 'ok'); paint();
        } else shell.notify('تعذّر الحفظ، حاول مجدداً', 'danger');
      }
    },
  };
}
