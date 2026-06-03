/**
 * SERVICES · firebase — محمّل Firebase كسول (dynamic import) ومصدر وصول وحيد.
 * الطبقة الوحيدة المسموح لها لمس Firebase. لا UI. (STANDARDS §1, §6)
 * firebase() → { auth, db, ...authFns, ...firestoreFns, clientActions }
 */
let _ready = null;

export function firebase() {
  if (!_ready) _ready = (async () => {
    const fi = await import('../../../core/firebase-init.js');
    const fa = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const fs = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const { clientActions } = await import('../../../client-actions.js');
    return { auth: fi.auth, db: fi.db, ...fa, ...fs, clientActions };
  })();
  return _ready;
}
