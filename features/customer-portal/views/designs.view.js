/**
 * VIEWS · designs — معرض تصاميم الشركة + فلترة + «اطلب مشابه» (رافعة تحويل).
 * تركيب مكوّنات + نداء Services. (STANDARDS §6 · L1)
 */
import { escapeHtml } from '../utils/dom.js';
import { Card, Button, Chips, EmptyState } from '../components/index.js';
import { submitRequest } from './requests.js';

const imgOf = (g) => g.imageUrl || g.thumbUrl || g.url || g.image || '';

export function create(ctx) {
  const { services } = ctx;
  let items = [];
  let cat = 'all';
  const byId = new Map();

  const cats = () => [{ label: 'الكل', value: 'all' },
    ...services.gallery.categoriesOf(items).map((c) => ({ label: c, value: c }))];
  const visible = () => items.filter((g) => cat === 'all' || (g.productType || '') === cat);

  function tile(g) {
    const src = imgOf(g);
    const media = src
      ? `<img class="cp-thumb" loading="lazy" src="${escapeHtml(src)}" alt="${escapeHtml(g.title || 'تصميم')}">`
      : `<div class="cp-thumb"></div>`;
    const body = `<div class="cp-stack cp-stack--sm">
      ${media}
      <strong>${escapeHtml(g.title || g.productType || 'تصميم')}</strong>
      ${Button({ label: 'اطلب مشابه', icon: '✨', variant: 'primary', size: 'sm', action: `similar:${g._id}` })}
    </div>`;
    return Card({ body });
  }

  function html() {
    const list = visible();
    const head = `<div class="cp-stack cp-stack--sm">
      <h2 class="cp-sec">معرض التصاميم</h2>${Chips(cats(), cat)}</div>`;
    const grid = list.length
      ? `<div class="cp-grid cp-grid--2">${list.map(tile).join('')}</div>`
      : EmptyState({ icon: '🎨', title: 'لا توجد تصاميم منشورة بعد' });
    return `<div class="cp-stack cp-stack--lg">${head}${grid}</div>`;
  }

  return {
    async mount() {
      items = await services.gallery.loadGallery();
      byId.clear(); items.forEach((g) => byId.set(g._id, g));
      return html();
    },
    onChip(value) { if (value && value !== cat) { cat = value; ctx.repaint(html()); } },
    async onAction(a) {
      if (a.startsWith('similar:')) {
        const g = byId.get(a.slice(8));
        const label = g?.title || g?.productType || 'هذا التصميم';
        await submitRequest(ctx, { type: 'quote', notes: `أرغب في تصميم مشابه لـ «${label}».` });
      }
    },
  };
}
