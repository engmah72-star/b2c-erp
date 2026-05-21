/**
 * AI Search — Natural-language → filter spec, then page applies it.
 *
 * Drop-in module: a page calls `window.aiSearch.install({...})` once with
 * its filter schema + an `apply(spec)` callback. The module injects a small
 * "🪄 بحث ذكي" chip; clicking it opens a popup where the user types in
 * Arabic. The text is sent to Gemini with the schema as constraint, and
 * the parsed JSON is handed back to the page's `apply` function so it can
 * set its own dropdowns/inputs and re-render.
 *
 * Why not eval JS? We never let the model produce executable code. The
 * page exposes a fixed schema; the model maps NL → values for those
 * fields only.
 */
import { askAI, hasKey, KEY_NEEDED } from './ai-engine.js';

const STYLE_ID = 'ai-search-style';
const CHIP_ID  = 'ai-search-chip';
const OV_ID    = 'ai-search-ov';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    #${CHIP_ID}{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;
      background:linear-gradient(135deg,rgba(16,185,129,.12),rgba(79,142,247,.08));
      border:1px solid rgba(16,185,129,.35);border-radius:18px;color:#10b981;
      font-size:var(--fs-sm);font-weight:800;cursor:pointer;font-family:inherit;
      transition:.15s;white-space:nowrap}
    #${CHIP_ID}:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(16,185,129,.25);
      background:linear-gradient(135deg,rgba(16,185,129,.18),rgba(79,142,247,.12))}
    #${OV_ID}{position:fixed;inset:0;background:rgba(15,17,23,.7);z-index:9990;
      display:none;align-items:center;justify-content:center;padding:16px;
      backdrop-filter:blur(4px);font-family:system-ui,-apple-system,sans-serif;direction:rtl}
    #${OV_ID}.open{display:flex}
    #${OV_ID} .panel{background:#161b27;color:#e8eaf0;border:1px solid #2a3348;
      border-radius:18px;width:100%;max-width:520px;padding:18px;
      animation:as-pop .2s ease-out}
    @keyframes as-pop{from{transform:scale(.95);opacity:0}to{transform:scale(1);opacity:1}}
    #${OV_ID} h3{font-size:15px;font-weight:800;margin:0 0 6px;display:flex;align-items:center;gap:8px}
    #${OV_ID} .sub{font-size:var(--fs-sm);color:#8892a4;margin-bottom:14px;line-height:1.6}
    #${OV_ID} textarea{width:100%;background:#1e2535;border:1px solid #2a3348;border-radius:10px;
      padding:10px 12px;color:#e8eaf0;font-size:var(--fs-md);outline:none;font-family:inherit;
      direction:rtl;resize:none;min-height:60px;line-height:1.6}
    #${OV_ID} textarea:focus{border-color:#10b981}
    #${OV_ID} .examples{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
    #${OV_ID} .ex{padding:6px 10px;background:#1e2535;border:1px solid #2a3348;
      border-radius:18px;font-size:var(--fs-sm);color:#8892a4;cursor:pointer;transition:.15s}
    #${OV_ID} .ex:hover{border-color:#10b981;color:#10b981}
    #${OV_ID} .row{display:flex;gap:8px;margin-top:14px;align-items:center}
    #${OV_ID} .btn-apply{flex:1;padding:10px;background:#10b981;color:#fff;border:none;
      border-radius:10px;font-size:var(--fs-md);font-weight:800;cursor:pointer;font-family:inherit}
    #${OV_ID} .btn-apply:disabled{opacity:.5;cursor:not-allowed}
    #${OV_ID} .btn-cancel{padding:10px 14px;background:#1e2535;color:#8892a4;
      border:1px solid #2a3348;border-radius:10px;font-size:var(--fs-base);cursor:pointer;font-family:inherit}
    #${OV_ID} .status{font-size:var(--fs-sm);color:#8892a4;margin-top:10px;min-height:14px}
    #${OV_ID} .status.err{color:#f87171}
    #${OV_ID} .status.ok{color:#10b981}
  `;
  document.head.appendChild(s);
}

// ── Prompt template ────────────────────────────────────────────────────────
function buildPrompt(nl, schema, examples) {
  const fields = Object.entries(schema).map(([k, v]) => {
    if (v.type === 'enum') {
      return `- ${k} (${v.desc}): one of [${v.values.map(x => `"${x}"`).join(', ')}]`;
    }
    return `- ${k} (${v.desc}): ${v.type}`;
  }).join('\n');

  const exBlock = examples.length
    ? '\nExamples:\n' + examples.map(e => `Q: "${e.q}"\nJSON: ${JSON.stringify(e.a)}`).join('\n\n') + '\n'
    : '';

  return `You are a filter spec extractor for an Arabic ERP. Convert the user's natural-language query into a JSON object using ONLY these fields:

${fields}

Rules:
- Output ONLY a JSON object. No code fences, no explanation.
- Use null for fields the user did NOT mention.
- For enum fields, you MUST pick a value from the listed values (or null).
- The user's language is Arabic; map their words to the closest field/value.
${exBlock}
User query: "${nl}"
JSON:`;
}

function parseJsonLoose(raw) {
  // Strip code fences if present, then grab first {...} block.
  const stripped = raw.replace(/```(?:json)?/g, '').trim();
  const m = stripped.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('لم أتمكن من فهم السؤال — جرّب صياغة أخرى.');
  return JSON.parse(m[0]);
}

function validateSpec(spec, schema) {
  const clean = {};
  for (const [k, v] of Object.entries(spec || {})) {
    if (!(k in schema)) continue;            // drop unknown keys
    if (v === null || v === undefined) continue;
    const def = schema[k];
    if (def.type === 'enum' && !def.values.includes(v)) continue; // drop invalid enum
    clean[k] = v;
  }
  return clean;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Send NL to Gemini and return a validated filter spec.
 */
export async function query(nl, schema, examples = []) {
  const prompt = buildPrompt(nl, schema, examples);
  const raw = await askAI(prompt, { temperature: 0.1, maxTokens: 300 });
  const parsed = parseJsonLoose(raw);
  return validateSpec(parsed, schema);
}

/**
 * Install the wand-chip UI into the page.
 *
 * @param {object} cfg
 * @param {HTMLElement} cfg.host        — element to append the chip to (usually the filter bar)
 * @param {object} cfg.schema           — field schema (see top of file)
 * @param {Array}  [cfg.examples]       — { q, a } pairs shown as chips + few-shot
 * @param {(spec:object) => void} cfg.apply — called with the cleaned spec
 * @param {string} [cfg.label='🪄 بحث ذكي']
 * @param {string} [cfg.placeholder]
 */
export function install(cfg) {
  if (!cfg || !cfg.host || !cfg.schema || typeof cfg.apply !== 'function') return;
  ensureStyle();

  // Idempotent — remove any previous chip in the same host.
  cfg.host.querySelectorAll('#' + CHIP_ID).forEach(n => n.remove());

  const chip = document.createElement('button');
  chip.id = CHIP_ID;
  chip.type = 'button';
  chip.textContent = cfg.label || '🪄 بحث ذكي';
  chip.title = 'اسأل بحرية — AI يضبط الفلاتر';
  cfg.host.appendChild(chip);

  let ov = document.getElementById(OV_ID);
  if (!ov) {
    ov = document.createElement('div');
    ov.id = OV_ID;
    ov.innerHTML = `
      <div class="panel" onclick="event.stopPropagation()">
        <h3>🪄 <span id="as-title">بحث ذكي</span></h3>
        <div class="sub" id="as-sub">اكتب سؤالك بحرية بالعربية — مثلاً "العملاء المهدّدين في القاهرة" أو "اللي عليهم فلوس".</div>
        <textarea id="as-input" rows="2" placeholder="اكتب سؤالك..."></textarea>
        <div class="examples" id="as-examples"></div>
        <div class="row">
          <button class="btn-cancel" id="as-cancel">إلغاء</button>
          <button class="btn-apply" id="as-apply">تطبيق الفلتر</button>
        </div>
        <div class="status" id="as-status"></div>
      </div>`;
    ov.addEventListener('click', e => { if (e.target === ov) closePopup(); });
    document.body.appendChild(ov);
  }

  // Wire each chip to its config — store on overlay temporarily on open.
  chip.addEventListener('click', () => openPopup(cfg));
}

function openPopup(cfg) {
  const ov = document.getElementById(OV_ID);
  if (!ov) return;
  ov.classList.add('open');

  const input  = ov.querySelector('#as-input');
  const exWrap = ov.querySelector('#as-examples');
  const cancel = ov.querySelector('#as-cancel');
  const apply  = ov.querySelector('#as-apply');
  const status = ov.querySelector('#as-status');

  input.value = '';
  input.placeholder = cfg.placeholder || 'مثال: العملاء VIP اللي عليهم فلوس';
  status.textContent = '';
  status.className = 'status';

  // Rebuild example chips
  exWrap.innerHTML = (cfg.examples || []).map(e =>
    `<span class="ex">${e.q}</span>`
  ).join('');
  exWrap.querySelectorAll('.ex').forEach((el, i) => {
    el.addEventListener('click', () => {
      input.value = cfg.examples[i].q;
      input.focus();
    });
  });

  setTimeout(() => input.focus(), 50);

  const onCancel = () => closePopup();
  const onApply = async () => {
    const q = input.value.trim();
    if (!q) return;
    if (!hasKey()) {
      status.textContent = '⚠️ أضف مفتاح Gemini أولاً من أي صفحة عبر زر 🧠.';
      status.className = 'status err';
      return;
    }
    apply.disabled = true;
    status.textContent = '⏳ يجري الفهم...';
    status.className = 'status';
    try {
      const spec = await query(q, cfg.schema, cfg.examples || []);
      const keys = Object.keys(spec);
      if (!keys.length) {
        status.textContent = 'لم أستخرج أي فلتر من السؤال. جرّب صياغة أوضح.';
        status.className = 'status err';
        apply.disabled = false;
        return;
      }
      cfg.apply(spec);
      status.textContent = '✅ تم تطبيق: ' + keys.map(k => `${k}=${spec[k]}`).join(' · ');
      status.className = 'status ok';
      setTimeout(closePopup, 900);
    } catch (e) {
      const msg = e.code === KEY_NEEDED
        ? 'مفتاح Gemini مطلوب.'
        : (e.message || 'فشل الفهم — حاول مرة أخرى.');
      status.textContent = '❌ ' + msg;
      status.className = 'status err';
      apply.disabled = false;
    }
  };

  // Rebind to avoid stacking
  cancel.onclick = onCancel;
  apply.onclick  = onApply;
  input.onkeydown = e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onApply();
    if (e.key === 'Escape') onCancel();
  };
}

function closePopup() {
  document.getElementById(OV_ID)?.classList.remove('open');
}

// Expose to non-module scripts (clients.html uses compat SDK + plain <script>).
if (typeof window !== 'undefined') {
  window.aiSearch = { install, query };
}
