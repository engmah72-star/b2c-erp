// ══════════════════════════════════════════════════════════
// accounts-constants.js — RULE C2 (Central Constants)
// ══════════════════════════════════════════════════════════
// Single source of truth للثوابت الخاصة بصفحة الحسابات:
//   • TX_CATEGORIES — أنواع الحركات المالية (income/expense)
//   • TX_CAT_META   — label/icon لكل category (يحلّ محل CAT object inline)
//   • RECONCILIATION_TYPES
//   • ACCOUNT_SECTIONS — أسماء التبويبات
//
// الاستخدام:
//   import { TX_CATEGORIES, TX_CAT_META } from './accounts-constants.js';
//   if (cat === TX_CATEGORIES.COLLECTION) { ... }
//   const label = TX_CAT_META[cat]?.label || cat;
//
// لا تكرّر هذه القيم inline في HTML/JS — استخدم الـ enum.

export const TX_CATEGORIES = Object.freeze({
  COLLECTION:           'collection',
  ADVANCE:              'advance',
  PRINT_ADVANCE:        'print_advance',
  CLIENT_PAYMENT:       'client_payment',
  PRINTER_PAYMENT:      'printer_payment',
  SHIPPER_PAYMENT:      'shipper_payment',
  SUPPLIER:             'supplier',
  SALARY:               'salary',
  DESIGNER_FEE:         'designer_fee',
  SHIPPING_COST:        'shipping_cost',
  MARKETING:            'marketing',
  RENT:                 'rent',
  DELIVERY:             'delivery',
  REFUND:               'refund',
  ADMIN_EDIT:           'admin_edit',
  EXPENSE_REVERSAL:     'expense_reversal',
  OTHER:                'other',
  ADJUSTMENT:           'adjustment',
  OPENING_BALANCE:      'opening_balance',
  TRANSFER:             'transfer',
  DEFERRED_COLLECTION:  'deferred_collection',
  SHIPPING_COMPANY_DEBT:'shipping_company_debt',
});

// label + ico لكل category — المصدر الوحيد لـ "إزاي نعرض الـ category".
export const TX_CAT_META = Object.freeze({
  collection:            { label: 'تحصيل',          ico: '💰' },
  advance:               { label: 'مقدم',           ico: '💵' },
  print_advance:         { label: 'مقدم طباعة',     ico: '💵' },
  client_payment:        { label: 'دفعة عميل',      ico: '💰' },
  printer_payment:       { label: 'مورد طباعة',     ico: '🏭' },
  shipper_payment:       { label: 'مورد شحن',       ico: '📦' },
  supplier:              { label: 'مورد',           ico: '🏭' },
  salary:                { label: 'مرتب',           ico: '👤' },
  designer_fee:          { label: 'أتعاب مصمم',     ico: '🎨' },
  shipping_cost:         { label: 'تكلفة شحن',      ico: '🚚' },
  marketing:             { label: 'تسويق',          ico: '📣' },
  rent:                  { label: 'إيجار',          ico: '🏢' },
  delivery:              { label: 'شحن',            ico: '🚚' },
  refund:                { label: 'استرداد',        ico: '↩️' },
  admin_edit:            { label: 'تعديل أدمن',     ico: '✏️' },
  expense_reversal:      { label: 'عكس مصروف',      ico: '🔁' },
  other:                 { label: 'أخرى',           ico: '📦' },
  adjustment:            { label: 'تسوية',          ico: '🔄' },
  opening_balance:       { label: 'رصيد افتتاحي',   ico: '📅' },
  transfer:              { label: 'تحويل',          ico: '🔄' },
  deferred_collection:   { label: 'تحصيل مؤجل',     ico: '⏳' },
  shipping_company_debt: { label: 'دين شركة شحن',   ico: '📦' },
});

// Helper: returns "ico label" string (e.g. "💰 تحصيل") — يحلّ محل CAT object القديم.
export function txCatLabel(cat) {
  const m = TX_CAT_META[cat];
  return m ? `${m.ico} ${m.label}` : cat || '';
}

// أنواع التسوية في reconciliations collection.
export const RECONCILIATION_TYPES = Object.freeze({
  OPENING_BALANCE: 'opening_balance',
  ADJUSTMENT:      'adjustment',
});

// أسماء تبويبات صفحة الحسابات (used in switchSec / renderSection).
export const ACCOUNT_SECTIONS = Object.freeze({
  WALLETS:         'wallets',
  PENDING:         'pending',
  SHIPPING_DEBTS:  'shipping_debts',
  TRANSACTIONS:    'transactions',
  SUPPLIERS:       'suppliers',
  EMPLOYEES:       'employees',
  RECONCILE:       'reconcile',
});

// أنواع الحركة (in/out) — موحَّدة.
export const TX_TYPES = Object.freeze({
  IN:  'in',
  OUT: 'out',
});
