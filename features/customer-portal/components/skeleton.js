/**
 * UI · Skeleton — حالة تحميل (shimmer). عرض نقي. (STANDARDS §4, §9)
 * props: { variant: line|card|circle, count }
 */
export function Skeleton({ variant = 'line', count = 1 } = {}) {
  const one = `<div class="cp-skel cp-skel--${variant}" aria-hidden="true"></div>`;
  return Array.from({ length: Math.max(1, count) }, () => one).join('');
}
