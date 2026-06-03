/**
 * VIEWS · portfolio — «أعمالي»: معرض أعمال العميل نفسه (صور/فيديو/PDF).
 * يقرأ businessProfile.works (المُغذّي للكارت العام). تركيب + Services. (STANDARDS §6 · L1)
 */
import { escapeHtml } from '../utils/dom.js';
import { Card, Button, EmptyState } from '../components/index.js';

function media(w) {
  const url = escapeHtml(w.url || '');
  if (w.type === 'video') return `<video class="cp-thumb" src="${url}" controls preload="none"></video>`;
  if (w.type === 'pdf') return `<a class="cp-thumb cp-thumb--file" href="${url}" target="_blank" rel="noopener" aria-label="ملف PDF">📄</a>`;
  return `<img class="cp-thumb" loading="lazy" src="${url}" alt="${escapeHtml(w.name || 'عمل')}">`;
}

export function create(ctx) {
  const { services, store } = ctx;
  let works = [];

  function tile(w) {
    const body = `<div class="cp-stack cp-stack--sm">${media(w)}
      ${w.name ? `<div class="cp-muted">${escapeHtml(w.name)}</div>` : ''}</div>`;
    return Card({ body });
  }

  function html() {
    const manage = Button({ label: 'إدارة أعمالي', icon: '✏️', variant: 'ghost', size: 'sm', block: false, action: 'go:profile' });
    if (!works.length) {
      return `<div class="cp-stack cp-stack--lg">
        <h2 class="cp-sec">أعمالي</h2>
        ${EmptyState({ icon: '📁', title: 'لا توجد أعمال بعد',
          hint: 'أضِف صور/فيديو/ملفات أعمالك لتظهر في كارتك الرقمي.',
          action: manage })}
      </div>`;
    }
    return `<div class="cp-stack cp-stack--lg">
      <div class="cp-row cp-row--between"><h2 class="cp-sec">أعمالي (${works.length})</h2>${manage}</div>
      <div class="cp-grid cp-grid--2">${works.map(tile).join('')}</div>
    </div>`;
  }

  return {
    async mount() {
      let client = store.get('client');
      const uid = store.get('user')?.uid;
      if (!client && uid) { client = await services.profile.loadClient(uid); store.set({ client }); }
      works = Array.isArray(client?.businessProfile?.works) ? client.businessProfile.works : [];
      return html();
    },
    async onAction(a) { if (a.startsWith('go:')) ctx.go(a.slice(3)); },
  };
}
