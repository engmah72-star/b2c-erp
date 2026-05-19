# features/design — Bounded Context للتصميم

> **الحالة:** PR-1 من 7 PRs لـ Design Modular Refactoring.
> **المرجع:** `/docs/RFC-design-refactor.md`
> **الهدف:** توحيد `design.html` + `design-workspace.html` + `designer-dashboard.html` في bounded context واحد.

## الحالة الحالية (PR-1)

| المرحلة | الحالة |
|---|---|
| Skeleton + directory structure | ✅ |
| `repository.js` (Firestore data access) | ✅ كل subscribers مع `limit()` |
| `permissions.js` (role gates) | ✅ يستورد من `core/permissions-matrix.js` |
| `state.js` (pub/sub state) | ✅ |
| Services stubs | ✅ orders / upload / attendance |
| Components | ⏳ PR-2 |
| Modals | ⏳ PR-3 |
| Views | ⏳ PR-4 |
| Entry point + router | ⏳ PR-4 |
| Cutover (redirect shims) | ⏳ PR-5 |
| Repository enforcement | ⏳ PR-6 |
| Cleanup | ⏳ PR-7 |

## البنية

```
features/design/
├── repository.js       ← Firestore queries (G4) — كل subscribe* + getter*
├── permissions.js      ← Role-based access (RULE 8)
├── state.js            ← Module-scoped pub/sub state
├── services/
│   ├── orders.service.js       (STUB)
│   ├── upload.service.js       (STUB)
│   └── attendance.service.js   (STUB)
├── views/              ⏳ PR-4
├── components/         ⏳ PR-2
└── modals/             ⏳ PR-3
```

## قواعد التطوير في هذا الـ feature

1. **كل Firestore query تمر عبر `repository.js`** — لا direct queries في views/services.
2. **كل listener له `limit()`** — افتراضات في `LIMITS` constant.
3. **كل صلاحية حقل تمر عبر `permissions.js`** — لا `_PHONE_ROLES` محلية.
4. **كل كتابة مالية تستدعي `financial-sync-engine.js`** — لا direct `wallets`/`transactions_v2`/`financial_ledger`.
5. **كل modal/view عند unmount تستدعي cleanup** — لا listener leaks.
6. **state عبر `state.js` فقط** — لا `window.__xxx` globals.

## الـ Imports النظيف

```js
// من view أو modal:
import { db } from '../../core/firebase-init.js';
import { subscribeDesignOrders, LIMITS } from '../repository.js';
import { canSeePhone, getOrdersScope } from '../permissions.js';
import { getState, setState, subscribe } from '../state.js';
import * as ordersService from '../services/orders.service.js';
```

## التحقق من PR-1

```bash
# لا أحد يستدعي features/design/ بعد (additive only)
grep -rE "from ['\"].*features/design" --include="*.html" --include="*.js" \
  | grep -v "features/design/" \
  | wc -l
# المتوقع: 0
```
