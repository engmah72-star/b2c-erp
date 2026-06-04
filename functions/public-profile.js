/**
 * functions/public-profile — SSR لصفحة الأعمال العامة (/u/{username}).
 * renderProfileHtml نقي (قابل للاختبار) — يبني HTML كامل + OG/SEO من بيانات الكارت.
 * لا Firebase هنا (الجلب في index.js) → سهل الاختبار في node.
 */

const esc = (s) => String(s == null ? '' : s)
  .replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

const normWa = (n) => {
  let s = String(n || '').replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('0')) s = '2' + s;
  return s;
};

/** تطبيع الخدمات (متوافق مع string[] القديمة و object[] الجديدة). */
function normServices(list) {
  if (!Array.isArray(list)) return [];
  return list.map((s, i) => (typeof s === 'string'
    ? { name: s, desc: '', price: '', imageUrl: '', order: i, active: true }
    : {
        name: s.name || '', desc: s.desc || '', price: s.price || '',
        imageUrl: s.imageUrl || '', order: Number.isFinite(s.order) ? s.order : i,
        active: s.active !== false,
      }))
    .filter((s) => s.active && String(s.name).trim())
    .sort((a, b) => a.order - b.order);
}

const PAGE_STYLE = `*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:var(--font-ar);background:var(--bg);color:var(--snow);min-height:100vh;display:flex;justify-content:center;}
.page{width:100%;max-width:560px;background:var(--bg2);min-height:100vh;}
.cover{height:180px;background:var(--cp-grad);background-size:cover;background-position:center;position:relative;}
.logo{position:absolute;bottom:-46px;inset-inline-start:24px;width:96px;height:96px;border-radius:24px;background:var(--bg3);border:4px solid var(--bg2);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:var(--fw-heavy);color:var(--snow);}
.logo img{width:100%;height:100%;object-fit:cover;}
.body{padding:62px 22px 40px;}
h1{font-size:var(--fs-3xl);font-weight:var(--fw-heavy);margin-bottom:4px;}
.activity{color:var(--p);font-weight:var(--fw-extra);font-size:var(--fs-md);margin-bottom:10px;}
.bio{font-size:var(--fs-md);color:var(--dim2);line-height:1.8;margin-bottom:20px;}
.actions{display:flex;gap:10px;margin-bottom:24px;flex-wrap:wrap;}
.act{flex:1;min-width:120px;min-height:46px;padding:13px;border-radius:var(--rad);text-decoration:none;text-align:center;font-weight:var(--fw-extra);font-size:var(--fs-md);display:flex;align-items:center;justify-content:center;gap:8px;}
.act-call{background:var(--cp-grad);color:#fff;}
.act-wa{background:var(--cp-wa);color:var(--cp-wa-ink);}
.act-web{background:var(--bg3);color:var(--snow);border:1px solid var(--line);}
.sec{font-size:var(--fs-lg);font-weight:var(--fw-heavy);margin:24px 0 12px;display:flex;align-items:center;gap:8px;}
.sec::before{content:"";width:4px;height:18px;border-radius:3px;background:var(--cp-grad);}
.sec--center{justify-content:center;}
.svc{display:flex;flex-direction:column;gap:10px;}
.svc .card{background:var(--bg3);border:1px solid var(--line);border-radius:14px;padding:12px;display:flex;gap:12px;align-items:flex-start;}
.svc .card img{width:56px;height:56px;border-radius:10px;object-fit:cover;flex:0 0 auto;}
.svc .card .t{font-weight:var(--fw-heavy);font-size:var(--fs-md);}
.svc .card .d{color:var(--dim2);font-size:var(--fs-sm);margin-top:2px;line-height:1.6;}
.svc .card .p{color:var(--p);font-weight:var(--fw-extra);font-size:var(--fs-sm);margin-top:4px;}
.social{display:flex;gap:12px;flex-wrap:wrap;}
.social a{width:46px;height:46px;border-radius:13px;background:var(--bg3);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:20px;text-decoration:none;}
.works{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
.works .w{border-radius:12px;overflow:hidden;background:var(--bg3);}
.works img,.works video{width:100%;height:150px;object-fit:cover;display:block;}
.works a.pdf{display:flex;align-items:center;justify-content:center;height:150px;font-size:40px;text-decoration:none;}
.share{margin:26px 0 8px;text-align:center;}
.share img{width:150px;height:150px;background:#fff;padding:8px;border-radius:14px;}
.share .btn{display:inline-block;margin-top:12px;min-height:46px;padding:12px 22px;border-radius:var(--rad);border:none;background:var(--cp-grad);color:#fff;font-family:inherit;font-weight:var(--fw-extra);font-size:var(--fs-md);cursor:pointer;}
.foot{text-align:center;color:var(--dim2);font-size:var(--fs-xs);padding:20px;}
.foot a{color:var(--p);text-decoration:none;}
#state{padding:80px 24px;text-align:center;color:var(--dim2);font-size:var(--fs-lg);line-height:1.8;}`;

function socialLinks(so = {}) {
  const icons = { facebook: '📘', instagram: '📸', tiktok: '🎵', linkedin: '💼' };
  let out = '';
  for (const k of Object.keys(icons)) {
    if (!so[k]) continue;
    let href = so[k];
    if (!/^https?:\/\//.test(href)) {
      const u = String(href).replace(/^@/, '');
      href = k === 'facebook' ? 'https://facebook.com/' + u
        : k === 'instagram' ? 'https://instagram.com/' + u
        : k === 'tiktok' ? 'https://tiktok.com/@' + u : 'https://' + href;
    }
    out += `<a href="${esc(href)}" target="_blank" rel="noopener" title="${k}">${icons[k]}</a>`;
  }
  return out;
}

/** يبني صفحة HTML كاملة (SSR) من بيانات الكارت. card=null → صفحة "غير موجودة". */
function renderProfileHtml(card, canonicalUrl = '') {
  const url = esc(canonicalUrl);
  const head = (title, desc, image) => `<!DOCTYPE html><html lang="ar" dir="rtl"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="profile"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
${url ? `<meta property="og:url" content="${url}"><link rel="canonical" href="${url}">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet">
<link rel="icon" href="/icon-192.png" type="image/png">
<link rel="stylesheet" href="/shared.css?v=45"><link rel="stylesheet" href="/client-theme.css?v=1">
<style>${PAGE_STYLE}</style></head>`;

  if (!card) {
    return head('صفحة غير موجودة — Business2Card', 'الصفحة غير موجودة أو لم تُنشر بعد.', '')
      + `<body><main class="page"><div id="state">🔍 الصفحة غير موجودة أو لم تُنشر بعد.</div>
      <div class="foot">صُنع عبر <a href="/client-login.html">Business2Card</a> · <a href="/directory">دليل الأعمال</a></div></main></body></html>`;
  }

  const title = (card.bizName || 'صفحة الأعمال') + ' — Business2Card';
  const desc = String(card.bio || card.activity || card.bizName || 'صفحة أعمال رقمية').slice(0, 160);
  const ogImage = card.coverUrl || card.logoUrl || '';

  const logo = card.logoUrl
    ? `<img src="${esc(card.logoUrl)}" alt="${esc(card.bizName || '')}">`
    : esc((card.bizName || '★').trim()[0] || '★');
  const coverStyle = card.coverUrl ? ` style="background-image:url('${esc(card.coverUrl)}')"` : '';

  let acts = '';
  if (card.phone) acts += `<a class="act act-call" href="tel:${esc(card.phone)}">📞 اتصال</a>`;
  if (card.whatsapp) acts += `<a class="act act-wa" href="https://wa.me/${esc(normWa(card.whatsapp))}" target="_blank" rel="noopener">💬 واتساب</a>`;
  if (card.website) acts += `<a class="act act-web" href="${esc(card.website)}" target="_blank" rel="noopener">🌐 الموقع</a>`;

  const svcs = normServices(card.services);
  const svcHtml = svcs.length ? `<section><h2 class="sec">الخدمات</h2><div class="svc">${svcs.map((s) => `<div class="card">
    ${s.imageUrl ? `<img src="${esc(s.imageUrl)}" alt="" loading="lazy">` : ''}
    <div><div class="t">${esc(s.name)}</div>${s.desc ? `<div class="d">${esc(s.desc)}</div>` : ''}${s.price ? `<div class="p">💰 ${esc(String(s.price))}</div>` : ''}</div></div>`).join('')}</div></section>` : '';

  const so = socialLinks(card.social);
  const soHtml = so ? `<section><h2 class="sec">تابعنا</h2><div class="social">${so}</div></section>` : '';

  const works = (card.works || []).filter((w) => w && w.url);
  const worksHtml = works.length ? `<section><h2 class="sec">من أعمالنا</h2><div class="works">${works.map((w) => {
    if (w.type === 'video') return `<div class="w"><video src="${esc(w.url)}" controls preload="none"></video></div>`;
    if (w.type === 'pdf') return `<div class="w"><a class="pdf" href="${esc(w.url)}" target="_blank" rel="noopener">📄</a></div>`;
    return `<div class="w"><img src="${esc(w.url)}" alt="" loading="lazy"></div>`;
  }).join('')}</div></section>` : '';

  const qr = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=0&data=' + encodeURIComponent(canonicalUrl);
  // Premium gating: خطة الأعمال تزيل براندينج Business2Card (remove_branding).
  const removeBranding = String(card.plan || 'free').toLowerCase() === 'business';
  const footer = removeBranding
    ? '<div class="foot"><a href="/directory">دليل الأعمال</a></div>'
    : '<div class="foot">صُنع عبر <a href="/client-login.html">Business2Card</a> · <a href="/directory">دليل الأعمال</a></div>';

  return head(title, desc, ogImage) + `<body><main class="page">
  <article>
    <div class="cover" id="cover"${coverStyle}><div class="logo">${logo}</div></div>
    <div class="body">
      <h1>${esc(card.bizName || '')}</h1>
      ${card.activity ? `<div class="activity">${esc(card.activity)}</div>` : ''}
      <p class="bio">${esc(card.bio || '')}</p>
      <div class="actions">${acts}</div>
      ${svcHtml}${soHtml}${worksHtml}
      <div class="share"><h2 class="sec sec--center">شارك الصفحة</h2>
        <img src="${esc(qr)}" alt="QR" loading="lazy" width="150" height="150">
        <br><button class="btn" id="shareBtn">📤 مشاركة</button>
        <button class="btn" id="dlBtn">⬇️ تنزيل QR</button>
      </div>
    </div>
    ${footer}
  </article></main>
  <script>
  document.getElementById('shareBtn').addEventListener('click',async()=>{
    if(navigator.share){try{await navigator.share({title:document.title,url:location.href});}catch(_){}}
    else{try{await navigator.clipboard.writeText(location.href);alert('✅ تم نسخ الرابط');}catch(_){prompt('انسخ الرابط:',location.href);}}
  });
  document.getElementById('dlBtn').addEventListener('click',async()=>{
    const big='https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=0&data='+encodeURIComponent(location.href);
    try{const r=await fetch(big,{mode:'cors'});const b=await r.blob();const a=document.createElement('a');
      a.href=URL.createObjectURL(b);a.download='business2card-qr.png';document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),1500);}catch(_){window.open(big,'_blank','noopener');}
  });
  </script></body></html>`;
}

module.exports = { renderProfileHtml, normServices };
