/**
 * tests/core-messaging-hub.test.mjs
 *
 * قنوات الفرق TEAM_CHANNELS + channelsForRole في core/messaging-hub.js.
 * الضمانة الأساسية: نظام المحادثات يعمل لدى **جميع** الموظفين —
 * كل دور من الأدوار الثمانية له #عام + قناة فريق واحدة على الأقل.
 *
 * Run: node tests/core-messaging-hub.test.mjs
 */
import { TEAM_CHANNELS, channelsForRole } from '../core/messaging-hub.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, h = '') { if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${h}`); }

// مرآة orders.js USER_ROLES (orders.js يستورد Firebase فلا يُحمَّل هنا مباشرة)
const ALL_ROLES = [
  'admin', 'operation_manager', 'customer_service', 'graphic_designer',
  'design_operator', 'production_agent', 'shipping_officer', 'wallet_manager',
];

// ── بنية القنوات ──────────────────────────────────────────────────
test('TEAM_CHANNELS: مفاتيح فريدة', () => {
  const keys = TEAM_CHANNELS.map(c => c.key);
  eq(new Set(keys).size, keys.length, 'duplicate channel keys');
});

test('TEAM_CHANNELS: كل قناة لها key/name/ico/roles', () => {
  for (const ch of TEAM_CHANNELS) {
    assert(ch.key && ch.name && ch.ico, `channel ${ch.key || '?'} incomplete`);
    assert(ch.roles === '*' || (Array.isArray(ch.roles) && ch.roles.length),
      `channel ${ch.key}: roles must be '*' or non-empty array`);
  }
});

test('TEAM_CHANNELS: قناة #عام مفتوحة للجميع', () => {
  const gen = TEAM_CHANNELS.find(c => c.key === 'general');
  assert(gen, 'general channel missing');
  eq(gen.roles, '*');
});

test('TEAM_CHANNELS: أدوار القنوات كلها أدوار معروفة', () => {
  for (const ch of TEAM_CHANNELS) {
    if (ch.roles === '*') continue;
    for (const r of ch.roles) {
      assert(ALL_ROLES.includes(r), `channel ${ch.key}: unknown role "${r}"`);
    }
  }
});

// ── التغطية: النظام يعمل لدى جميع الموظفين ──────────────────────
test('كل دور من الأدوار الثمانية له #عام', () => {
  for (const role of ALL_ROLES) {
    const chans = channelsForRole(role);
    assert(chans.some(c => c.key === 'general'), `${role}: missing #عام`);
  }
});

test('كل دور له قناة فريق واحدة على الأقل غير #عام', () => {
  for (const role of ALL_ROLES) {
    const team = channelsForRole(role).filter(c => c.key !== 'general');
    assert(team.length >= 1, `${role}: no team channel besides #عام`);
  }
});

test('wallet_manager: له قناة #الحسابات (كان الدور الوحيد بلا قناة فريق)', () => {
  const chans = channelsForRole('wallet_manager');
  assert(chans.some(c => c.key === 'finance'), 'wallet_manager missing finance channel');
});

test('الإدارة (admin/operation_manager) عضو في كل القنوات', () => {
  for (const role of ['admin', 'operation_manager']) {
    eq(channelsForRole(role).length, TEAM_CHANNELS.length, `${role} not in all channels`);
  }
});

test('channelsForRole: دور غير معروف → #عام فقط', () => {
  const chans = channelsForRole('no_such_role');
  eq(chans.length, 1);
  eq(chans[0].key, 'general');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
