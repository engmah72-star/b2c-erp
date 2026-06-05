/**
 * UTILS · specialties — مصدر موحّد لتخصصات الأعمال (Business Network).
 * يستهلكه: لوحة الاحتياجات (needs.view) + اختيار تخصص العضو (profile.view).
 * المسار 2: لا يشمل طباعة/تصميم/دعاية (تخصصات الشركة) — التبادل يغذّي لا ينافس.
 */
export const SPECIALTIES = [
  { value: 'food', label: '🍽️ مطاعم / كافيهات' },
  { value: 'clinic', label: '🩺 عيادات / صحة' },
  { value: 'legal', label: '⚖️ خدمات قانونية' },
  { value: 'realestate', label: '🏢 عقارات' },
  { value: 'beauty', label: '💇 تجميل / صالونات' },
  { value: 'education', label: '📚 تعليم / تدريب' },
  { value: 'contracting', label: '🛠️ مقاولات / صيانة' },
  { value: 'retail', label: '🛍️ تجارة / هدايا' },
  { value: 'events', label: '🎉 تنظيم مناسبات' },
  { value: 'other', label: '✨ خدمات أخرى' },
];

export const SPEC_LABEL = Object.fromEntries(SPECIALTIES.map((s) => [s.value, s.label]));
