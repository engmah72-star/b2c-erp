# SYSTEM UNIFICATION PLAN

**النوع:** خطة موحَّدة تجمع كل الـ audits وتُرَتِّب الأولويات.
**التاريخ:** 2026-05-20
**الفرع:** `claude/system-understanding-audit`
**القاعدة الذهبية:**
> **النظام يعمل بالفعل ومستقر تشغيلياً.**
> **التحسينات تدريجية وآمنة — لا rewrite، لا architecture جديدة.**

---

## 0) Inputs — الـ audits التي تم تجميعها

| التقرير | الحالة | الموضوع الأساسي |
|---------|--------|-----------------|
| `WORKFLOW_AUDIT.md` | merged #532 | order.stage transitions + W1 violations |
| `UI_AUDIT.md` | merged #535 | 5,759 inline styles، 4 hex codes تكرار |
| `CONSTANTS_AUDIT.md` | merged #543 | 1,400+ magic strings |
| `FIREBASE_AUDIT.md` | merged #547، corrected #559 | 58 collections + RULE 1 |
| `RULES_AUDIT.md` | merged #551 | 1238 سطر firestore rules + 2 HIGH findings |
| `SECURITY_AUDIT.md` | merged #552، #559 | Meta security — 0 backdoors |
| **`SETTINGS_AUDIT.md`** (جديد) | this PR | settings.html drift + ROLES duplication |
| **`SYSTEM_MAP.md`** (جديد) | this PR | كل الـ pages + collections + actions |

---

## 1) النظام في وضعه الحالي — أين نحن

### ✅ ما يعمل بشكل ممتاز
- **RULE 1** (FSE-only للمالية) — مطابق ~85%
- **RULE W1** (order.stage SoT) — ~90%
- **RULE G2** (Single Firebase config) — clean
- **RULE 8** (Data access boundaries) — defense-in-depth صحيح
- **3 Action modules** موجودة (order/product/supplier)
- **8 Foundation modules** مركزية
- **12 Governance charters** على main
- **6 تقارير تشخيصية سابقة** متاحة

### ⚠️ Drift معروفة وموثَّقة
- `design.html` / `production.html` heavy direct writes (stage transitions)
- `employee-profile.html` / `employees.html` no central actions
- ~50 hardcoded stage strings
- ~18 صفحة فيها inline role checks (P1 migration incomplete)
- ROLES + ROLE_PERMS_DEFAULTS مكرَّرة (settings audit)
- M1 (multi-tenant) غير مفعّل

### 🟢 ما لا يحتاج عمل
- Cloud Functions (42) — كلها compliant
- ML/Analytics collections (5) — write-only by Functions
- Storage (`core/storage-helpers.js`) — foundation موجود
- 4 Quick wins من UI/Constants audits (hex unified، .hide class، tokens)
- inbox.html (28 direct writes — messaging layer isolated، مقبول)
- accounts.html (FSE-paired writes — راجع #559 correction)

---

## 2) أولويات الترحيل المُوحَّدة (Top 15)

> **مرتَّبة حسب: Impact × Feasibility / Risk**

| # | Action | Pages | Charter(s) | Effort | Risk |
|---|--------|-------|-----------|--------|------|
| 1 | C2 migration: hardcoded stages → `ORDER_STAGES.*` | كل الـ pages | C2 | 2-3 days | Low |
| 2 | Centralize ROLES + ROLE_PERMS_DEFAULTS في `orders.js` | 3-5 files | C1.5 | 1 day | Low |
| 3 | P1 migration: inline role checks → `canDo()` | 18 pages (tier 1) | P1 | 2 days | Low |
| 4 | `design.html`: ترحيل لـ `orderActions.submitToPrinting` + `validatePayment` | 1 page | A1, V1 | 2-3 days | Medium |
| 5 | `production.html`: ترحيل لـ `orderActions.submitToShipping` | 1 page | A1 | 2-3 days | Medium |
| 6 | إنشاء `employee-actions.js` + ترحيل employees + profile | 2 pages | A1, V1 | 3 days | Medium |
| 7 | `settings.html` cleanup: dead `paymentMethods`، audit_logs، settings rule | 1 file | RULE 5 | 1 day | Low |
| 8 | UI W2 migration: `display:none` → `.hide` (file by file، يحتاج فحص JS toggle) | top 5 files | U1 | 3-4 days | Medium |
| 9 | UI W3/W4: typography + spacing tokens migration | top 5 files | U1 | 4-5 days | Low |
| 10 | UI W5: status badge utilities application | top 10 pages | U1 | 2 days | Low |
| 11 | `exec-cost-entry.html` read cost types from settings | 1 file | C1.5 | 0.5 day | Low |
| 12 | V3: phantom stages في ai-context.js cleanup | 1 file | W1 | 1 day | Low |
| 13 | `shipping-lite.html`: ترحيل لـ `orderActions.archiveOrder` | 1 page | A1 | 0.5 day | Low |
| 14 | G3 limit() audit شامل | كل onSnapshot | G3 | 2 days | Low |
| 15 | M1 multi-tenant rollout (Phase 2 epic) | كل النظام | M1 | 1-2 weeks | High |

---

## 3) Recommended Execution Order (Phases)

### Phase A — Foundation Cleanup (3-4 days)
**هدف:** صفقات سريعة منخفضة المخاطر تُحسِّن المركزية بدون لمس critical paths.
- ✅ #1 C2 stage strings migration
- ✅ #2 Centralize ROLES/defaults
- ✅ #3 P1 capability migration (tier 1)
- ✅ #7 settings cleanup
- ✅ #11 exec-cost-entry fix
- ✅ #13 shipping-lite

**النتيجة المتوقعة:** 6+ من الـ debt items closed، governance ↑.

### Phase B — Core Pages (5-7 days)
**هدف:** ترحيل أكبر 3 صفحات للـ central actions.
- ✅ #4 design.html
- ✅ #5 production.html
- ✅ #6 employee-actions.js + ترحيل

**النتيجة:** كل main workflow عبر central actions.

### Phase C — UI Quality (5-7 days)
**هدف:** تقليل inline styles + توحيد بصري.
- ✅ #8 W2 (.hide)
- ✅ #9 W3/W4 (typography/spacing)
- ✅ #10 W5 (status badges)

### Phase D — Polish (2 days)
- ✅ #12 ai-context cleanup
- ✅ #14 G3 limit audit

### Phase E — Multi-tenant (Phase 2 epic، ليس الآن)
- M1 rollout — يحتاج planning منفصل

---

## 4) ما **لن** يتم في هذه المرحلة

| البند | السبب |
|------|------|
| Rewrite design.html / production.html | الـ pages مستقرة — الترحيل تدريجي |
| Architecture changes كبيرة | charter حظر صريح |
| New collections | KISS principle |
| New pages | scope creep |
| Layers جديدة (DDD, hexagonal، إلخ) | over-engineering |
| Marketplace / multi-tenant scope | Phase 2 epic، خارج النطاق |

---

## 5) Approach للتنفيذ (لكل migration)

كل خطوة تتبع pattern موحَّد (مُجَرَّب في #534, #544, #555, #556):

1. **Read** — افهم الصفحة + dependencies
2. **Branch** — `claude/[charter]-migration-[page]`
3. **Smallest possible change** — `validatePayment` بدل inline check (مثال)
4. **Test** — smoke tests + syntax check
5. **PR** — draft، CI green قبل merge
6. **Merge واحد بواحد** — تجنب conflicts

**حد الـ PR:** لا تعديل > 200 سطر / PR (ما عدا audits).

---

## 6) Risk Management

| Risk | Mitigation |
|------|-----------|
| كسر workflow حالي | smoke tests + minimal changes |
| Conflicts بين PRs | merge واحد بواحد، rebase لو لزم |
| Audit findings خاطئة | verify كل claim بـ grep قبل تنفيذ |
| Drift بين الـ docs والكود | كل PR يحدّث الـ audit إذا لزم |
| Over-engineering | تطبيق KISS + يومين max per migration |

---

## 7) Success Metrics

| Metric | Baseline (الآن) | Target (بعد Phase A+B) |
|--------|----------------|------------------------|
| Pages using central actions | 3 | 8+ |
| Hardcoded stage strings | ~50 | < 10 |
| inline role checks | ~18 pages | < 5 |
| ROLES duplication | 5+ files | 1 file |
| RULE A1 compliance | ~20% | ~60% |
| RULE C2 compliance | ~30% | ~70% |
| RULE P1 compliance | ~40% | ~75% |

---

## 8) القاعدة الذهبية للتنفيذ

> **اقرأ أولاً، افهم الـ relationships، ثم عدّل بأصغر diff ممكن.**
>
> **لا تحذف بدون trace.**
> **لا تنقل logic بدون معرفة dependencies.**
> **أي refactor يجب أن يكون minimal impact.**

---

## 9) القرار التالي بيد المستخدم

التقارير الـ 8 (6 سابقة + 2 جديدة) مكتملة. **لا تنفيذ قبل موافقة على Phase A**.

السؤال للمستخدم:
- نبدأ بـ Phase A (Foundation Cleanup — 6 quick wins، 3-4 أيام)؟
- أم migration واحد محدد (مثلاً C2 migration للـ stages)؟
- أم تعديل الأولويات؟

أنا مستني توجيهك.

---

**نهاية الخطة. لا code changes حتى الآن.**
