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
  doc, collection, getDoc, getDocs, addDoc, updateDoc, writeBatch,
  query, where, limit, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db as defaultDb } from './core/firebase-init.js';
import { withIdempotency } from './core/idempotency.js';
import { auditEntry, opEntry } from './core/audit.js';
import { planClientMerge } from './features/clients/duplicate-scan.js';

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
  const p1 = (phone1 || '').trim();
  const p2 = (phone2 || '').trim();
  if (!name || !name.trim()) errors.push('⚠️ اسم العميل مطلوب');
  if (!p1) errors.push('⚠️ الهاتف الأساسي مطلوب');
  else if (!RE_EG_PHONE.test(p1)) errors.push('⚠️ رقم الهاتف الأساسي غير صحيح');
  if (p2 && !RE_EG_PHONE.test(p2)) {
    errors.push('⚠️ رقم الهاتف الثاني غير صحيح');
  }
  // Self-duplicate: same number entered in both fields on same client
  if (p1 && p2 && p1 === p2) {
    errors.push('⚠️ الهاتف الأساسي والثاني لا يصح أن يكونا متطابقين');
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

/**
 * Phone-based dedup against Firestore. Returns first matching client or null.
 *
 * Each candidate phone (p1, p2) is checked against BOTH phone1 and phone2
 * columns — symmetric coverage. Inputs are trimmed defensively so a value
 * like '010X ' (trailing space) still matches existing '010X' in storage.
 */
async function _findDuplicate(db, { phone1, phone2 = '', email = '', excludeId = '' }) {
  const p1 = (phone1 || '').trim();
  const p2 = (phone2 || '').trim();
  const em = (email || '').toLowerCase().trim();
  const col = collection(db, 'clients');
  const queries = [];
  if (p1) {
    queries.push(getDocs(query(col, where('phone1', '==', p1), limit(2))));
    queries.push(getDocs(query(col, where('phone2', '==', p1), limit(2))));
  }
  if (p2) {
    queries.push(getDocs(query(col, where('phone1', '==', p2), limit(2))));
    queries.push(getDocs(query(col, where('phone2', '==', p2), limit(2))));
  }
  if (em) queries.push(getDocs(query(col, where('email', '==', em), limit(2))));

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

      // Normalize phone/email on write so future dedup queries hit cleanly.
      const normalized = { ...changes };
      if (typeof normalized.phone1 === 'string') normalized.phone1 = normalized.phone1.trim();
      if (typeof normalized.phone2 === 'string') normalized.phone2 = normalized.phone2.trim();
      if (typeof normalized.email  === 'string') normalized.email  = normalized.email.toLowerCase().trim();
      if (typeof normalized.name   === 'string') normalized.name   = normalized.name.trim();

      try {
        await updateDoc(current._ref, {
          ...normalized,
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

  /**
   * Merge duplicate clients into a primary. Reassigns related docs
   * (orders, client_followups, design_items, returns_tickets) from each
   * duplicate → primary in a single atomic batch, then soft-deletes the
   * duplicates with `mergedInto=primaryId`.
   *
   * Append-only / FSE-managed collections are NOT modified:
   *   - financial_ledger (RULE H1.3)
   *   - transactions_v2  (RULE H1.3) — linked to orders via `orderId`, so
   *     they implicitly follow when orders move; no clientId redirect needed
   *
   * Refuses if any duplicate has a non-zero customer_wallets balance —
   * user must refund/transfer manually first (RULE G6 — engine writes only).
   *
   * @returns {{ ok, errors, warnings, operationId, primaryId?, merged?, movedCounts? }}
   */
  async mergeDuplicates({ db = defaultDb, primaryId, duplicateIds = [], userId, userName }) {
    if (!primaryId) return { ok: false, errors: ['⚠️ primaryId مطلوب'], warnings: [] };
    if (!Array.isArray(duplicateIds) || !duplicateIds.length) {
      return { ok: false, errors: ['⚠️ duplicateIds مطلوبة'], warnings: [] };
    }
    if (duplicateIds.includes(primaryId)) {
      return { ok: false, errors: ['⚠️ primaryId مش ممكن يكون ضمن duplicateIds'], warnings: [] };
    }

    return withIdempotency(db, {
      actionType: 'merge_clients',
      entityId: primaryId,
      actorId: userId || '',
      payload: { duplicateIds: [...duplicateIds].sort() },
      windowMs: 30000,
    }, async (operationId) => {

      // Defense: restrict to admin / operation_manager (Firestore rules allow
      // CS reps with canFollowUpClients to update clients — too broad for merge).
      try {
        const uSnap = await getDoc(doc(db, 'users', userId || ''));
        const role = uSnap.exists() ? (uSnap.data().role || '') : '';
        if (!['admin', 'operation_manager'].includes(role)) {
          return { ok: false, errors: ['🔒 ليس لديك صلاحية الدمج (admin / operation_manager فقط)'], warnings: [], operationId };
        }
      } catch (e) {
        return { ok: false, errors: ['🔒 فشل التحقق من الصلاحية: ' + (e.message || e)], warnings: [], operationId };
      }

      // Load primary + each duplicate
      const primary = await _loadClient(db, primaryId);
      if (!primary) return { ok: false, errors: ['⚠️ العميل الأساسي غير موجود'], warnings: [], operationId };
      if (primary.isDeleted) return { ok: false, errors: ['⛔ العميل الأساسي محذوف'], warnings: [], operationId };

      // Load all duplicates in parallel (was serial — slow on 20+ dups).
      console.log('[mergeDuplicates] loading', duplicateIds.length, 'duplicates...');
      const loadedDups = await Promise.all(duplicateIds.map((id) => _loadClient(db, id)));
      const dups = [];
      for (let i = 0; i < duplicateIds.length; i++) {
        const d = loadedDups[i];
        const id = duplicateIds[i];
        if (!d) return { ok: false, errors: [`⚠️ العميل ${id} غير موجود`], warnings: [], operationId };
        if (d.isDeleted) return { ok: false, errors: [`⛔ العميل "${d.name || id}" محذوف بالفعل`], warnings: [], operationId };
        dups.push(d);
      }
      console.log('[mergeDuplicates] loaded', dups.length, 'dups; querying related docs...');

      // Collect related docs across all dups (parallel queries per dup).
      // transactions_v2 is append-only (H1.3) AND linked to orders via orderId
      // — when orders move to primary, txs follow implicitly. No redirect here.
      const relatedByDup = await Promise.all(dups.map(async (d) => {
        const [oSnap, fSnap, diSnap, rtSnap, cwSnap] = await Promise.all([
          getDocs(query(collection(db, 'orders'),           where('clientId', '==', d._id), limit(500))),
          getDocs(query(collection(db, 'client_followups'), where('clientId', '==', d._id), limit(500))),
          getDocs(query(collection(db, 'design_items'),     where('clientId', '==', d._id), limit(500))),
          getDocs(query(collection(db, 'returns_tickets'),  where('clientId', '==', d._id), limit(500))),
          getDoc(doc(db, 'customer_wallets', d._id)),
        ]);
        return {
          dup: d,
          orders:    oSnap.docs.map(x => ({ ref: x.ref, id: x.id })),
          followups: fSnap.docs.map(x => ({ ref: x.ref, id: x.id })),
          design:    diSnap.docs.map(x => ({ ref: x.ref, id: x.id })),
          returns:   rtSnap.docs.map(x => ({ ref: x.ref, id: x.id })),
          wallet:    cwSnap.exists() ? { _id: d._id, ...cwSnap.data() } : { _id: d._id, balance: 0 },
        };
      }));

      // Tally counts for planner — transactions intentionally excluded
      const counts = relatedByDup.reduce((acc, r) => ({
        orders:         acc.orders         + r.orders.length,
        transactions:   0, // not redirected — implicit follow via orderId
        followups:      acc.followups      + r.followups.length,
        designItems:    acc.designItems    + r.design.length,
        returnsTickets: acc.returnsTickets + r.returns.length,
      }), { orders: 0, transactions: 0, followups: 0, designItems: 0, returnsTickets: 0 });

      const dupWallets = relatedByDup.map(r => r.wallet);

      // Pure planner validates + computes merged gallery + total ops
      console.log('[mergeDuplicates] related counts:', counts);
      const plan = planClientMerge({ primary, duplicates: dups, counts, dupWallets });
      if (!plan.ok) {
        console.warn('[mergeDuplicates] plan rejected:', plan.errors);
        return { ok: false, errors: plan.errors, warnings: plan.warnings, operationId };
      }
      console.log('[mergeDuplicates] plan ok — totalOps:', plan.totalOps, '— building batch...');

      // Build atomic batch
      const batch = writeBatch(db);
      const movedAt = serverTimestamp();
      const primaryName = primary.name || '';

      const reassign = (ref, dupId) => batch.update(ref, {
        clientId: primaryId,
        clientName: primaryName,
        mergedFromClientId: dupId,
        mergedAt: movedAt,
      });

      for (const r of relatedByDup) {
        r.orders   .forEach(x => reassign(x.ref, r.dup._id));
        r.followups.forEach(x => batch.update(x.ref, {
          clientId: primaryId, mergedFromClientId: r.dup._id, mergedAt: movedAt,
        }));
        r.design   .forEach(x => reassign(x.ref, r.dup._id));
        r.returns  .forEach(x => reassign(x.ref, r.dup._id));

        // Soft-delete the duplicate
        const dupEntry = auditEntry({
          action: `🔀 تم دمج هذا العميل في "${primaryName}"`,
          userId, userName, kind: 'op',
          meta: { mergedInto: primaryId, operationId },
        });
        batch.update(r.dup._ref, {
          isDeleted:      true,
          deletedAt:      movedAt,
          deletedBy:      userId || '',
          deletedByName:  userName || '',
          mergedInto:     primaryId,
          mergedAt:       movedAt,
          editHistory:    [...(r.dup.editHistory || []), dupEntry],
          updatedAt:      movedAt,
        });
      }

      // Update primary: merged gallery + audit entry + mergedFromClientIds
      const primaryEntry = auditEntry({
        action: `🔀 دمج ${duplicateIds.length} عميل في الحساب`,
        userId, userName, kind: 'op',
        meta: {
          mergedFromClientIds: duplicateIds,
          movedOrders:         counts.orders,
          movedFollowups:      counts.followups,
          movedDesignItems:    counts.designItems,
          movedReturnsTickets: counts.returnsTickets,
          operationId,
        },
      });
      batch.update(primary._ref, {
        gallery:             plan.mergedGallery,
        mergedFromClientIds: [...(primary.mergedFromClientIds || []), ...duplicateIds],
        editHistory:         [...(primary.editHistory || []), primaryEntry],
        updatedAt:           movedAt,
      });

      // audit_logs entry (set inside same batch — atomic)
      const auditRef = doc(collection(db, 'audit_logs'));
      batch.set(auditRef, {
        action:  'client.merge',
        details: {
          primaryId,
          primaryName,
          duplicateIds,
          duplicateNames: dups.map(d => d.name || ''),
          counts,
          operationId,
        },
        userId:    userId   || '',
        userName:  userName || '',
        timestamp: serverTimestamp(),
        url:       typeof location !== 'undefined' ? location.pathname : '',
      });

      try {
        console.log('[mergeDuplicates] committing batch...');
        await batch.commit();
        console.log('[mergeDuplicates] ✅ done');
        return {
          ok: true, errors: [], warnings: [],
          operationId,
          primaryId,
          merged: duplicateIds,
          movedCounts: counts,
          action: 'merge_clients',
        };
      } catch (e) {
        console.warn('[clientActions.mergeDuplicates] batch failed', e);
        return {
          ok: false,
          errors: [e.code === 'permission-denied'
            ? '🔒 ليس لديك صلاحية الدمج'
            : (e.message || 'فشل الدمج')],
          warnings: [], operationId,
        };
      }
    });
  },

  // ════════════════════════════════════════
  // BIZCARD (sub-field on client doc)
  // ════════════════════════════════════════

  /**
   * تحديث بيانات بطاقة العمل (businessCard subfield).
   * Schema-faithful: writes to `businessCard` field + `lastUpdate` timestamp,
   * matching existing clients.html readers.
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

      // Stamp metadata on the bizCard object (schema-faithful to existing readers).
      const payload = {
        ...bizCard,
        updatedAt: serverTimestamp(),
        updatedBy: userId || '',
      };

      const entry = auditEntry({
        action: '📇 تحديث بطاقة الأعمال',
        userId, userName, kind: 'edit',
        meta: { fieldCount: Object.keys(bizCard).length },
      });

      try {
        await updateDoc(current._ref, {
          businessCard: { ...(current.businessCard || {}), ...payload },
          lastUpdate: serverTimestamp(),
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
   * إضافة أو تعديل followup.
   * Schema-flexible: accepts `data` object with full followup payload. Action
   * stamps audit fields (createdAt/By, updatedAt/By, editHistory) and routes
   * to either add or update based on fId presence.
   *
   * @param {string} [args.fId] — if present, edit; else add
   * @param {Object} args.data  — must include clientId + type at minimum
   */
  async saveFollowup({ db = defaultDb, fId = '', data, userId, userName }) {
    if (!data || typeof data !== 'object') {
      return { ok: false, errors: ['⚠️ data مطلوبة'], warnings: [] };
    }
    const v = validateFollowupPayload({
      clientId: data.clientId,
      type: data.type,
      nextActionDate: data.nextActionDate,
    });
    if (!v.ok) return { ...v };

    return withIdempotency(db, {
      actionType: fId ? 'edit_followup' : 'add_followup',
      entityId: fId || `new:${data.clientId}`,
      actorId: userId || '',
      payload: { type: data.type, nextActionDate: data.nextActionDate },
    }, async (operationId) => {

      try {
        if (fId) {
          // Edit existing
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
            updatedAt: serverTimestamp(),
            updatedBy: userId || '',
            updatedByName: userName || '',
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
          createdAt: serverTimestamp(),
          createdBy: userId || '',
          createdByName: userName || '',
          updatedAt: serverTimestamp(),
          updatedBy: userId || '',
          updatedByName: userName || '',
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

  /**
   * إضافة صور إلى clients/{id}.gallery (idempotent — لا يدخل صور موجودة).
   * يُستخدم لـ shareToProductGallery من print.html (side-effect بعد submit).
   *
   * @param {Array<{url, productName?, orderId?, orderRef?, savedAt?}>} images
   * @returns {{ok, count, errors[]}}
   */
  async appendToClientGallery({ db = defaultDb, clientId, images = [] }) {
    if (!clientId) return { ok: false, errors: ['⚠️ clientId مطلوب'], warnings: [], count: 0 };
    if (!Array.isArray(images) || !images.length) {
      return { ok: true, errors: [], warnings: [], count: 0 };
    }
    try {
      const cRef = doc(db, 'clients', clientId);
      const cSnap = await getDoc(cRef);
      const existing = cSnap.exists() ? (cSnap.data().gallery || []) : [];
      const existingUrls = new Set(existing.map(x => x?.url).filter(Boolean));
      const fresh = images.filter(x => x?.url && !existingUrls.has(x.url));
      if (!fresh.length) return { ok: true, errors: [], warnings: [], count: 0 };
      await updateDoc(cRef, {
        gallery: [...existing, ...fresh],
        updatedAt: serverTimestamp(),
      });
      return { ok: true, errors: [], warnings: [], count: fresh.length };
    } catch (e) {
      return { ok: false, errors: [e.message || 'فشل التحديث'], warnings: [], count: 0 };
    }
  },

  // ──────────────────────────────────────────
  // AUDIT LOG (public wrapper — H1.1 fix)
  // ──────────────────────────────────────────

  /**
   * يكتب دخول في audit_logs. wrapper public لاستخدام الصفحات بدل الكتابة المباشرة.
   * Non-blocking: لو فشل (rules/network)، يسجّل warning ولا يرمي exception.
   *
   * @param {Object} args
   * @param {Object} [args.db=defaultDb]
   * @param {string} args.action          — اسم العملية (e.g. 'cgrid_bulk_archive')
   * @param {Object} [args.details={}]    — payload إضافي
   * @param {string} args.userId
   * @param {string} [args.userName]
   * @param {string} [args.userRole]
   * @param {string} [args.url]           — pathname للـ context
   */
  async logAudit({ db = defaultDb, action, details = {}, userId, userName = '', userRole = '', url = '' }) {
    try {
      await addDoc(collection(db, 'audit_logs'), {
        action,
        details: details || {},
        userId: userId || '',
        userName: userName || '',
        userRole: userRole || '',
        timestamp: serverTimestamp(),
        url: url || (typeof location !== 'undefined' ? location.pathname : ''),
      });
      return { ok: true, errors: [], warnings: [] };
    } catch (e) {
      console.warn('[clientActions.logAudit] failed (non-blocking):', action, e?.message);
      return { ok: false, errors: [e?.message || 'audit log failed'], warnings: [] };
    }
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
