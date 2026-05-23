/**
 * Business2Card ERP — features/inbox/views/stories-view.js
 *
 * ━━━ STORIES VIEWS (Phase-4 · inbox decomp) ━━━
 *
 * Pure helpers + HTML builders for the stories row + viewer.
 *
 * Note: groupStoriesByUser is already in core/inbox-utils.js with a slightly
 * different sort. inbox.html has its own variant that uses Math.max + 'uid'
 * (vs userId) so we provide a local helper here matching the page's exact
 * semantics, to preserve behavior.
 */

import { colorOfRole, escapeHtml as esc } from '../../../core/inbox-utils.js';

/**
 * Group stories by user, sort within each group oldest-first, then groups
 * by latest activity desc (current user first).
 *
 * This variant preserves the page's existing semantics: uses `uid` field name
 * and Math.max for last-activity comparison.
 *
 * @param {Array} stories — array of story docs
 * @param {string} currentUid
 * @returns {Array<{uid, stories}>}
 */
export function groupStoriesByUserUid(stories = [], currentUid) {
  const map = new Map();
  for (const s of stories) {
    if (!map.has(s.userId)) map.set(s.userId, []);
    map.get(s.userId).push(s);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  }
  const arr = [...map.entries()].map(([uid, st]) => ({ uid, stories: st }));
  arr.sort((a, b) => {
    if (a.uid === currentUid) return -1;
    if (b.uid === currentUid) return 1;
    const aLast = Math.max(...a.stories.map(s => s.createdAt?.seconds || 0));
    const bLast = Math.max(...b.stories.map(s => s.createdAt?.seconds || 0));
    return bLast - aLast;
  });
  return arr;
}

/**
 * Build the stories row HTML (top strip above conversations).
 *
 * @param {Object} args
 * @param {Array}  args.groups            — output of groupStoriesByUserUid
 * @param {string} args.currentUid
 * @param {string} args.currentUserName
 * @param {string} args.currentRole
 * @param {Array}  args.allUsers
 * @param {Object} args.roleColorMap
 *
 * @returns {string} HTML
 */
export function buildStoriesRowHTML({
  groups = [], currentUid, currentUserName = '?', currentRole = '',
  allUsers = [], roleColorMap = {},
}) {
  const myGroup = groups.find(g => g.uid === currentUid);
  const myStories = myGroup ? myGroup.stories : [];
  const myInitial = (currentUserName || '?').charAt(0).toUpperCase();
  const myColor = colorOfRole(currentRole, roleColorMap, '#00a884');

  let html = '';
  if (myStories.length) {
    const allViewed = myStories.every(s => (s.viewers || []).includes(currentUid));
    html += `<div class="ib-story" onclick="openStoryViewer('${currentUid}')">
      <div class="ib-story-ring ${allViewed ? 'mine' : 'unviewed'}">
        <div class="ib-story-inner">
          <div class="ib-story-av" style="background:${myColor}">${myInitial}</div>
        </div>
        <span class="ib-story-add-badge" onclick="event.stopPropagation();openAddStory()">+</span>
      </div>
      <div class="ib-story-name">لحظتي</div>
    </div>`;
  } else {
    html += `<div class="ib-story" onclick="openAddStory()">
      <div class="ib-story-ring mine">
        <div class="ib-story-inner">
          <div class="ib-story-av" style="background:${myColor}">${myInitial}</div>
        </div>
        <span class="ib-story-add-badge">+</span>
      </div>
      <div class="ib-story-name">أضف لحظة</div>
    </div>`;
  }
  // Others
  for (const g of groups.filter(gg => gg.uid !== currentUid)) {
    const user = allUsers.find(u => u._id === g.uid);
    const name = g.stories[0]?.userName || user?.name || 'موظف';
    const col = g.stories[0]?.userColor || colorOfRole(user?.role, roleColorMap, '#00a884');
    const initial = (name || '?').charAt(0).toUpperCase();
    const allViewed = g.stories.every(s => (s.viewers || []).includes(currentUid));
    html += `<div class="ib-story" onclick="openStoryViewer('${g.uid}')">
      <div class="ib-story-ring ${allViewed ? 'mine' : 'unviewed'}">
        <div class="ib-story-inner">
          <div class="ib-story-av" style="background:${col}">${initial}</div>
        </div>
      </div>
      <div class="ib-story-name">${esc(name)}</div>
    </div>`;
  }
  return html;
}

/**
 * Resolve header + bars + viewer-count info for the currently-displayed story.
 *
 * @param {Object} args
 * @param {Object} args.group       — { uid, stories }
 * @param {number} args.sIdx        — current story index within group
 * @param {string} args.currentUid
 * @param {Array}  args.allUsers
 * @param {Object} args.roleColorMap
 *
 * @returns {{
 *   story, name, color, createdAtLabel,
 *   barsHTML, viewersCount, canDelete
 * } | null}
 */
export function getCurrentStoryViewInfo({ group, sIdx, currentUid, allUsers = [], roleColorMap = {} }) {
  if (!group) return null;
  const story = group.stories[sIdx];
  if (!story) return null;
  const user = allUsers.find(u => u._id === group.uid);
  const name = story.userName || user?.name || 'موظف';
  const color = story.userColor || colorOfRole(user?.role, roleColorMap, '#00a884');
  const created = story.createdAt?.toDate?.();
  const createdAtLabel = created
    ? created.toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    : '';
  const barsHTML = group.stories.map((_, i) =>
    `<div class="ib-sv-bar ${i < sIdx ? 'done' : ''}"><div class="ib-sv-bar-fill" id="sv-fill-${i}"></div></div>`
  ).join('');
  const viewersCount = (story.viewers || []).filter(u => u !== currentUid).length;
  const canDelete = story.userId === currentUid;
  return { story, name, color, createdAtLabel, barsHTML, viewersCount, canDelete };
}
