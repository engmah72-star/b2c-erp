# حدود المعمارية — Messaging Layer ↔ Business Layer

> **الغرض:** تثبيت الحدّ بين طبقة المراسلة (قناة تواصل) وطبقة الأعمال (مصدر الحقيقة)
> ومنع تآكله مستقبلاً. **مرجع مُلزِم** — أي تطوير في المحادثات يخضع له.
> **مفروض آلياً:** `tests/architecture-messaging-boundary.test.mjs` (قفل static) +
> `tests/architecture-order-centric.test.mjs` (قفل سلوكي) + `firestore.rules` (fail-closed).
> **التحقق:** تم تدقيق الكود الفعلي — النظام **Order-Centric** والحدّ نظيف اليوم.

---

## 1) Messaging Layer — طبقة المراسلة

**مسؤوليتها (قناة تواصل فقط):**
- Conversations · Messages
- Reactions · Replies · Mentions
- Presence · Typing
- Read Receipts · Unread counters
- Notifications (إشعار/تنبيه — لا حالة عمل)
- Stories · Attachments (مرفقات التواصل)

**لا تملك أي Business State.** كُتّابها:
`inbox-actions.js` · `core/inbox-utils.js` · `features/inbox/views/*` ·
`features/customer-portal/services/chat.service.js` ·
`features/customer-portal/views/chat.view.js` · `…/conversations.view.js` ·
`inbox-badge.js` · (مستقبلاً: `core/messaging-policy.js`).

> **ملاحظة على Notifications:** قد **يقرأ** من collections تشغيلية (orders/tasks)
> لتركيب التنبيه — القراءة للعرض مسموحة؛ المحظور هو **الكتابة** أو تنفيذ منطق أعمال.

---

## 2) Business Layer — طبقة الأعمال

**مسؤوليتها (المصدر الوحيد للحقيقة — RULE 1):**
- Orders · Order Requests
- Revisions · Approvals
- Invoices · Payments
- Shipments · Settlements
- Timeline · Audit Trail
- Financial Events (FSE)

**هي مصدر الحقيقة الوحيد.** كُتّابها الرسميون:
`order-actions.js` · `orders.js` · `approval-actions.js` ·
`financial-sync-engine.js` · `finance-core.js`/`core/order-math.js` ·
`returns-core.js` · `wallet-actions.js` · `shipping-actions.js` ·
`functions/index.js` (Cloud Functions المُصادَق عليها).

---

## 3) القواعد الإلزامية

| # | القاعدة | الفرض |
|---|---------|-------|
| B1 | **Conversation لا تنشئ Order** | إنشاء الطلب عبر `createOrderRequest` → `createOrderFromRequest` → `createOrder` (atomic) |
| B2 | **Conversation لا تعتمد Design** | الاعتماد عبر CF `requestDesignApproval` → `orders.clientApproval` + timeline |
| B3 | **Conversation لا تنشئ Payment** | المدفوعات عبر `approval-actions`/FSE فقط |
| B4 | **Conversation لا تغيّر Stage** | المراحل عبر `advanceOrderStageWithLock` (transaction) فقط |
| B5 | **Conversation لا تنشئ Financial Event** | عبر `dispatchFinancialEvent` (FSE) من طبقة الأعمال فقط |
| B6 | **أي عملية تجارية تمر عبر Services/Actions الرسمية** | H1.1 — صفر كتابة أعمال مباشرة من طبقة المراسلة |

---

## 4) آلية الفرض (دفاع متعدّد الطبقات)

```
طبقة المراسلة ──(تواصل فقط)──▶ conversations / messages / presence / stories
      │  لا import أعمال · لا كتابة أعمال · لا منطق أعمال
      ▼
  ┌─ static lock: tests/architecture-messaging-boundary.test.mjs (R1 import · R2 fn · R3 collection)
  ├─ behavioral lock: tests/architecture-order-centric.test.mjs (مسارات الإنشاء/الاعتماد)
  └─ firestore.rules: fail-closed (قارئ العميل لا يقرأ internal/cost؛ كتابة الأعمال مقيّدة)
```

أي عملية تجارية = تمر عبر طبقة الأعمال (Actions/Services/Cloud Functions) حصراً.

---

## 5) الاستثناءات الموثّقة

| الحالة | الوضع | ملاحظة |
|--------|-------|--------|
| `client-actions.js` | **ملف مختلط** | فيه دوال مراسلة *و* دوال أعمال مشروعة (`createOrderRequest`) — لا يُقفَل كاملاً؛ محكوم بـ assertions مُوجَّهة في القفل السلوكي |
| `notifications.js` | **reader للعرض** | يقرأ orders/tasks لتركيب الجرس — مستثنى من قاعدة المنع (لا يكتب أعمالاً) |
| **Revision Request** | **استثناء معروف** | اليوم Message-Driven (شات فقط، لا كيان مُهيكل). خطة تحويله لـ Order-Driven في `docs/PERSONAL_CARD_MESSAGING_ROADMAP.md` (م3) — تحت feature-flag منفصل |

---

## 6) خريطة العمليات (Driver)

| العملية | الطبقة | الكتابة الفعلية |
|---------|:------:|------------------|
| إنشاء طلب · reorder | **Order** | `order_requests` → `orders` |
| اعتماد تصميم | **Order** | `orders.clientApproval` + timeline (CF) |
| تقدّم stage | **Order** | `orders.stage` + financial |
| دفعات/تسويات | **Order** | `transactions_v2`/`financial_ledger` + `orders` |
| **طلب تعديل** | **⚠️ Message** (استثناء معروف) | `conversations` فقط — لا كيان مُهيكل بعد |
| رسالة/تفاعل/قراءة | **Message** | `conversations`/`messages` |

> المرجع الكامل للتدقيق: `docs/ARCHITECTURE_CENTRALITY_AUDIT.md` · `docs/MESSAGING_SYSTEM_DESIGN.md`.
