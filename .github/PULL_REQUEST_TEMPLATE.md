<!--
PR Template — مكوّن من 6 أقسام إجبارية.
لا تَحذف أي قسم. اترك [ ] فارغة لو غير منطبقة، لكن املأها صراحة.
المرجع: REGRESSION_PREVENTION.md §8.
-->

## 📋 ما الذي يفعله هذا الـ PR

<!-- 1-3 سطور. اذكر الـ feature/bug + رابط Issue لو موجود. -->

## 🔒 Security Checklist

- [ ] لا كتابة جديدة على `wallets`/`transactions_v2`/`financial_ledger` خارج `financial-sync-engine.js` (FSE).
- [ ] لا collection جديد بدون قاعدة في `firestore.rules`.
- [ ] لا حقل حساس جديد (phone/PII/مالي) بدون تطبيق `RULE 8` في الـ UI + Rules.
- [ ] لا rule تسمح للمستخدم بتعديل `role`/`permissions`/`tenantId` على نفسه (راجع S0-1).
- [ ] لا hardcoded API key/secret خارج Cloud Functions Secrets.
- [ ] لو غيّرت `firestore.rules` → ركّضت Emulator tests (`firebase emulators:exec`).

## ⚡ Performance Checklist

- [ ] لا `onSnapshot` جديد بدون `limit()`.
- [ ] لا client-side filter يمكن أن يكون Firestore `where`.
- [ ] لا fetch لـ collection كامل عند pagination ممكنة.
- [ ] أي listener جديد له `unsubscribe` على `beforeunload`/navigation.

## 🌐 Tenant Awareness

- [ ] أي doc جديد يكتب `tenantId` (`getCurrentTenantId(userDoc)`).
- [ ] أي query جديد يفلتر بـ `where('tenantId','==', ...)`.
- [ ] أي rule جديد يستخدم `inSameTenant()` كأول شرط للقراءة/الكتابة.

## 🧪 Test Plan

- [ ] Smoke test يدوي على scenarios الـ critical (راجع REGRESSION_PREVENTION §9):
  - [ ] السيناريو الأساسي للـ feature يعمل.
  - [ ] الأدوار المعنية تشوف ما يجب + لا تشوف ما لا يجب.
  - [ ] الـ feature لا تكسر pages قديمة (orders, approvals, accounts).
- [ ] لو موّلت كود مالي → نفذت اختبار على `validate-financial.html`.
- [ ] لو موّلت rules → كتبت test في `tests/rules/` (لو الـ suite موجودة).

## 🔄 Backward Compatibility

- [ ] الصفحات القائمة تستمر شغّالة (اذكر أي صفحة تأثرت).
- [ ] لو schema change → migration script attached أو موصوف.
- [ ] لو حذف collection → عمليات soft-delete أو archive قبل الحذف الفعلي.

## ↩️ Rollback Plan

- [ ] كيف يُرجَع التغيير لو الـ production انكسر؟
- [ ] هل التراجع يحتاج backfill أو revert SQL؟

---

<!--
المرجع الكامل للقواعد:
- AUDIT_REPORT_v2.md (التشخيص)
- STABILIZATION_PLAN.md (التنفيذ)
- REGRESSION_PREVENTION.md (الحوكمة)
- CLAUDE.md (Rules 1-8 + G1-G10)
-->
