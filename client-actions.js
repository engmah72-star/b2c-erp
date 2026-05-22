/**
 * Business2Card ERP — client-actions.js
 *
 * ━━━ CENTRAL CLIENT ACTIONS LAYER (P1.1) ━━━
 *
 * طبقة الأفعال المركزية لـ Clients domain. كل CRUD على:
 *   - clients
 *   - client_followups
 *   - audit_logs
 *   - bizCard (sub-field on client)
 * يمر من هنا.
 *
 * مبني فوق:
 *   - withIdempotency()        — حماية من double-submit
 *   - auditEntry/opEntry/...   — universal audit invariant (H3)
 *   - Modular Firestore SDK    — متسق مع shipping-actions.js
 *
 * تصدير مزدوج:
 *   - ES module: import { clientActions } from './client-actions.js'
 *   - Global:    window.clientActions = clientActions
 *                (لـ clients.html اللي يستخدم Compat SDK)
 *
 * Actions:
 *   - addClient            — جديد + dedup check
 *   - editClient           — تعديل
 *   - deleteClient         — soft delete (isDeleted=true)
 *   - convertToActive      — legacy → active
 *   - saveBizCard          — تحديث bizCard subfield
 *   - saveFollowup         — add أو edit followup
 *   - markFollowupDone     — toggle done flag
 *   - deleteFollowup       — soft delete followup
 *
 * كل action يُرجع: { ok, errors[], warnings[], operationId?, ... }
 *
 * ⚠️ لا UI changes في هذا الـ PR — الـ migration للـ clients.html يحصل في P1.2+.
 */

import {
  doc, collection, getDoc, getDocs, addDoc, updateDoc,
  query, where, limit, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db as defaultDb } from './core/firebase-init.js';
import { withIdempotency } from './core/idempotency.js';
import { auditEntry, opEntry } from './core/audit.js';

// P1.2: clients.html uses Firebase Compat SDK and can't easily pass a
// modular `db` instance. When called from compat consumers, the `db`
// argument is omitted and we fall back to the shared modular default.
// Modular consumers (shipping.html, future pages) still pass their own
// `db` explicitly — same as shippingActions/orderActions.
// Each action below accepts `db = defaultDb` so both styles work.

// ══════════════════════════════════════════
// VALIDATORS (inline — domain restructure will move to validators.js)
// ══════════════════════════════════════════

/** EG mobile: 010/011/012/015 + 8 digits. */
const RE_EG_PHONE = /^01[0125][0-9]{8}$/;

function validateClientPayload({ name, phone1, phone2 = '', email = '' }) {
  const errors = [];
  if (!name || !name.trim()) errors.push('⚠️ اسم العميل مطلوب');
  if (!phone1 || !phone1.trim()) errors.push('⚠️ الهاتف الأساسي مطلوب');
  else if (!RE_EG_PHONE.test(phone1.trim())) errors.push('⚠️ رقم الهاتف الأساسي غير صحيح');
  if (phone2 && phone2.trim() && !RE_EG_PHONE.test(phone2.trim())) {
    errors.push('⚠️ رقم الهاتف الثاني غير صحيح');
  }
  if (email && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.push('⚠️ البريد الإلكتروني غير صحيح');
  }
  return { ok: errors.length === 0, errors, warnings: [] };
}

function validateFollowupPayload({ clientId, type, nextActionDate }) {
  const errors = [];
  if (!clientId) errors.push('⚠️ clientId مطلوب');
  if (!type) errors.push('⚠️ نوع المتابعة مطلوب');
  if (nextActionDate && isNaN(new Date(nextActionDate).getTime())) {
    errors.push('⚠️ تاريخ الإجراء التالي غير صالح');
  }
  return { ok: errors.length === 0, errors, warnings: [] };
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════

/** Loads client doc, returns null if not found / deleted. */
async function _loadClient(db, clientId) {
  if (!db || !clientId) return null;
  const snap = await getDoc(doc(db, 'clients', clientId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return { ...data, _id: clientId, _ref: snap.ref };
}

/** Phone-based dedup against Firestore. Returns first matching client or null. */
async function _findDuplicate(db, { phone1, phone2 = '', email = '', excludeId = '' }) {
  const col = collection(db, 'clients');
  const queries = [];
  if (phone1) queries.push(getDocs(query(col, where('phone1', '==', phone1), limit(2))));
  if (phone2) {
    queries.push(getDocs(query(col, where('phone1', '==', phone2), limit(2))));
    queries.push(getDocs(query(col, where('phone2', '==', phone2), limit(2))));
  }
  if (email) queries.push(getDocs(query(col, where('email', '==', email.toLowerCase()), limit(2))));

  const results = await Promise.all(queries);
  for (const snap of results) {
    for (const d of snap.docs) {
      if (d.id === excludeId) continue;
      const data = d.data();
      if (data.isDeleted) continue;
      return { ...data, _id: d.id };
    }
  }
  return null;
}

/** Audit-log helper (silent on failure — never blocks the main action). */
async function _logAudit(db, { action, details, userId, userName }) {
  try {
    await addDoc(collection(db, 'audit_logs'), {
      action,
      details: details || {},
      userId: userId || '',
      userName: userName || '',
      timestamp: serverTimestamp(),
      url: typeof location !== 'undefined' ? location.pathname : '',
    });
  } catch (e) {
    console.warn('[clientActions._logAudit] failed (non-blocking):', action, e?.message);
  }
}

// ══════════════════════════════════════════
// CLIENT CRUD
// ══════════════════════════════════════════

export const clientActions = {

  /**
   * إضافة عميل جديد. يفحص الـ dedup قبل الـ create.
   * Returns: { ok, errors, warnings, clientId?, duplicate? }
   *   - duplicate: لو في عميل بنفس الرقم/البريد → نُرجعه للـ UI يعرض dup modal
   */
  async addClient({ db = defaultDb, data, userId, userName }) {
    if (!data) return { ok: false, errors: ['⚠️ data مطلوبة'], warnings: [] };

    return withIdempotency(db, {
      actionType: 'add_client',
      entityId: 'new',
      actorId: userId || '',
      payload: { phone1: data.phone1, name: data.name },
    }, async (operationId) => {

      const v = validateClientPayload(data);
      if (!v.ok) return { ...v, operationId };

      // Phone-based dedup
      const dup = await _findDuplicate(db, {
        phone1: data.phone1,
        phone2: data.phone2,
        email: (data.email || '').toLowerCase(),
      });
      if (dup) {
        return {
          ok: false,
          errors: ['🔁 عميل موجود بنفس الرقم/البريد'],
          warnings: [],
          duplicate: dup,
          operationId,
        };
      }

      // Build doc
      const isLegacy = data.status === 'legacy';
      const docData = {
        ...data,
        email: (data.email || '').toLowerCase().trim(),
        phone1: (data.phone1 || '').trim(),
        phone2: (data.phone2 || '').trim(),
        name: (data.name || '').trim(),
        status: isLegacy ? 'legacy' : 'active',
        isDeleted: false,
        createdBy: userId || '',
        createdByName: userName || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      try {
        const ref = await addDoc(collection(db, 'clients'), docData);
        // Audit log entry (universal invariant H3)
        await _logAudit(db, {
          action: 'client.add',
          details: { clientId: ref.id, clientName: docData.name, phone1: docData.phone1 },
          userId, userName,
        });
        return {
          ok: true, errors: [], warnings: [],
          operationId, clientId: ref.id,
          action: 'add_client',
        };
      } catch (e) {
        return {
          ok: false,
          errors: [e.code === 'permission-denied'
            ? '🔒 ليس لديك صلاحية إضافة عملاء'
            : (e.message || 'فشل إضافة العميل')],
          warnings: [],
          operationId,
        };
      }
    });
  },

  /**
   * تعديل عميل موجود. يتتبّع التغييرات في editHistory[].
   */
  async editClient({ db = defaultDb, clientId, changes, userId, userName }) {
    if (!clientId) return { ok: false, errors: ['⚠️ clientId مطلوب'], warnings: [] };
    if (!changes || typeof changes !== 'object') {
      return { ok: false, errors: ['⚠️ changes مطلوبة'], warnings: [] };
    }

    return withIdempotency(db, {
      actionType: 'edit_client',
      entityId: clientId,
      actorId: userId || '',
      payload: { ...changes },
    }, async (operationId) => {

      const current = await _loadClient(db, clientId);
      if (!current) {
        return { ok: false, errors: ['⚠️ العميل غير موجود'], warnings: [], operationId };
      }
      if (current.isDeleted) {
        return { ok: false, errors: ['⛔ العميل محذوف'], warnings: [], operationId };
      }

      // If phone/email changed, run dedup
      const phone1Changed = changes.phone1 && changes.phone1 !== current.phone1;
      const phone2Changed = changes.phone2 && changes.phone2 !== current.phone2;
      const emailChanged  = changes.email  && (changes.email || '').toLowerCase() !==
                                              (current.email  || '').toLowerCase();
      if (phone1Changed || phone2Changed || emailChanged) {
        const dup = await _findDuplicate(db, {
          phone1: changes.phone1 || '',
          phone2: changes.phone2 || '',
          email: emailChanged ? (changes.email || '').toLowerCase() : '',
          excludeId: clientId,
        });
        if (dup) {
          return {
            ok: false,
            errors: ['🔁 عميل آخر بنفس الرقم/البريد'],
            warnings: [], duplicate: dup,
            operationId,
          };
        }
      }

      // Validate the merged result
      const merged = { ...current, ...changes };
      const v = validateClientPayload(merged);
      if (!v.ok) return { ...v, operationId };

      // Build edit-history entry via universal audit
      const editEntry = auditEntry({
        action: 'تعديل بيانات العميل',
        userId, userName,
        kind: 'edit',
        meta: { changedKeys: Object.keys(changes) },
      });

      try {
        await updateDoc(current._ref, {
          ...changes,
          editHistory: [...(current.editHistory || []), editEntry],
          updatedAt: serverTimestamp(),
        });
        return {
          ok: true, errors: [], warnings: [],
          operationId, clientId, action: 'edit_client',
        };
      } catch (e) {
        return {
          ok: false,
          errors: [e.code === 'permission-denied'
            ? '🔒 ليس لديك صلاحية تعديل العملاء'
            : (e.message || 'فشل تحديث العميل')],
          warnings: [],
          operationId,
        };
      }
    });
  },

  /**
   * Soft-delete عميل. نحتفظ بـ doc للـ history.
   */
  async deleteClient({ db = defaultDb, clientId, userId, userName, reason = '' }) {
    if (!clientId) return { ok: false, errors: ['⚠️ clientId مطلوب'], warnings: [] };

    return withIdempotency(db, {
      actionType: 'delete_client',
      entityId: clientId,
      actorId: userId || '',
      payload: {},
    }, async (operationId) => {

      const current = await _loadClient(db, clientId);
      if (!current) {
        return { ok: false, errors: ['⚠️ العميل غير موجود'], warnings: [], operationId };
      }
      if (current.isDeleted) {
        return {
          ok: true, errors: [], warnings: ['ℹ️ محذوف بالفعل'],
          operationId, clientId, action: 'delete_client', idempotent: true,
        };
      }

      const deleteAudit = auditEntry({
        action: 'حذف العميل (soft)',
        userId, userName, kind: 'op',
        meta: { reason },
      });

      try {
        await updateDoc(current._ref, {
          isDeleted: true,
          deletedAt: serverTimestamp(),
          deletedBy: userId || '',
          deletedByName: userName || '',
          editHistory: [...(current.editHistory || []), deleteAudit],
          updatedAt: serverTimestamp(),
        });
        await _logAudit(db, {
          action: 'client.soft_delete',
          details: { clientId, clientName: current.name || '', reason },
          userId, userName,
        });
        return {
          ok: true, errors: [], warnings: [],
          operationId, clientId, action: 'delete_client',
        };
      } catch (e) {
        return {
          ok: false,
          errors: [e.message || 'فشل حذف العميل'],
          warnings: [], operationId,
        };
      }
    });
  },

  /**
   * تحويل عميل من legacy → active.
   */
  async convertToActive({ db = defaultDb, clientId, userId, userName }) {
    if (!clientId) return { ok: false, errors: ['⚠️ clientId مطلوب'], warnings: [] };

    return withIdempotency(db, {
      actionType: 'convert_to_active',
      entityId: clientId,
      actorId: userId || '',
      payload: {},
    }, async (operationId) => {

      const current = await _loadClient(db, clientId);
      if (!current) {
        return { ok: false, errors: ['⚠️ العميل غير موجود'], warnings: [], operationId };
      }
      if (current.status !== 'legacy') {
        return { ok: false, errors: ['⛔ العميل ليس في حالة legacy'], warnings: [], operationId };
      }

      const entry = auditEntry({
        action: 'تحويل من legacy → active',
        userId, userName, kind: 'op',
      });

      try {
        await updateDoc(current._ref, {
          status: 'active',
          convertedAt: serverTimestamp(),
          convertedBy: userId || '',
          convertedByName: userName || '',
          editHistory: [...(current.editHistory || []), entry],
          updatedAt: serverTimestamp(),
        });
        return {
          ok: true, errors: [], warnings: [],
          operationId, clientId, action: 'convert_to_active',
        };
      } catch (e) {
        return { ok: false, errors: [e.message || 'فشل التحويل'], warnings: [], operationId };
      }
    });
  },

  // ════════════════════════════════════════
  // BIZCARD (sub-field on client doc)
  // ════════════════════════════════════════

  /**
   * تحديث بيانات بطاقة العمل (bizCard subfield).
   */
  async saveBizCard({ db = defaultDb, clientId, bizCard, userId, userName }) {
    if (!clientId) return { ok: false, errors: ['⚠️ clientId مطلوب'], warnings: [] };
    if (!bizCard || typeof bizCard !== 'object') {
      return { ok: false, errors: ['⚠️ bizCard data مطلوبة'], warnings: [] };
    }

    return withIdempotency(db, {
      actionType: 'save_bizcard',
      entityId: clientId,
      actorId: userId || '',
      payload: { fields: Object.keys(bizCard).sort().join(',') },
    }, async (operationId) => {

      const current = await _loadClient(db, clientId);
      if (!current) {
        return { ok: false, errors: ['⚠️ العميل غير موجود'], warnings: [], operationId };
      }

      const entry = auditEntry({
        action: 'تحديث بطاقة العمل',
        userId, userName, kind: 'edit',
        meta: { fields: Object.keys(bizCard) },
      });

      try {
        await updateDoc(current._ref, {
          bizCard: { ...(current.bizCard || {}), ...bizCard },
          bizCardLastEdit: {
            by: userId || '',
            byName: userName || '',
            at: serverTimestamp(),
          },
          editHistory: [...(current.editHistory || []), entry],
          updatedAt: serverTimestamp(),
        });
        return {
          ok: true, errors: [], warnings: [],
          operationId, clientId, action: 'save_bizcard',
        };
      } catch (e) {
        return { ok: false, errors: [e.message || 'فشل حفظ البطاقة'], warnings: [], operationId };
      }
    });
  },

  // ════════════════════════════════════════
  // FOLLOWUPS (client_followups collection)
  // ════════════════════════════════════════

  /**
   * إضافة أو تعديل followup. لو fId موجود → edit، وإلا add.
   */
  async saveFollowup({
    db = defaultDb, fId = '', clientId, type, outcome = '', note = '',
    nextActionDate = '', assignedTo = '',
    userId, userName,
  }) {
    const v = validateFollowupPayload({ clientId, type, nextActionDate });
    if (!v.ok) return { ...v };

    return withIdempotency(db, {
      actionType: fId ? 'edit_followup' : 'add_followup',
      entityId: fId || `new:${clientId}`,
      actorId: userId || '',
      payload: { type, outcome, nextActionDate },
    }, async (operationId) => {

      const data = {
        clientId, type, outcome, note,
        nextActionDate,
        nextActionDone: false,
        assignedTo: assignedTo || userId || '',
        updatedAt: serverTimestamp(),
      };

      try {
        if (fId) {
          // Edit existing — append to internal history
          const ref = doc(db, 'client_followups', fId);
          const snap = await getDoc(ref);
          if (!snap.exists()) {
            return { ok: false, errors: ['⚠️ المتابعة غير موجودة'], warnings: [], operationId };
          }
          const cur = snap.data();
          if (cur.isDeleted) {
            return { ok: false, errors: ['⛔ متابعة محذوفة'], warnings: [], operationId };
          }
          const entry = auditEntry({
            action: 'تعديل متابعة',
            userId, userName, kind: 'edit',
          });
          await updateDoc(ref, {
            ...data,
            editHistory: [...(cur.editHistory || []), entry],
          });
          return {
            ok: true, errors: [], warnings: [],
            operationId, fId, action: 'edit_followup',
          };
        }
        // Add new
        const entry = auditEntry({
          action: 'إضافة متابعة',
          userId, userName, kind: 'op',
        });
        const ref = await addDoc(collection(db, 'client_followups'), {
          ...data,
          isDeleted: false,
          createdBy: userId || '',
          createdByName: userName || '',
          createdAt: serverTimestamp(),
          editHistory: [entry],
        });
        return {
          ok: true, errors: [], warnings: [],
          operationId, fId: ref.id, action: 'add_followup',
        };
      } catch (e) {
        return {
          ok: false,
          errors: [e.code === 'permission-denied'
            ? '🔒 ليس لديك صلاحية'
            : (e.message || 'فشل حفظ المتابعة')],
          warnings: [], operationId,
        };
      }
    });
  },

  /**
   * Toggle nextActionDone على followup.
   */
  async markFollowupDone({ db = defaultDb, fId, done = true, userId, userName }) {
    if (!fId) return { ok: false, errors: ['⚠️ fId مطلوب'], warnings: [] };

    return withIdempotency(db, {
      actionType: 'mark_followup_done',
      entityId: fId,
      actorId: userId || '',
      payload: { done },
    }, async (operationId) => {

      const ref = doc(db, 'client_followups', fId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        return { ok: false, errors: ['⚠️ المتابعة غير موجودة'], warnings: [], operationId };
      }
      const cur = snap.data();
      if (cur.isDeleted) {
        return { ok: false, errors: ['⛔ متابعة محذوفة'], warnings: [], operationId };
      }

      const entry = auditEntry({
        action: done ? 'تم تنفيذ المتابعة' : 'إلغاء تنفيذ المتابعة',
        userId, userName, kind: 'op',
      });

      try {
        await updateDoc(ref, {
          nextActionDone: !!done,
          doneAt: done ? serverTimestamp() : null,
          doneBy: done ? (userId || '') : '',
          doneByName: done ? (userName || '') : '',
          editHistory: [...(cur.editHistory || []), entry],
          updatedAt: serverTimestamp(),
        });
        return {
          ok: true, errors: [], warnings: [],
          operationId, fId, action: 'mark_followup_done', done,
        };
      } catch (e) {
        return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [], operationId };
      }
    });
  },

  /**
   * Soft-delete followup.
   */
  async deleteFollowup({ db = defaultDb, fId, userId, userName, reason = '' }) {
    if (!fId) return { ok: false, errors: ['⚠️ fId مطلوب'], warnings: [] };

    return withIdempotency(db, {
      actionType: 'delete_followup',
      entityId: fId,
      actorId: userId || '',
      payload: {},
    }, async (operationId) => {

      const ref = doc(db, 'client_followups', fId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        return { ok: false, errors: ['⚠️ المتابعة غير موجودة'], warnings: [], operationId };
      }
      const cur = snap.data();
      if (cur.isDeleted) {
        return {
          ok: true, errors: [], warnings: ['ℹ️ محذوفة بالفعل'],
          operationId, fId, action: 'delete_followup', idempotent: true,
        };
      }

      const entry = auditEntry({
        action: 'حذف متابعة',
        userId, userName, kind: 'op',
        meta: { reason },
      });

      try {
        await updateDoc(ref, {
          isDeleted: true,
          deletedAt: serverTimestamp(),
          deletedBy: userId || '',
          deletedByName: userName || '',
          editHistory: [...(cur.editHistory || []), entry],
          updatedAt: serverTimestamp(),
        });
        return {
          ok: true, errors: [], warnings: [],
          operationId, fId, action: 'delete_followup',
        };
      } catch (e) {
        return { ok: false, errors: [e.message || 'فشل الحذف'], warnings: [], operationId };
      }
    });
  },
};

// ══════════════════════════════════════════
// EXPORT — ES module + window global
// ══════════════════════════════════════════

export default clientActions;

// Expose to window so compat-SDK pages (clients.html) can call clientActions.*
// without converting to type="module".
if (typeof window !== 'undefined') {
  window.clientActions = clientActions;
}
