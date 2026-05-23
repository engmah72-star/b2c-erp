/**
 * Business2Card ERP — features/clients/bizcard-form.js
 *
 * ━━━ BUSINESS CARD FORM HELPERS (Phase-2A · clients god-page decomp) ━━━
 *
 * Pure helpers for the business-card panel tab:
 *   - BIZCARD_FIELDS              — ordered list of form field ids
 *   - BIZCARD_KEY_MAP             — field-id → bizCard property name
 *   - readBizCardFromForm(getEl)  — collects non-empty form values into bizCard object
 *   - formatBizCardText({bc, mode}) — pure text formatter (export / new-order note)
 *
 * No DOM mutation, no Firestore. الصفحة تستدعي الـ pure helpers ثم تنادي
 * window.clientActions.saveBizCard للـ Firestore write.
 */

export const BIZCARD_FIELDS = [
  'name-ar', 'name-en', 'prefix', 'nickname',
  'job-ar', 'job-en',
  'company-ar', 'company-en', 'biz-type',
  'office-phone', 'mobile-phone', 'whatsapp', 'fax',
  'email', 'email-2', 'website',
  'address-ar', 'address-en', 'city', 'gov', 'country', 'maps-link',
  'fb', 'ig', 'tw', 'linkedin', 'tiktok', 'yt', 'snap', 'telegram',
  'hours-week', 'hours-weekend', 'closed-days',
  'logo-url', 'color-1', 'color-2', 'color-3', 'fonts',
  'founded', 'birthday', 'anniversary',
  'style', 'avoid-colors', 'design-notes',
];

/**
 * Mapping from kebab-case form id (after `bc-` prefix) → camelCase bizCard key.
 * Defaults: any field not listed → kebab→camel auto conversion.
 */
export const BIZCARD_KEY_MAP = {
  'name-ar':       'nameAr',
  'name-en':       'nameEn',
  'job-ar':        'jobTitleAr',
  'job-en':        'jobTitleEn',
  'company-ar':    'companyAr',
  'company-en':    'companyEn',
  'biz-type':      'businessType',
  'office-phone':  'officePhone',
  'mobile-phone':  'mobilePhone',
  'email-2':       'email2',
  'address-ar':    'addressAr',
  'address-en':    'addressEn',
  'maps-link':     'mapsLink',
  'fb':            'facebook',
  'ig':            'instagram',
  'tw':            'twitter',
  'yt':            'youtube',
  'snap':          'snapchat',
  'hours-week':    'hoursWeek',
  'hours-weekend': 'hoursWeekend',
  'closed-days':   'closedDays',
  'logo-url':      'logoUrl',
  'color-1':       'color1',
  'color-2':       'color2',
  'color-3':       'color3',
  'avoid-colors':  'avoidColors',
  'design-notes':  'designNotes',
};

const kebabToCamel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function fieldToKey(field) {
  return BIZCARD_KEY_MAP[field] || kebabToCamel(field);
}

/**
 * Read all bizcard form fields into a bizCard object.
 * Empty values are skipped (caller can decide if missing keys should overwrite).
 *
 * @param {(fieldId: string) => HTMLElement|null} getEl — usually `(id) => document.getElementById('bc-' + id)`
 * @returns {Object} bizCard with camelCase keys
 */
export function readBizCardFromForm(getEl) {
  const bc = {};
  for (const field of BIZCARD_FIELDS) {
    const el = getEl(field);
    if (!el) continue;
    const v = (el.value || '').trim();
    if (v) bc[fieldToKey(field)] = v;
  }
  return bc;
}

/**
 * Format a bizCard object as multi-line plain text.
 *
 * @param {Object} args
 * @param {Object} args.bc                  — bizCard object
 * @param {'export'|'order-note'} [args.mode='export']
 *   - 'export'     → full output (label format "تليفون مكتب: ...")
 *   - 'order-note' → similar but adapted as design note (used by fillFromBizCard)
 * @returns {string}
 */
export function formatBizCardText({ bc, mode = 'export' }) {
  const lines = [];
  if (bc.prefix || bc.nameAr) lines.push(((bc.prefix || '') + ' ' + (bc.nameAr || '')).trim());
  if (bc.nameEn) lines.push(bc.nameEn);
  if (bc.jobTitleAr) lines.push(bc.jobTitleAr);
  if (bc.jobTitleEn) lines.push(bc.jobTitleEn);
  if (bc.companyAr) lines.push(bc.companyAr);
  if (bc.companyEn) lines.push(bc.companyEn);
  lines.push('');
  if (bc.officePhone) lines.push('تليفون مكتب: ' + bc.officePhone);
  if (bc.mobilePhone) lines.push('موبايل/واتساب: ' + bc.mobilePhone);
  if (bc.email)   lines.push('Email: '   + bc.email);
  if (bc.website) lines.push('Website: ' + bc.website);
  if (bc.addressAr) lines.push(mode === 'export' ? 'العنوان: ' + bc.addressAr : bc.addressAr);
  if (bc.addressEn) lines.push(mode === 'export' ? 'Address: ' + bc.addressEn : bc.addressEn);
  const social = [];
  if (bc.facebook)  social.push('FB: '       + bc.facebook);
  if (bc.instagram) social.push('IG: '       + bc.instagram);
  if (bc.linkedin)  social.push('LinkedIn: ' + bc.linkedin);
  if (social.length) lines.push(social.join(' · '));
  if (bc.designNotes) lines.push(mode === 'export' ? '\nملاحظات: ' + bc.designNotes : '', mode === 'export' ? '' : 'ملاحظات: ' + bc.designNotes);
  // Collapse consecutive empty lines
  return lines.filter((v, i, a) => !(v === '' && a[i - 1] === '')).join('\n').trim();
}
