# خطة تطوير — نظام المحادثات داخل الكروت الشخصية

> **النطاق:** خطة تنفيذ متدرّجة لطبقات المحادثة الثلاث المرتبطة بالكارت الشخصي:
> (١) موظف↔موظف · (٢) عميل↔موظف · (٣) عميل↔عميل.
> **المبدأ الحاكم (E1):** كل مرحلة *incremental · backward-compatible · feature-flagged ·
> reversible · alongside-not-instead*. لا big-bang، لا حذف legacy حامل للأحمال.
> **التوافق الدستوري:** BUSINESS DNA (4 أطراف · ليس Marketplace) · L1 (الصفحة view) ·
> H1.1 (الكتابة عبر actions) · RULE 3 (atomic) · G3 (bounded) · H3 (audit) · RULE 8 (حقول حسّاسة).
> **المرجع المعماري الكامل:** `docs/MESSAGING_SYSTEM_DESIGN.md`.
> **الاستثناء الدستوري لعميل↔عميل:** `docs/CONSTITUTIONAL_EXCEPTION_MEMBER_MESSAGING.md`.

---

## 0) أين نحن الآن (خط الأساس)

| القدرة | الحالة | المصدر |
|--------|--------|--------|
| محادثة داخلية للموظفين (DM/قنوات/خيوط أوردر) | ✅ مكتملة | `inbox.html` · `inbox-actions.js` |
| محادثة عميل↔موظف (order/support) | ✅ مكتملة | `openClientThread` · `chat.view` · `conversations.view` |
| محادثة عميل↔عميل (member) | ✅ مُسيَّجة خلف flag | `openClientThread({kind:'member'})` + `messaging.memberToMember` |
| زر «راسلني» على الكارت الشخصي | ✅ (هذا الـ PR) | `card.html` · `functions/public-profile.js` |
| deep-link الكارت → البوابة | ✅ (هذا الـ PR) | `portal.entry.js (?chat=)` |
| اختبار الحارس الدستوري | ✅ (هذا الـ PR) | `tests/messaging-member-guard.test.mjs` |

**الفجوات المعروفة** (من تدقيق `MESSAGING_SYSTEM_DESIGN.md §2):** قواعد أمان واسعة ·
لا rate-limit · لا pagination · لا بحث · إشعارات client-synthesized · لا internal-notes ·
لا triage/SLA · لا admin console.

---

## المرحلة 1 — تثبيت أساس الكارت + تصليب الأمان (Hardening)
**التعقيد: S–M · الأولوية: 🔴 أعلى · العلم: `messaging.memberToMember` (موجود)**

نُكمل حلقة «الكارت ↔ المحادثة» ونغلق أخطر الثغرات الأمنية قبل أي توسّع.

1. **إشعار «راسلني» للطرف الآخر** — عند فتح محادثة عضو من الكارت، أرسل
   `notifications` للمستقبِل (رابط `cp-shell.html?chat=...`) عبر `clientActions`
   (نفس نمط `respondToNeed`). الآن المستقبِل يكتشف المحادثة فوراً.
2. **تصليب `firestore.rules` (field-scoped):**
   - `messages.update`: مشارك يحدّث **فقط** `readBy[self]` و`reactions.*[self]`؛
     النص يعدّله **المؤلف** ضمن نافذة زمنية فقط (`request.resource.data.diff()`).
   - `notifications.create`: تضييق من `isAuth()` إلى **منع الانتحال**
     (`request.resource.data.toUid != request.auth.uid` ممنوع إلا للموظفين/Functions).
3. **Atomic send (RULE 3):** توحيد `sendClientMessage`/`sendMessage` على
   `writeBatch` واحد (الرسالة + ملخّص المحادثة + `increment` العدّادات).
4. **حدّ معدّل بدائي (anti-spam):** عدّاد بسيط لكل uid (نافذة 10ث) في طبقة الـ action.
5. **اختبارات قواعد (emulator):** عميل لا يقرأ محادثة ليس فيها · لا ينتحل إشعاراً ·
   لا يعدّل نص غيره · عزل عميل↔عميل.

**معيار القبول:** زر الكارت يفتح محادثة + إشعار يصل · لا انتحال إشعارات · لا تعديل نصوص الغير.

---

## المرحلة 2 — تجربة الكارت الكاملة + النطاق المحدود المعتمد
**التعقيد: M · الأولوية: 🟠 · العلم: `messaging.memberToMember` (تفعيل تدريجي)**

نُنضج محادثة عميل↔عميل لتكون «نطاقاً محدوداً معتمداً» حقيقياً لا مجرد flag.

1. **تضييق النطاق (Scope guard):** بدل فتح حر لأي عضو، اسمح فقط ضمن سياق معروف
   (إحالة `?ref=` · أو احتياج `business_needs` · أو نفس tenant لاحقاً G7). يُفرض في
   `openClientThread({kind:'member'})` بمعامل `context` موثّق.
2. **بطاقة المُرسِل في المحادثة:** أول رسالة عضو↔عضو تحمل `cardRef` (لقطة كارت
   المُرسِل) فيرى المستقبِل من يكلّمه قبل القبول.
3. **قبول/حظر (consent):** المستقبِل يقبل أول محادثة عضو أو يحظرها
   (`blockedBy[]` على مستوى المستخدم) — يمنع الإزعاج (حماية DNA من سلوك المنصّات).
4. **تكافؤ الكارتين:** زر «راسلني» على `/u/{username}` و`card.html` يفتحان نفس
   `dm_{sortedUids}` بلا ازدواج (توحيد بالفعل عبر المدخل المركزي).
5. **Pagination للرسائل:** أحدث `limit(50)` + «تحميل أقدم» (يحل سقف 200).

**معيار القبول:** لا محادثة عضو خارج سياق · المستقبِل يقبل/يحظر · لا إزعاج عشوائي.

---

## المرحلة 3 — توحيد الإشعارات + خيط الأوردر الغني
**التعقيد: M–L · الأولوية: 🟠 · علم: `messaging.serverNotifications`**

1. **مُصدِر إشعارات مركزي (Cloud Function):** يستبدل الـ client-synthesis —
   trigger على رسالة جديدة/mention → كتابة `/notifications` (Admin SDK) مع
   `dedupeKey` واحترام `mutedBy`. الجرس يصبح قارئاً واحداً مُرقَّماً.
2. **اعتماد التصميم داخل الخيط:** رسالة `design_proof` → أزرار [اعتماد]/[تعديل]
   في خيط `clord_*` → كتابة `approval` ذرّياً + دفع workflow الأوردر (dual-write مع
   `client_decisions` ثم تقاعد المسار القديم — E1).
3. **رسائل الحالة/الفاتورة:** خيط الأوردر يقرأ `order.stage`/`getOrderDates()`
   (المصدر الوحيد) ويعرض timeline + رابط الفاتورة. لا حالة مكرّرة في الشات.
4. **back-pointer:** `order.conversationId` ليفتح صفحة الأوردر الخيط مباشرة.

**معيار القبول:** الجرس قارئ واحد · اعتماد العميل يظهر كرسالة مُدقَّقة ويحرّك الأوردر.

---

## المرحلة 4 — فريق داخلي + Triage + إشراف
**التعقيد: M · الأولوية: 🟡 · علم: `messaging.triage` · capability: `manage_conversations`**

1. **مسار الملاحظات الداخلية (`lane:"internal_note"`):** تعليقات طاقم خفيّة عن
   العميل داخل أي خيط (handoff/تحذيرات) — تُحجب server-side عن قارئ العميل (RULE 8).
2. **حالة وتعيين المحادثة:** `status (open/pending/resolved/closed)` · `assignedTo`
   · `priority` · `tags` — كل انتقال مُدقَّق (`auditEntry` · H3).
3. **تصعيد + SLA:** مؤقّتات (Cloud Function) + إشعار خرق + لوحة admin
   monitor-all (مقيّدة بـ `manage_conversations`).
4. **مقاييس الأداء:** زمن أول ردّ · زمن الحل · backlog (تعيد استخدام أنماط
   `core/report-actions.js`).

**معيار القبول:** CS يصعّد/يحل · admin يراقب الكل · العميل لا يرى ملاحظات داخلية أبداً.

---

## المرحلة 5 — أتمتة · بحث · مؤسسي
**التعقيد: L · الأولوية: ⚪ · أعلام مستقلة لكل بند**

1. **بحث الرسائل:** فهرس مُفكّك (Firestore) → ترقية لـ Typesense عند الحاجة.
2. **AI assist:** تصنيف/توجيه تلقائي · ردود مقترحة · تلخيص خيط (`ai-engine.js`).
3. **Multi-tenant (G7):** `tenantId` على كل conv/message/notification + فلترة —
   هنا يضيق نطاق عميل↔عميل ليُسمح فقط داخل نفس الـ tenant (تفعيل الاستثناء آلياً).
4. **احتفاظ/أرشفة + AV على المرفقات + CSAT.**

---

## مصفوفة الأعلام (Feature Flags)

| العلم | الافتراضي | يحرس |
|-------|-----------|------|
| `messaging.memberToMember` | OFF | محادثة عميل↔عميل (استثناء دستوري) — **موجود** |
| `messaging.serverNotifications` | OFF | مُصدِر الإشعارات المركزي (م3) |
| `messaging.triage` | OFF | الحالة/التعيين/الملاحظات الداخلية (م4) |
| `messaging.search` | OFF | بحث الرسائل (م5) |

> كل علم default OFF = الوضع الدستوري الآمن. التفعيل = قرار تشغيلي قابل للتراجع فوراً.

---

## خريطة المخاطر

| الخطر | الشدّة | التخفيف |
|-------|--------|---------|
| تصليب القواعد يكسر reactions/receipts | 🔴 | اختبارات emulator قبل النشر · field-diff دقيق |
| انجراف ترحيل `client_decisions` للخيوط | 🟠 | dual-write window + مطابقة (E1) |
| عميل↔عميل ينزلق لسلوك Marketplace | 🟠 | scope guard + consent/block + default OFF + توثيق الاستثناء |
| تضخّم `inbox.html` (G5 >1500 سطر) | 🟡 | استخراج المنطق لـ `inbox-actions`/control-center أثناء م1–م3 |
| كلفة listeners/بحث | 🟡 | pagination · فهرس مُفكّك أولاً |

---

## ترتيب التنفيذ المقترح

1. **م1** (تصليب أمني + إشعار الكارت) — أعلى ROI وأقل مخاطرة.
2. **م2** (scope + consent) — يحوّل عميل↔عميل لاستثناء معتمد آمن فعلاً.
3. **م3** (إشعارات مركزية + اعتماد في الخيط).
4. **م4** (triage + إشراف) ثم **م5** (بحث/AI/tenant).

> كل مرحلة: PR مستقل · خلف علم · مع اختبارات · ومراجعة `/security-review` قبل الدمج.
