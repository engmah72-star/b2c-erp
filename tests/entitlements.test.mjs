/**
 * tests · entitlements — اختبار المصدر المركزي للاستحقاقات (#6). نقي.
 * تشغيل: node tests/entitlements.test.mjs
 */
import { planOf, isFeatured, hasFeature, entitlementsOf, PLANS, worksLimit, WORKS_FREE_LIMIT } from '../core/entitlements.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error('✗', n); } };

ok('default plan free', planOf({}) === 'free' && planOf(null) === 'free');
ok('invalid plan → free', planOf({ plan: 'gold' }) === 'free');
ok('valid plan', planOf({ plan: 'pro' }) === 'pro');

ok('free has public_profile', hasFeature({ plan: 'free' }, 'public_profile'));
ok('free lacks analytics', !hasFeature({ plan: 'free' }, 'profile_analytics'));
ok('pro inherits free', hasFeature({ plan: 'pro' }, 'directory_listing') && hasFeature({ plan: 'pro' }, 'profile_analytics'));
ok('business inherits all', hasFeature({ plan: 'business' }, 'public_profile') && hasFeature({ plan: 'business' }, 'remove_branding'));

ok('featured needs flag+eligibility', isFeatured({ plan: 'pro', featured: true }) === true);
ok('featured false on free even if flag', isFeatured({ plan: 'free', featured: true }) === false);
ok('not featured without flag', isFeatured({ plan: 'pro' }) === false);

const e = entitlementsOf({ plan: 'pro', featured: true });
ok('entitlements shape', e.plan === 'pro' && e.featured === true && Array.isArray(e.features) && e.features.includes('unlimited_works'));
ok('plans order', PLANS[0] === 'free' && PLANS[PLANS.length - 1] === 'business');

ok('free works limit', worksLimit({ plan: 'free' }) === WORKS_FREE_LIMIT);
ok('pro works unlimited', worksLimit({ plan: 'pro' }) === Infinity);
ok('business works unlimited', worksLimit({ plan: 'business' }) === Infinity);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
