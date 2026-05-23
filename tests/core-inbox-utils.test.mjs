/**
 * Tests for core/inbox-utils.js (inbox Phase-1).
 * Run: node tests/core-inbox-utils.test.mjs
 */
import {
  fmtTime, fmtBytes, escapeHtml, initAvatar, colorOfRole,
  convDisplayName, convIcon, convColor, isUserOnline,
  getMentionableUsers, extractMentions, renderTextWithMentions,
  groupStoriesByUser, filterExpiredStories,
} from '../core/inbox-utils.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}\n    ${e.message}`); failed++; }
}
function assertEq(a, b, hint = '') {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)} ${hint}`);
}

const NOW = new Date(2026, 4, 15, 14, 30, 0);
const ts = (d) => ({ toDate: () => d, seconds: Math.floor(d.getTime() / 1000) });

// ── Formatters ──────────────────────────────────────────────────────
test('fmtTime: today → HH:MM (ar-EG, latin or Arabic-Indic digits)', () => {
  const result = fmtTime(ts(new Date(2026, 4, 15, 10, 5, 0)), NOW);
  // ar-EG locale may render with Arabic-Indic digits (٠-٩)
  if (!/[\d٠-٩]/.test(result)) throw new Error('not a time string: ' + result);
});
test('fmtTime: yesterday → أمس', () => {
  assertEq(fmtTime(ts(new Date(2026, 4, 14)), NOW), 'أمس');
});
test('fmtTime: older → DD/MM', () => {
  const result = fmtTime(ts(new Date(2026, 4, 1)), NOW);
  if (result.length < 4) throw new Error('expected date format');
});
test('fmtTime: no toDate → empty', () => assertEq(fmtTime(null), ''));

test('fmtBytes: B/KB/MB', () => {
  assertEq(fmtBytes(500), '500 B');
  if (!fmtBytes(2048).includes('KB')) throw new Error('KB');
  if (!fmtBytes(2 * 1048576).includes('MB')) throw new Error('MB');
});

test('escapeHtml escapes < > & "', () => {
  assertEq(escapeHtml('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
});
test('escapeHtml empty → ""', () => assertEq(escapeHtml(null), ''));

test('initAvatar: first letter uppercase', () => {
  assertEq(initAvatar('ahmed'), 'A');
  assertEq(initAvatar(''), '?');
  assertEq(initAvatar(null), '?');
});

test('colorOfRole: lookup + fallback', () => {
  assertEq(colorOfRole('admin', { admin: '#f00' }), '#f00');
  assertEq(colorOfRole('unknown', { admin: '#f00' }), '#4e5672');
});

// ── Conversation helpers ────────────────────────────────────────────
test('convDisplayName: channel returns conv.name', () => {
  assertEq(convDisplayName({ type: 'channel', name: '#general' }), '#general');
});
test('convDisplayName: DM returns other user name', () => {
  const conv = { type: 'dm', participants: ['me', 'other'] };
  const r = convDisplayName(conv, { currentUid: 'me', allUsers: [{ _id: 'other', name: 'Ahmed' }] });
  assertEq(r, 'Ahmed');
});
test('convDisplayName: DM falls back to dmNames', () => {
  const conv = { type: 'dm', participants: ['me', 'x'], dmNames: { x: 'Saved' } };
  const r = convDisplayName(conv, { currentUid: 'me', allUsers: [] });
  assertEq(r, 'Saved');
});

test('convIcon: channel returns ico', () => {
  assertEq(convIcon({ type: 'channel', ico: '🚀' }), '🚀');
});
test('convIcon: DM returns initial of other user', () => {
  const conv = { type: 'dm', participants: ['me', 'other'] };
  const r = convIcon(conv, { currentUid: 'me', allUsers: [{ _id: 'other', name: 'sara' }] });
  assertEq(r, 'S');
});

test('convColor: channel returns blue', () => {
  assertEq(convColor({ type: 'channel' }), '#3b9eff');
});
test('convColor: DM returns role color', () => {
  const conv = { type: 'dm', participants: ['me', 'other'] };
  const r = convColor(conv, {
    currentUid: 'me',
    allUsers: [{ _id: 'other', role: 'admin' }],
    roleColorMap: { admin: '#ff0000' },
  });
  assertEq(r, '#ff0000');
});

// ── isUserOnline ────────────────────────────────────────────────────
test('isUserOnline: online + recent → true', () => {
  const recent = { seconds: Math.floor(Date.now() / 1000) - 10 };
  assertEq(isUserOnline({ online: true, lastSeen: recent }), true);
});
test('isUserOnline: online but stale (>90s) → false', () => {
  const stale = { seconds: Math.floor(Date.now() / 1000) - 200 };
  assertEq(isUserOnline({ online: true, lastSeen: stale }), false);
});
test('isUserOnline: not online → false', () => {
  assertEq(isUserOnline({ online: false }), false);
});

// ── Mentions ────────────────────────────────────────────────────────
test('getMentionableUsers: excludes current user', () => {
  const r = getMentionableUsers({
    activeConv: { participants: ['me', 'a', 'b'] },
    allUsers: [{ _id: 'a', name: 'A' }, { _id: 'b', name: 'B' }],
    currentUid: 'me',
  });
  assertEq(r.length, 2);
  assertEq(r[0].uid, 'a');
});
test('getMentionableUsers: empty when no activeConv', () => {
  assertEq(getMentionableUsers({ activeConv: null }).length, 0);
});

test('extractMentions: parses @Name patterns', () => {
  const r = extractMentions('hi @Ahmed how are you', {
    candidates: [{ uid: 'u1', name: 'Ahmed' }],
  });
  assertEq(r.length, 1);
  assertEq(r[0], 'u1');
});
test('extractMentions: includes pendingMentions', () => {
  const r = extractMentions('hello', {
    candidates: [],
    pendingMentions: ['u1', 'u2'],
  });
  assertEq(r.length, 2);
});
test('extractMentions: dedups overlapping picks', () => {
  const r = extractMentions('hi @A', {
    candidates: [{ uid: 'u1', name: 'A' }],
    pendingMentions: ['u1'],
  });
  assertEq(r.length, 1);
});

test('renderTextWithMentions: wraps @Name with span class', () => {
  const html = renderTextWithMentions('hi @Ahmed', {
    candidates: [{ uid: 'u1', name: 'Ahmed' }],
    currentUid: 'me',
  });
  if (!html.includes('ib-mention')) throw new Error('missing class');
  if (!html.includes('@Ahmed')) throw new Error('missing name');
});
test('renderTextWithMentions: self-mention gets ib-mention-you', () => {
  const html = renderTextWithMentions('hi @Me', {
    candidates: [],
    currentUid: 'me-uid',
    currentUserName: 'Me',
  });
  if (!html.includes('ib-mention-you')) throw new Error('missing self class');
});

// ── Story helpers ───────────────────────────────────────────────────
test('groupStoriesByUser: groups + sorts current user first', () => {
  const stories = [
    { _id: 's1', userId: 'other', createdAt: { seconds: 100 } },
    { _id: 's2', userId: 'me',    createdAt: { seconds: 200 } },
    { _id: 's3', userId: 'me',    createdAt: { seconds: 100 } },
  ];
  const groups = groupStoriesByUser(stories, 'me');
  assertEq(groups[0].userId, 'me');
  assertEq(groups[0].stories.length, 2);
  // Sorted oldest → newest within
  assertEq(groups[0].stories[0]._id, 's3');
});

test('groupStoriesByUser: allViewed flag when current user in viewedBy', () => {
  const stories = [
    { _id: 's1', userId: 'other', viewedBy: ['me'] },
    { _id: 's2', userId: 'other', viewedBy: [] },
  ];
  const groups = groupStoriesByUser(stories, 'me');
  assertEq(groups[0].allViewed, false);
});

test('filterExpiredStories: removes > 24h old', () => {
  const now = Date.now();
  const sec = (delta) => ({ seconds: Math.floor((now + delta) / 1000) });
  const stories = [
    { _id: 'fresh', createdAt: sec(-1 * 3600 * 1000) },
    { _id: 'old',   createdAt: sec(-25 * 3600 * 1000) },
  ];
  const r = filterExpiredStories(stories, now);
  assertEq(r.length, 1);
  assertEq(r[0]._id, 'fresh');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
