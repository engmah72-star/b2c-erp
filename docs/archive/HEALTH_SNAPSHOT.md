# HEALTH_SNAPSHOT.md

## 1) أمان firestore.rules
- /users update محمي بـ !isProtectedUserField()؟  **لا**
- catch-all مفتوح؟  `grep -c "document="` = **0**
- عدد "allow read: if true":  **3**
- storage.rules — قراءات مفتوحة لأي مصادَق:  **4**

## 2) التضخم
- HTML / JS / MD:  **58 / 58 / 45**
- CLAUDE.md:  **114795 bytes**
- أكبر 8 ملفات:
  1. clients.html — 144KB
  2. production.html — 136KB
  3. print.html — 128KB
  4. order-actions.js — 128KB
  5. shipping-accounts.html — 124KB
  6. orders.js — 116KB
  7. reports.html — 116KB
  8. accounts.html — 112KB

## 3) التكرار (Duplication)
- ملفات فيها firebaseConfig مضمّن:  **2**
- تكرار المنطق المالي:
  - financial-sync-engine.js: 3
  - finance-core.js: 3
  - order-actions.js: 1
  - orders.js: 1
  - shipping-actions.js: 1

## 4) خطر السكيل
- إجمالي onSnapshot:  **275**
- استخدامات limit():  **232**
- (النسبة = listeners غير محدودة تقريبًا ≈ 43)

## 5) Multi-tenant
- بتكتب tenantId:  **(لا شيء)**
- ناقصة tenantId:  order-actions.js · orders.js · client-actions.js · clients-data.js · supplier-actions.js · employee-actions.js

## 6) UI ميت / مكرر
- عدد ملفات *dashboard*:  **11**
- عدد ملفات *-ds.html (mockups):  **5**
