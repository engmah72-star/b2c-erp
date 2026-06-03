/**
 * SHOWCASE — كتالوج حيّ لمكوّنات الـ Design System داخل الـ App Shell.
 * توثيق وإثبات فقط · بدون بيانات/منطق أعمال. (STANDARDS)
 */
import { createAppShell } from './layout/app-shell.js';
import { delegate } from './utils/dom.js';
import {
  Button, Input, Select, Card, Badge, Avatar, Chips, EmptyState, Skeleton,
} from './components/index.js';

const sec = (title) => `<h2 class="cp-sec">${title}</h2>`;

function catalog() {
  return `
    ${sec('Buttons')}
    ${Button({ label: 'أساسي', variant: 'primary', action: 'demo-toast' })}
    ${Button({ label: 'ثانوي', variant: 'ghost', action: 'demo-toast' })}
    ${Button({ label: 'واتساب', variant: 'wa', icon: '💬', action: 'demo-toast' })}
    ${Button({ label: 'حذف', variant: 'danger', action: 'demo-toast' })}
    ${Button({ label: 'مُعطّل', variant: 'primary', disabled: true })}
    ${Button({ label: 'تحميل…', variant: 'primary', loading: true })}

    ${sec('Inputs')}
    ${Input({ id: 'cx-name', label: 'الاسم', placeholder: 'محمد أحمد', required: true })}
    ${Input({ id: 'cx-phone', label: 'الهاتف', type: 'tel', dir: 'ltr', placeholder: '01XXXXXXXXX', hint: 'صيغة مصرية' })}
    ${Input({ id: 'cx-err', label: 'بريد', value: 'خطأ', error: 'صيغة البريد غير صحيحة' })}
    ${Input({ id: 'cx-bio', label: 'نبذة', type: 'textarea', placeholder: 'وصف قصير' })}
    ${Select({ id: 'cx-sector', label: 'القطاع', value: 'corporate', options: [
      { value: 'medical', label: 'طبي' }, { value: 'corporate', label: 'شركات' }, { value: 'restaurant', label: 'مطاعم' },
    ] })}

    ${sec('Badges (حالات الطلب)')}
    ${Card({ body: ['design', 'printing', 'production', 'shipping', 'archived', 'cancelled', 'ok', 'danger']
      .map((t) => Badge({ text: t, tone: t })).join(' ') })}

    ${sec('Avatars')}
    ${Card({ body: `${Avatar({ initial: 'ن', size: 'sm' })} ${Avatar({ initial: 'ك', size: 'md' })} ${Avatar({ initial: 'م', size: 'lg' })}` })}

    ${sec('Cards · Chips')}
    ${Card({ interactive: true, dataset: { 'demo': '1' }, body: `<b>كارت تفاعلي</b><br><span class="cp-field__hint">اضغطني (toast)</span>` })}
    ${Chips([
      { label: 'الكل', value: 'all' }, { label: 'محامي', value: 'law' },
      { label: 'طبيب', value: 'med' }, { label: 'مطعم', value: 'food' },
    ], 'all')}

    ${sec('Empty State')}
    ${EmptyState({ icon: '📦', title: 'لا توجد طلبات بعد', hint: 'ابدأ بطلب جديد.', action: Button({ label: '➕ طلب جديد', action: 'demo-toast' }) })}

    ${sec('Loading (Skeletons)')}
    ${Skeleton({ variant: 'card', count: 2 })}
    ${Skeleton({ variant: 'line', count: 3 })}
  `;
}

const shell = createAppShell({
  root: document.getElementById('cp-app'),
  brand: { icon: '🧩', title: 'Design System', sub: 'Components Catalog' },
  tabs: [{ key: 'catalog', icon: '🧩', label: 'الكتالوج' }],
  actions: [{ key: 'info', icon: 'ℹ️', label: 'معلومات' }],
  onAction: () => shell.notify('مكوّنات نقية · توكنز Theme · صفر منطق', 'ok'),
});

shell.mount(catalog());

// تفاعلات العرض فقط (إثبات الأحداث عبر delegation — لا منطق أعمال)
const main = document.querySelector('.cp-main');
delegate(main, 'click', '[data-action="demo-toast"]', () => shell.notify('✅ نجح الضغط (delegation)', 'ok'));
delegate(main, 'click', '.cp-chip', (chip) => {
  main.querySelectorAll('.cp-chip').forEach((c) => c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'));
});
delegate(main, 'click', '.cp-card--interactive', () => shell.notify('كارت تفاعلي ✓'));

shell.notify('🧩 Design System جاهز', 'ok');
