/**
 * Business2Card ERP — features/clients/client-form.js
 *
 * ━━━ CLIENT ADD/EDIT FORM HELPERS (Phase-2D · clients god-page decomp) ━━━
 *
 * Pure helpers for the client add/edit modal:
 *   - validateIntlPhone(cc, phoneRaw) → { ok, errors[], intlPhone }
 *   - buildClientPayload({form, isLegacy, prevClient, audit?}) → data
 *
 * No DOM, no Firestore. الصفحة تجمع inputs ثم تنادي الـ helpers.
 */

/**
 * Validate the international phone field pair (country-code + local).
 * Composes the full intlPhone string on success.
 *
 * Rules:
 *   - Both fields empty → OK, intlPhone:''
 *   - One filled → error
 *   - Country code '+20' (Egypt) → error (must use phone1 instead)
 *   - Local phone length must be 6-15 digits
 *
 * @param {string} cc       — country code starting with '+'
 * @param {string} phoneRaw — local phone (digits stripped of non-digits)
 * @returns {{ ok: boolean, errors: string[], intlPhone: string }}
 */
export function validateIntlPhone(cc = '', phoneRaw = '') {
  const ccTrim = (cc || '').trim();
  const digits = (phoneRaw || '').replace(/[^\d]/g, '');

  if (!digits && !ccTrim) return { ok: true, errors: [], intlPhone: '' };
  if (!ccTrim) return { ok: false, errors: ['⚠️ اختر دولة الرقم الدولي'], intlPhone: '' };
  if (!digits) return { ok: false, errors: ['⚠️ أدخل الرقم الدولي'], intlPhone: '' };
  if (ccTrim === '+20') {
    return { ok: false, errors: ['⚠️ +20 لمصر — استخدم خانة "هاتف 1"'], intlPhone: '' };
  }
  if (digits.length < 6 || digits.length > 15) {
    return { ok: false, errors: ['⚠️ الرقم الدولي غير صحيح'], intlPhone: '' };
  }
  return { ok: true, errors: [], intlPhone: ccTrim + digits };
}

/**
 * Build the clients-payload for clientActions.addClient/editClient.
 *
 * @param {Object} args
 * @param {Object} args.form           — pre-trimmed form values (raw strings)
 *   { name, phone1, phone2, intlCountryCode, intlPhone, email, job, notes,
 *     birthday, anniversary, internalNotes, source, sector, governorate, city,
 *     tags:Array, legacyNotes?, legacyProjects?, legacySpent?, legacyLastOrder? }
 * @param {boolean} args.isLegacy
 * @param {Object} [args.prevClient]   — for change detection on internalNotes
 * @param {Object} [args.internalNotesLastEdit] — if internalNotes changed, caller supplies
 *   the meta { by, byName, at } where `at` is the timestamp value (Firestore sentinel or Date)
 *
 * @returns {Object} the data payload (no client-side timestamp construction)
 */
export function buildClientPayload({
  form = {}, isLegacy = false,
  prevClient = null,
  internalNotesLastEdit = null,
}) {
  const internalNotes = (form.internalNotes || '').trim();
  const internalChanged = (prevClient?.internalNotes || '') !== internalNotes;

  const data = {
    name: (form.name || '').trim(),
    phone1: (form.phone1 || '').trim(),
    phone2: form.phone2 || '',
    intlCountryCode: form.intlCountryCode || '',
    intlPhone: form.intlPhone || '',
    email: form.email || '',
    job: form.job || '',
    notes: form.notes || '',
    birthday: form.birthday || '',
    anniversary: form.anniversary || '',
    internalNotes,
    source: form.source || '',
    sector: form.sector || '',
    governorate: form.governorate || '',
    city: form.city || '',
    tags: form.tags || [],
    status: isLegacy ? 'legacy' : 'active',
  };

  // Only stamp internal-notes audit when the value actually changed
  if (internalChanged && internalNotesLastEdit) {
    data.internalNotesLastEdit = internalNotesLastEdit;
  }

  if (isLegacy) {
    data.legacyNotes        = form.legacyNotes || '';
    data.totalSpentLegacy   = parseFloat(form.legacySpent) || 0;
    data.lastOrderDateLegacy = form.legacyLastOrder || '';
    data.legacyProjects     = form.legacyProjects || '';
  }

  return data;
}
