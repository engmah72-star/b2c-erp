# tests/ — Regression Test Suite

> **المرجع:** REGRESSION_PREVENTION.md §9.

## التنظيم

```
tests/
├── rules/      ← Firestore rules tests (@firebase/rules-unit-testing)
└── smoke/      ← Critical workflow smoke tests
```

## Tier 1 — Smoke Tests (هدف: 35 test، يشتغلون < 60 ثانية)

### الحالة الآن
- ✅ 3 tests starter في `tests/rules/` (S0-1, S0-2, S0-3).
- ⏳ 32 test متبقّية — الـ Sprint plan في STABILIZATION_PLAN §17.

## كيفية التشغيل (محلياً)

```bash
# Setup أول مرة
npm install -g firebase-tools
cd tests/rules
npm init -y
npm install --save-dev @firebase/rules-unit-testing firebase-tools

# تشغيل الـ Emulator + tests
firebase emulators:exec --only firestore "npm test"
```

## تشغيل اختبارات المنطق النقي (`tests/*.test.mjs`)

لا تحتاج emulator ولا شبكة — `_loaders/hooks.mjs` يستبدل Firebase SDK بـ stub محلي.

```bash
# كل السويت
node --import ./tests/_loaders/register.mjs --test tests/*.test.mjs

# ملف واحد
node --import ./tests/_loaders/register.mjs --test tests/core-order-math.test.mjs
```

## CI Integration

- **`tests/rules/`** (Firestore/Storage rules) → job `rules-tests` في
  `.github/workflows/pr-quality.yml` (emulator، blocking).
- **`tests/*.test.mjs`** (المنطق النقي) → job `unit-tests` في نفس الملف
  (blocking). دي شبكة الأمان ضد regressions «صلّحت حاجة فبوّظت تانية»:
  أي تعديل يكسر منطقاً مركزياً في وحدة أخرى يُفشل الـ PR قبل الدمج.

## القواعد

1. **كل تعديل على `firestore.rules` يحتاج test** (RULE G8).
2. **كل تعديل على `financial-sync-engine.js` يحتاج test** (RULE G8).
3. **Tests should be deterministic** — لا time-based assertions بدون freezing.
4. **Tests should be isolated** — كل test ينظف بعد نفسه.
