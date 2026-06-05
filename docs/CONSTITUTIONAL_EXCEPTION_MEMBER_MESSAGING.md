# Constitutional Exception — Member↔Member Messaging (عميل↔عميل)

> **Status:** APPROVED — limited scope, feature-flagged, reversible (E1).
> **Owner approval:** engmah72@gmail.com (session 2026-06-05).
> **Flag:** `messaging.memberToMember` (default **OFF**).

---

## 1) السياق الدستوري

الـ `CLAUDE.md` § BUSINESS DNA ينصّ صراحةً:

> «نظام ERP داخلي ... **ليس Marketplace ولا منصة عامة**. أي feature تخدم طرفاً
> خامساً = مرفوضة.»

محادثة **عميل↔عميل** (member↔member) تقترب من سلوك المنصّات الاجتماعية/الـ
Marketplace، فهي بطبيعتها **حالة حدّية** مع هذا المبدأ. لذلك لا تُفعّل تلقائياً.

## 2) القرار المعتمد

تُسمح محادثة عضو↔عضو **ضمن نطاق محدود ومعتمد** فقط، وفق الضوابط التالية:

1. **افتراضياً معطّلة** — العلم `messaging.memberToMember` قيمته الافتراضية `false`
   (الوضع الدستوري الآمن). النظام يتصرّف كـ ERP داخلي بحت ما لم يُفعَّل العلم.
2. **تفعيل صريح ومحدود** — التفعيل قرار تشغيلي واعٍ (rollout تدريجي عبر
   `localStorage`/URL param)، لا تغيير في سلوك النظام الأساسي، **قابل للتراجع
   فوراً** بإطفاء العلم (E1.reversible).
3. **مدخل واحد محروس** — كل فتح لمحادثة عضو↔عضو يمرّ حصراً عبر
   `clientActions.openClientThread({ kind: 'member' })`، وبه حارس يرفض العملية
   إن كان العلم مُطفأً (defense-in-depth، لا مسار موازٍ — H1.1/L1).

## 3) النطاق (Scope)

| البُعد | داخل النطاق | خارج النطاق |
|--------|-------------|-------------|
| الأطراف | عضو ↔ عضو (كلاهما عميل مسجَّل من الأطراف الأربعة) | أي طرف خامس |
| نقطة البداية | زر «💬 راسلني» على الكارت الشخصي (`/u/{username}` · `card.html`) | اكتشاف/بحث عام بين الغرباء |
| الشرط | الزائر عضو مسجَّل (`cpMemberUid`) **و** ليس صاحب الكارت **و** العلم مُفعّل | زائر غير مسجَّل |
| التخزين | `conversations/dm_{sortedUids}` (نفس مخطط الإنبوكس) | collection موازٍ جديد |

> **لا يتحوّل النظام إلى Marketplace:** لا توجد قوائم منتجات عامة، ولا تقييمات
> عامة، ولا اكتشاف مفتوح بين الغرباء — مجرد قناة تواصل ١:١ تبدأ من كارت شخصي
> يملكه عضو معروف. الأطراف تبقى الأربعة (شركة · عملاء · موظفين · موردين).

## 4) التفعيل / الإيقاف

```js
// تفعيل (console أو إعداد تشغيلي):
window.__featureFlags.setFeatureFlag('messaging.memberToMember', true);
// إيقاف فوري (تراجع):
window.__featureFlags.setFeatureFlag('messaging.memberToMember', false);
// أو عبر الرابط لجلسة واحدة:  ...?feat.messaging.memberToMember=1
```

## 5) الأمان

- لا تغيير في `firestore.rules` — يعمل ضمن قواعد `conversations` الحالية
  (participant-based: العميل مصادَق بـ Firebase Auth uid حقيقي).
- الحارس على مستوى الـ action (`openClientThread`) + شرط العرض على الكارت
  (UI) = دفاع متعدّد الطبقات.

## 6) المراجعة المستقبلية

عند تفعيل multi-tenant (G7)، يُضيَّق النطاق أكثر ليُسمح فقط بين أعضاء نفس
الـ tenant. حتى ذلك الحين، التسييج بالعلم هو آلية «النطاق المحدود المعتمد».
