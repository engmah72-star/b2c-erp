/**
 * Business2Card ERP — error-reporter-init.js
 *
 * Page-level bootstrap for the error reporter. Loaded as a deferred
 * ES module from any page that wants automatic error capture.
 *
 * Flow:
 *   1. Import core/error-reporter.js + Firebase init
 *   2. Install global hooks immediately (so early errors are caught)
 *   3. Update user info once auth resolves
 *
 * Side-effect: also loads the floating bug widget (bug-reporter.js)
 * if not already loaded — handles both module + classic-script pages.
 */

import { installErrorReporter, setUser } from './core/error-reporter.js';
import { auth, db } from './core/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// 1) Install hooks ASAP — db is non-null, errors get buffered if offline
installErrorReporter({ db });

// 2) Update user info when auth resolves
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    setUser(null);
    return;
  }
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const ud = snap.exists() ? snap.data() : {};
    setUser({
      uid:  user.uid,
      name: ud.name || ud.displayName || user.email || '',
      role: ud.role || '',
    });
  } catch {
    setUser({ uid: user.uid, name: user.email || '', role: '' });
  }
});

// 3) Load the floating bug widget (classic script — works on any page)
if (!document.querySelector('script[src*="bug-reporter.js"]')) {
  const s = document.createElement('script');
  s.src = './bug-reporter.js?v=1';
  s.defer = true;
  document.head.appendChild(s);
}
