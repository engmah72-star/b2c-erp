/**
 * VIEWS · needs — لوحة الاحتياجات (Business Network · member↔member · MVP).
 * عضو يطرح «احتياج»، عضو آخر يردّ بالاهتمام فيصل لصاحبه إشعار برابط كارته الذكي
 * (سكة التواصل = الكارت، لا شات جديد). تركيب مكوّنات + نداء Services. (STANDARDS §6 · L1)
 *
 * المسار 2 (تفادي تعارض القناة): التخصصات هنا لا تشمل طباعة/تصميم/دعاية —
 * تخصصات الشركة نفسها — فالتبادل يغذّي ولا ينافس.
 */
import { escapeHtml, qs } from '../utils/dom.js';
import { Card, Button, Input, Select, Chips, EmptyState, Badge } from '../components/index.js';
import { SPECIALTIES, SPEC_LABEL } from '../utils/specialties.js';

const FILTERS = [{ label: 'كل الفرص', value: 'all' }, { label: 'احتياجاتي', value: 'mine' }];

export function create(ctx) {
  const { services, store, shell } = ctx;
  let needs = [];
  let filter = 'all';
  let posting = false;
  let busy = false;
  const byId = new Map();
  const responded = new Set();

  const me = () => store.get('user') || {};
  const biz = () => store.get('client')?.businessProfile || {};
  const myName = () => store.get('client')?.name || me().displayName || 'عضو';

  function needCard(n) {
    const mine = n.authorUid === me().uid;
    const did = responded.has(n._id);
    const actions = mine
      ? `<div class="cp-row cp-row--wrap">
          <span class="cp-muted">📨 ${Number(n.responsesCount) || 0} مهتم</span>
          ${Button({ label: 'إنهاء', variant: 'ghost', size: 'sm', block: false, action: `close:${n._id}` })}
        </div>`
      : `<div class="cp-row cp-row--wrap">
          ${Button({ label: did ? 'تم إرسال اهتمامك ✓' : '🤝 أنا مهتم', variant: did ? 'ghost' : 'primary', size: 'sm', block: false, action: did ? '' : `respond:${n._id}`, disabled: did })}
          ${Button({ label: 'محادثة', icon: '💬', variant: 'ghost', size: 'sm', block: false, action: `chat:${n._id}` })}
        </div>`;
    const meta = [SPEC_LABEL[n.specialty] || n.specialty, n.city && ('📍 ' + n.city)].filter(Boolean).join(' · ');
    const body = `<div class="cp-stack cp-stack--sm">
      <div class="cp-row cp-row--between">
        <strong>${escapeHtml(n.title || '')}</strong>${Badge({ text: SPEC_LABEL[n.specialty] ? SPEC_LABEL[n.specialty].replace(/^\S+\s/, '') : 'عام', tone: 'design' })}
      </div>
      <div class="cp-muted">${escapeHtml(meta)} · بواسطة ${escapeHtml(n.authorName || 'عضو')}</div>
      ${n.details ? `<div class="cp-muted">${escapeHtml(n.details)}</div>` : ''}
      ${actions}
    </div>`;
    return Card({ body });
  }

  function formCard() {
    return Card({ body: `<div class="cp-stack cp-stack--sm">
      <h2 class="cp-sec">📣 اطرح احتياجك</h2>
      ${Input({ id: 'nd-title', label: 'إيه اللي محتاجه؟', value: '', required: true, placeholder: 'مثال: محتاج محامي عقود · مورد قهوة · مصوّر منتجات' })}
      ${Select({ id: 'nd-spec', label: 'التخصص المطلوب', options: SPECIALTIES, required: true })}
      ${Input({ id: 'nd-city', label: 'المدينة (اختياري)', value: biz().city || '' })}
      ${Input({ id: 'nd-details', label: 'تفاصيل (اختياري)', type: 'textarea', value: '', placeholder: 'أي تفاصيل تساعد الأنشطة المهتمة' })}
      <div class="cp-row cp-row--wrap">
        ${Button({ label: 'نشر', icon: '🚀', size: 'sm', block: false, action: 'post', loading: busy, disabled: busy })}
        ${Button({ label: 'إلغاء', variant: 'ghost', size: 'sm', block: false, action: 'post-cancel' })}
      </div>
    </div>` });
  }

  function html() {
    const list = needs.filter((n) => (filter === 'mine' ? n.authorUid === me().uid : true));
    const head = `<div class="cp-stack cp-stack--sm">
      <div class="cp-row cp-row--between">
        <h2 class="cp-sec">فرص الأعمال (${needs.length})</h2>
        ${Button({ label: 'اطرح احتياج', icon: '📣', size: 'sm', block: false, action: 'post-open' })}
      </div>
      <div class="cp-muted">اطلب خدمة من أنشطة المنصة، أو ردّ على احتياج وكسب عميل جديد.</div>
      ${Chips(FILTERS, filter)}
    </div>`;
    const content = list.length
      ? `<div class="cp-stack">${list.map(needCard).join('')}</div>`
      : EmptyState({ icon: '🤝', title: filter === 'mine' ? 'لم تطرح أي احتياج بعد' : 'لا توجد فرص مفتوحة الآن', hint: 'اطرح احتياجك ليصل للأنشطة المطابقة.' });
    return `<div class="cp-stack cp-stack--lg">${head}${posting ? formCard() : ''}${content}</div>`;
  }

  function repaint() { ctx.repaint(html()); }

  async function load() {
    needs = await services.needs.loadOpenNeeds();
    byId.clear(); needs.forEach((n) => byId.set(n._id, n));
  }

  return {
    async mount() { await load(); return html(); },
    onChip(value) { if (value && value !== filter) { filter = value; repaint(); } },
    async onAction(a) {
      if (a === 'post-open') { posting = true; return repaint(); }
      if (a === 'post-cancel') { posting = false; return repaint(); }
      if (a === 'post') {
        if (busy) return;
        const get = (id) => (qs('#' + id, document)?.value || '').trim();
        const title = get('nd-title'); const specialty = qs('#nd-spec', document)?.value || '';
        if (!title) { shell.notify('اكتب وصف الاحتياج', 'danger'); return; }
        busy = true; repaint();
        const r = await services.needs.postNeed({
          uid: me().uid, name: myName(), username: biz().username || '',
          title, specialty, city: get('nd-city'), details: get('nd-details'),
        });
        busy = false;
        if (r?.ok) { posting = false; await load(); shell.notify('تم نشر احتياجك ✅', 'ok'); repaint(); }
        else { repaint(); shell.notify((r?.errors && r.errors[0]) || 'تعذّر النشر', 'danger'); }
        return;
      }
      if (a.startsWith('chat:')) {
        const n = byId.get(a.slice(5));
        if (n && n.authorUid && n.authorUid !== me().uid) {
          ctx.openChat?.({ kind: 'member', peer: { uid: n.authorUid, name: n.authorName || 'عضو' } });
        }
        return;
      }
      if (a.startsWith('respond:')) {
        const n = byId.get(a.slice(8));
        if (!n) return;
        const r = await services.needs.respondNeed({
          needId: n._id, authorUid: n.authorUid,
          uid: me().uid, name: myName(), username: biz().username || '',
        });
        if (r?.ok) { responded.add(n._id); shell.notify('تم — صاحب الفرصة سيتواصل معك عبر كارتك ✅', 'ok'); repaint(); }
        else shell.notify((r?.errors && r.errors[0]) || 'تعذّر الإرسال', 'danger');
        return;
      }
      if (a.startsWith('close:')) {
        const id = a.slice(6);
        const r = await services.needs.closeNeed({ needId: id, uid: me().uid });
        if (r?.ok) { await load(); shell.notify('تم إنهاء الاحتياج ✅', 'ok'); repaint(); }
        else shell.notify('تعذّر الإنهاء', 'danger');
        return;
      }
    },
  };
}
