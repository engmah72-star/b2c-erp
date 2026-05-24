/**
 * Business2Card ERP — clients-bridge.js
 *
 * ━━━ ES MODULE → CLASSIC SCRIPT BRIDGE (RULE C2 · L1.5) ━━━
 *
 * clients.html still uses a classic <script> tag (because it bootstraps
 * Firebase via the compat SDK and the inline body relies on many
 * window-scoped declarations). That blocks `import` of ES modules from
 * its top-level scope.
 *
 * This bridge module is loaded as <script type="module"> BEFORE the
 * classic script. Its job: import the centralized helpers from core/
 * and attach them to `window` so the classic script can use them
 * without declaring local duplicates.
 *
 * Loading order in clients.html:
 *   1. classic <script>: parses + runs top-level (no calcRem usage at top-level)
 *   2. deferred <script type="module"> blocks (incl. this bridge): execute,
 *      populating window.calcRem etc.
 *   3. DOMContentLoaded fires → event handlers run → window.calcRem available
 *
 * NOTE: STAGE_AR is intentionally NOT bridged — clients.html uses the
 * emoji-prefixed variant from clients-constants.js, which differs from
 * core/shared-constants.js.
 */
import { calcRem } from './core/order-math.js';

if (typeof window !== 'undefined') {
  // Only set if the page hasn't already declared a local override.
  if (!window.calcRem) window.calcRem = calcRem;
}
