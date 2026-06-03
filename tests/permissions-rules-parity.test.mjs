/**
 * tests · permissions-rules-parity — حارس تكافؤ الصلاحيات (#5 مركزية).
 * يكشف الانحراف بين firestore.rules وبين core/permissions-matrix.js:
 *   كل can('X') / hasPage('Y') في القواعد يجب أن يكون معرّفاً في الماتركس،
 *   أو ضمن allowlist موثّق (صلاحيات server-managed لا تُخزَّن في ثوابت الواجهة).
 * أخضر على الوضع الحالي · يفشل على أي انحراف **جديد**.
 * تشغيل: node tests/permissions-rules-parity.test.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as M from '../core/permissions-matrix.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');

// ── الكون المعروف من الماتركس (المصدر المركزي) ──
const knownCaps = new Set(Object.values(M.CAPABILITIES || {}));
for (const role of Object.values(M.DEFAULT_ROLE_PERMISSIONS || {})) {
  for (const k of Object.keys(role)) if (k !== 'pages') knownCaps.add(k);
}
const knownPages = new Set();
for (const pages of Object.values(M.ROLE_PAGES || {})) (pages || []).forEach((p) => knownPages.add(p));
for (const role of Object.values(M.DEFAULT_ROLE_PERMISSIONS || {})) {
  (Array.isArray(role.pages) ? role.pages : []).forEach((p) => knownPages.add(p));
}

// ── allowlist موثّق: صلاحيات تُدار server-side عبر users/{uid}.permissions أو
// helpers في القواعد، وليست ثوابت في الماتركس. (دين معروف — لا يُسمح بزيادته.) ──
const SERVER_ONLY_CAPS = new Set([
  'canFollowUpClients', 'canArchiveClients', 'canUseChat',
  'canFinancialRead', 'canFinancialWrite', 'canAddSuppliers',
  'canManageOwnDesignerProfile',
]);
// صفحات تُذكَر في القواعد لكنها ليست ضمن أي دور افتراضي في ROLE_PAGES
// (وصول admin عبر '*' أو override فردي). دين موثّق — لا يُسمح بزيادته.
const KNOWN_PAGES_EXTRA = new Set([
  'suppliers', 'print', 'returns', 'products', 'employees', 'chat', 'archive',
]);

const capsInRules = [...rules.matchAll(/can\('([a-zA-Z_]+)'\)/g)].map((m) => m[1]);
const pagesInRules = [...rules.matchAll(/hasPage\('([a-zA-Z_-]+)'\)/g)].map((m) => m[1]);

let pass = 0, fail = 0;
const driftCaps = [...new Set(capsInRules)].filter((c) => !knownCaps.has(c) && !SERVER_ONLY_CAPS.has(c));
const driftPages = [...new Set(pagesInRules)].filter((p) => !knownPages.has(p) && !KNOWN_PAGES_EXTRA.has(p));

if (driftCaps.length === 0) pass++; else { fail++; console.error('✗ قدرات في القواعد غير معرّفة بالماتركس ولا allowlist:', driftCaps); }
if (driftPages.length === 0) pass++; else { fail++; console.error('✗ صفحات في القواعد غير معرّفة بالماتركس:', driftPages); }

// تقرير معلوماتي (لا يُفشل): الدين المعروف
const usedServerOnly = [...new Set(capsInRules)].filter((c) => SERVER_ONLY_CAPS.has(c));
console.log('ℹ️ صلاحيات server-only مستخدمة في القواعد (دين موثّق):', usedServerOnly.join(', ') || 'لا شيء');
console.log(`ℹ️ caps في القواعد=${new Set(capsInRules).size} · معرّفة بالماتركس=${[...new Set(capsInRules)].filter((c) => knownCaps.has(c)).length} · pages=${new Set(pagesInRules).size}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
