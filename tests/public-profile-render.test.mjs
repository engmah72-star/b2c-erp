/**
 * tests · public-profile-render — اختبار مُولِّد SSR لصفحة الأعمال العامة (نقي).
 * تشغيل: node tests/public-profile-render.test.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { renderProfileHtml, normServices } = require('../functions/public-profile.js');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('✗', name); } };

// 1) not-found page
const nf = renderProfileHtml(null, 'https://x/u/none');
ok('not-found has robots+title', nf.includes('غير موجودة') && nf.includes('<title>'));
ok('not-found is full html', nf.startsWith('<!DOCTYPE html>') && nf.includes('</html>'));

// 2) full card
const card = {
  bizName: 'مطعم الذوق', activity: 'مطاعم', bio: 'أشهى المأكولات',
  logoUrl: 'https://img/logo.png', coverUrl: 'https://img/cover.png',
  phone: '01000000000', whatsapp: '01000000000', website: 'https://site.com',
  social: { instagram: 'zoo2', facebook: 'https://facebook.com/zoo2' },
  services: ['توصيل', { name: 'حجز قاعة', desc: 'للمناسبات', price: '500 ج', active: true },
             { name: 'مخفي', active: false }],
  works: [{ type: 'image', url: 'https://img/1.jpg' }, { type: 'pdf', url: 'https://img/m.pdf' }],
};
const url = 'https://business2card-c041b.web.app/u/zoo2';
const h = renderProfileHtml(card, url);

ok('title has bizName', h.includes('<title>مطعم الذوق — Business2Card</title>'));
ok('og:title set', h.includes('property="og:title" content="مطعم الذوق'));
ok('og:image = cover', h.includes('property="og:image" content="https://img/cover.png"'));
ok('canonical set', h.includes(`rel="canonical" href="${url}"`));
ok('description from bio', h.includes('content="أشهى المأكولات"'));
ok('activity rendered', h.includes('class="activity">مطاعم'));
ok('call button', h.includes('href="tel:01000000000"'));
ok('whatsapp intl', h.includes('wa.me/201000000000'));
ok('website', h.includes('href="https://site.com"'));
ok('service active shown', h.includes('حجز قاعة') && h.includes('💰 500 ج'));
ok('service string shown', h.includes('توصيل'));
ok('service hidden excluded', !h.includes('مخفي'));
ok('social instagram resolved', h.includes('https://instagram.com/zoo2'));
ok('works image + pdf', h.includes('https://img/1.jpg') && h.includes('https://img/m.pdf'));
ok('qr present', h.includes('api.qrserver.com'));
ok('share script', h.includes("getElementById('shareBtn')"));

// 3) normServices ordering + filtering
const ns = normServices([{ name: 'b', order: 1 }, { name: 'a', order: 0 }, 'c']);
ok('normServices sorted', ns[0].name === 'a' && ns[1].name === 'b');
ok('normServices string→obj', ns.find((s) => s.name === 'c') && ns.length === 3);

// 4) XSS escaping
const xss = renderProfileHtml({ bizName: '<script>x</script>', bio: '"q"&' }, url);
ok('escapes bizName', !xss.includes('<script>x</script>') && xss.includes('&lt;script&gt;'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
