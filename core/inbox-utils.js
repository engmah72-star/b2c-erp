/**
 * Business2Card ERP — core/inbox-utils.js
 *
 * ━━━ INBOX PURE UTILITIES (Phase-1 · inbox god-page decomp) ━━━
 *
 * Pure helpers for the inbox/conversations page:
 *   - fmtTime, fmtBytes, initAvatar, escapeHtml — formatting
 *   - convDisplayName, convIcon, convColor      — conversation metadata
 *   - isUserOnline                              — presence check (90s window)
 *   - getMentionableUsers, extractMentions, renderTextWithMentions — @mentions
 *
 * No DOM, no Firestore. The page injects state (allUsers, currentUid, colors).
 */

/** Format Firestore Timestamp → 'HH:MM' (today), 'أمس' (yesterday), 'DD/MM' (else). */
export function fmtTime(ts, now = new Date()) {
  if (!ts?.toDate) return '';
  const d = ts.toDate();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'أمس';
  return d.toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit' });
}

/** Format byte count → '500 B' / '1.2 KB' / '3.4 MB'. */
export function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

/** HTML-escape a string for safe interpolation in templates. */
export function escapeHtml(s) {
  return (s || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

/** Extract first letter as uppercase avatar initial. */
export function initAvatar(name) {
  return (name || '?').trim()[0]?.toUpperCase() || '?';
}

/** Lookup role color, fallback to default. */
export function colorOfRole(role, roleColorMap = {}, fallback = '#4e5672') {
  return roleColorMap[role] || fallback;
}

// ── Conversation metadata helpers ───────────────────────────────────

/** Get the display name for a conversation (channel name OR DM other-user name). */
export function convDisplayName(conv, { currentUid, allUsers = [] } = {}) {
  if (!conv) return 'محادثة';
  if (conv.type === 'channel') return conv.name || '#قناة';
  if (conv.type === 'dm') {
    const otherUid = (conv.participants || []).find(p => p !== currentUid);
    if (!otherUid) return 'محادثة';
    const u = allUsers.find(x => x._id === otherUid);
    return u?.name || conv.dmNames?.[otherUid] || 'موظف';
  }
  return conv.name || 'محادثة';
}

/** Get the avatar/icon glyph for a conversation. */
export function convIcon(conv, { currentUid, allUsers = [] } = {}) {
  if (!conv) return '?';
  if (conv.type === 'channel') return conv.ico || '#';
  if (conv.type === 'dm') {
    const otherUid = (conv.participants || []).find(p => p !== currentUid);
    const u = allUsers.find(x => x._id === otherUid);
    return initAvatar(u?.name || conv.dmNames?.[otherUid] || '?');
  }
  return conv.name?.[0] || '?';
}

/** Role-based color for a conversation (DMs reflect other-user role). */
export function convColor(conv, { currentUid, allUsers = [], roleColorMap = {} } = {}) {
  if (!conv) return '#4e5672';
  if (conv.type === 'channel') return '#3b9eff';
  if (conv.type === 'dm') {
    const otherUid = (conv.participants || []).find(p => p !== currentUid);
    const u = allUsers.find(x => x._id === otherUid);
    return colorOfRole(u?.role, roleColorMap);
  }
  return '#4e5672';
}

/**
 * Is a user online? Checks presence.online + lastSeen within threshold.
 * Default threshold: 90 seconds.
 */
export function isUserOnline(presence, thresholdMs = 90_000) {
  if (!presence?.online) return false;
  const last = (presence.lastSeen?.seconds || 0) * 1000;
  return (Date.now() - last) < thresholdMs;
}

// ── Mentions ─────────────────────────────────────────────────────────

/**
 * Get the list of mentionable participants for an active conversation.
 * Excludes the current user.
 *
 * @returns {Array<{uid, name, role}>}
 */
export function getMentionableUsers({ activeConv, allUsers = [], currentUid }) {
  if (!activeConv) return [];
  const out = [];
  for (const uid of (activeConv.participants || [])) {
    if (uid === currentUid) continue;
    const u = allUsers.find(x => x._id === uid) || { _id: uid, name: 'موظف', role: '' };
    out.push({ uid, name: u.name || 'موظف', role: u.role || '' });
  }
  return out;
}

/**
 * Extract @mention uids from text. Returns deduplicated array of uids.
 * Includes:
 *   - explicit picks from `pendingMentions`
 *   - "@Name" patterns matching a candidate by exact name (word-boundary end)
 */
export function extractMentions(text, { candidates = [], pendingMentions = [] } = {}) {
  if (!text) return [];
  const out = new Set();
  for (const uid of pendingMentions) out.add(uid);
  for (const u of candidates) {
    const re = new RegExp('@' + (u.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s|$)');
    if (re.test(text)) out.add(u.uid);
  }
  return [...out];
}

/**
 * Render message text with @mentions highlighted.
 * Self-mentions get the `you` modifier class.
 *
 * @param {string} text
 * @param {Object} args
 * @param {Array}  args.candidates  — mentionable participants from getMentionableUsers
 * @param {string} args.currentUid
 * @param {string} [args.currentUserName] — used to highlight self-mentions
 * @param {string} [args.currentRole]
 *
 * @returns {string} HTML
 */
export function renderTextWithMentions(text, { candidates = [], currentUid, currentUserName = '', currentRole = '' } = {}) {
  if (!text) return '';
  let html = escapeHtml(text);
  const cands = [...candidates];
  if (currentUid && currentUserName) {
    cands.push({ uid: currentUid, name: currentUserName, role: currentRole });
  }
  for (const u of cands) {
    if (!u.name) continue;
    const escName = u.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('@' + escName + '(?=\\s|$|[،,.!?])', 'g');
    const cls = u.uid === currentUid ? 'ib-mention ib-mention-you' : 'ib-mention';
    html = html.replace(re, `<span class="${cls}">@${escapeHtml(u.name)}</span>`);
  }
  return html;
}

// ── Story helpers ───────────────────────────────────────────────────

/**
 * Group stories by userId, sort by createdAt asc within each group,
 * then sort groups: current user first, then by latest story desc.
 *
 * @returns {Array<{userId, stories, allViewed}>}
 */
export function groupStoriesByUser(stories = [], currentUid) {
  const map = new Map();
  for (const s of stories) {
    if (!s.userId) continue;
    if (!map.has(s.userId)) map.set(s.userId, []);
    map.get(s.userId).push(s);
  }
  // Sort each user's stories oldest → newest
  for (const arr of map.values()) {
    arr.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  }
  // Build groups
  const groups = [];
  for (const [userId, arr] of map.entries()) {
    const allViewed = arr.every(s => (s.viewedBy || []).includes(currentUid));
    groups.push({ userId, stories: arr, allViewed });
  }
  // Sort: current user first, then by latest story timestamp desc
  groups.sort((a, b) => {
    if (a.userId === currentUid) return -1;
    if (b.userId === currentUid) return 1;
    const aLast = a.stories[a.stories.length - 1]?.createdAt?.seconds || 0;
    const bLast = b.stories[b.stories.length - 1]?.createdAt?.seconds || 0;
    return bLast - aLast;
  });
  return groups;
}

/** Filter expired stories (> 24h old). */
export function filterExpiredStories(stories = [], now = Date.now(), windowMs = 24 * 3600 * 1000) {
  const cutoff = (now - windowMs) / 1000;
  return stories.filter(s => (s.createdAt?.seconds || 0) >= cutoff);
}
