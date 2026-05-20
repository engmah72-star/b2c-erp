# SETTINGS.HTML MIGRATION — BEHAVIOR MAPPING REPORT

**النوع:** تقرير تشخيصي للـ migration المقترح لـ `settings.html`.
**التاريخ:** 2026-05-20
**Phase A #3:** يجب قراءته **قبل** الموافقة على الـ migration.

---

## 0) السياق

`settings.html` يستخدم `ROLE_PERMS_DEFAULTS` لما الـ admin يغيّر دور موظف:
```js
const permissions = ROLE_PERMS_DEFAULTS[role] || ROLE_PERMS_DEFAULTS.customer_service;
batch.update(doc(db,'users',uid), { role, permissions });
```

عند تغيير الدور → الـ permissions تُكتب فوق القديمة على users/{uid}.permissions.

---

## 1) Schema Comparison Per Role

### admin
| Field | settings.html (current) | canonical | الفرق |
|------|------------------------|-----------|------|
| pages | `['*']` | `['*']` | ✓ same |
| canSeePrices | `true` | `true` | ✓ |
| canSeeAllOrders | `true` | `true` | ✓ |
| canAddOrders | `true` | `true` | ✓ |
| canAddClients | `true` | `true` | ✓ |
| canAssignDesigner | `true` | `true` | ✓ |
| canAssignTasks | `true` | `true` | ✓ |
| canAccessAccounts | `true` | `true` | ✓ |
| canAccessEmployees | `true` | `true` | ✓ |
| **canViewClients** | ❌ missing | `true` | ⚠️ would EXPAND |
| **canViewCosts** | ❌ missing | `true` | ⚠️ would EXPAND |

**التقييم:** 9 fields shared = exact match. 2 fields في canonical غير موجودين.

### operation_manager
Same pattern — 9 fields match exactly، 2 extras in canonical (`canViewClients=true`, `canViewCosts=true`).

### customer_service
| Field | settings.html | canonical | الفرق |
|------|---------------|-----------|------|
| pages | `['clients','design','cs-dashboard']` | same | ✓ |
| canSeePrices | `true` | `true` | ✓ |
| canSeeAllOrders | `false` | `false` | ✓ |
| canAddOrders | `true` | `true` | ✓ |
| canAddClients | `true` | `true` | ✓ |
| canAssignDesigner | `true` | `true` | ✓ |
| **canViewClients** | ❌ | `true` | ⚠️ EXPAND |
| **canAssignTasks** | ❌ | `false` | يُكتب صراحة (no effective change) |
| **canViewCosts** | ❌ | `false` | يُكتب صراحة (no effective change) |
| **canAccessAccounts** | ❌ | `false` | يُكتب صراحة (no effective change) |
| **canAccessEmployees** | ❌ | `false` | يُكتب صراحة (no effective change) |

**التقييم:** 6 fields shared = exact match. 5 extras في canonical (4 منهم `false` بدون تأثير، 1 = `canViewClients=true` يوسّع).

### graphic_designer / design_operator / production_agent / wallet_manager
نفس النمط — 6 fields shared تتطابق، 5 extras في canonical (معظمها false).

### shipping_officer ⚠️ DRIFT FOUND
| Field | settings.html | canonical | الفرق |
|------|---------------|-----------|------|
| **pages** | `['shipping','shipping-dashboard','shipping-accounts']` (3) | `['shipping','shipping-dashboard','shipping-accounts','shipping-followup']` (4) | ⚠️ canonical يضيف `shipping-followup` |
| canSeePrices/canSeeAllOrders/canAddOrders/canAddClients/canAssignDesigner | `false` | `false` | ✓ نفس القيم |

**ملاحظة هامة:** الـ drift في `pages` ليس "expansion عشوائي" — إنه فرق موجود مسبقاً بين `employees.html` (يكتب 4 pages) و `settings.html` (يكتب 3 pages). الـ canonical يأخذ union من employees.html.

**القرار:** override صريح لقيمة `pages` لـ `shipping_officer` للحفاظ على EXACT behavior لـ settings.html (3 pages فقط). الـ drift يُسجَّل ويُعالَج لاحقاً (RULE G9).

---

## 2) خلاصة الـ Behavior Change المحتمل

### لو استخدمنا canonical كامل (NO projection):
🔴 **Permission Expansion potential:**
- **admin/operation_manager:** يُضاف `canViewClients=true` + `canViewCosts=true` (لكن admin/ops أصلاً يصلون لكل شيء — لا تأثير فعلي على الـ rules)
- **customer_service:** يُضاف `canViewClients=true` (CS كان يصل clients page عبر `pages:['clients',...]` لكن `canViewClients` لم يكن مكتوب — لو الـ rules تفحصه، تتغيّر الـ access)

**الـ Security Impact:**
- Admin/Ops: زيرو (لهم وصول مفتوح أصلاً)
- CS: **محتمل** — يحتاج فحص الـ rules لو تستخدم `canViewClients`

### لو استخدمنا projection (preserves exact behavior):
✅ **Zero expansion** — يكتب نفس الـ fields القديمة فقط.

---

## 3) القرار الموصى به

**Projection** — للالتزام بـ "no expansion، no reduction".

```js
// Fields per role (matches settings.html legacy exactly)
const SETTINGS_LEGACY_FIELDS = {
  admin:             ['pages','canSeePrices','canSeeAllOrders','canAddOrders','canAddClients','canAssignDesigner','canAssignTasks','canAccessAccounts','canAccessEmployees'],
  operation_manager: ['pages','canSeePrices','canSeeAllOrders','canAddOrders','canAddClients','canAssignDesigner','canAssignTasks','canAccessAccounts','canAccessEmployees'],
  // Non-admin roles: 6 fields only
  _default:          ['pages','canSeePrices','canSeeAllOrders','canAddOrders','canAddClients','canAssignDesigner'],
};

// Overrides لقيم تختلف عن canonical (drift معروف يجب الحفاظ على القيمة الـ legacy)
const SETTINGS_LEGACY_OVERRIDES = {
  shipping_officer: {
    // settings.html legacy لم يكن يكتب 'shipping-followup' — نحافظ على نفس السلوك
    pages: ['shipping', 'shipping-dashboard', 'shipping-accounts'],
  },
};

function _legacySettingsPermissions(role) {
  const full = getRoleDefaultPermissions(role);
  const fields = SETTINGS_LEGACY_FIELDS[role] || SETTINGS_LEGACY_FIELDS._default;
  const overrides = SETTINGS_LEGACY_OVERRIDES[role] || {};
  const result = {};
  fields.forEach(k => { result[k] = (k in overrides) ? overrides[k] : full[k]; });
  return result;
}
```

النتيجة: نفس الـ fields بنفس الـ values المكتوبة قبل الـ migration.

---

## 4) أثر التغيير على المستخدمين الحاليين

| الفئة | التأثير |
|------|---------|
| Admin يغيّر دور موظف بعد الـ migration | ✅ نفس الـ 6 fields (non-admin) أو 9 fields (admin/ops) — لا تغيير |
| موظفون موجودون في users/{uid}.permissions | ✅ صفر — لا يُلمَسون إلا عند تغيير الدور |
| Admin/Ops gain canViewClients/canViewCosts | ❌ لا يحدث (projection يحذفهم) |
| CS gains canViewClients | ❌ لا يحدث (projection يحذفه) |

---

## 5) Security Impact

| Concern | الحالة |
|---------|--------|
| Permission expansion | ✅ صفر (projection) |
| Permission reduction | ✅ صفر |
| Behavior change for new role assignments | ✅ صفر |
| Effect on existing Firestore docs | ✅ صفر |
| Effect on UI rendering | ✅ صفر |

---

## 6) Future Consideration (out of scope)

في PRs لاحقة، يمكن **تدريجياً** توسيع settings.html schema لتطابق canonical كامل (تكتب 11 field بدل 6/9). لكن:
- يتطلب moافقة صريحة منفصلة
- يتطلب التحقق من أن الـ rules تتعامل مع الـ fields الجديدة كما المطلوب
- خارج نطاق Phase A #3

---

## 7) خلاصة

✅ **الـ migration المقترح آمن:**
- نفس الـ fields بالضبط
- نفس الـ values
- نفس الـ behavior
- صفر expansion

✅ **يحقق هدف الـ Phase A:**
- إزالة `ROLE_PERMS_DEFAULTS` المحلية من settings.html
- استخدام canonical كـ single source of truth
- منع drift مستقبلي

---

**الخطوة التالية:** code change في settings.html (في نفس الـ PR).
