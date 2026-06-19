/**
 * features/inbox/controllers/stories-controller.js
 * ━━━ STORIES CONTROLLER — اللحظات ━━━
 * Manages story subscription, viewer, and creation.
 */

import { groupStoriesByUserUid, buildStoriesRowHTML, getCurrentStoryViewInfo } from '../views/stories-view.js';

const AS_COLORS = ['#00a884','#005c4b','#1e88e5','#8e24aa','#e53935','#fb8c00','#43a047','#0097a7','#f57c00','#212121'];

/**
 * @param {Object} deps
 * @param {Object} deps.db - Firestore instance
 * @param {Object} deps.storage - Firebase Storage
 * @param {Function} deps.onSnapshot
 * @param {Function} deps.collection
 * @param {Function} deps.query
 * @param {Function} deps.orderBy
 * @param {Function} deps.limit
 * @param {Object} deps.inboxActions
 * @param {Function} deps.toast
 * @param {Function} deps.$  - getElementById shortcut
 * @param {Function} deps.getState - () => { currentUid, currentUserName, currentRole, allUsers, roleColorMap, colorOf }
 */
export function createStoriesController(deps) {
  const { db, storage, onSnapshot: onSnap, collection: coll, query: q, orderBy: ob, limit: lim, inboxActions, toast, $, getState, ref, uploadBytes, getDownloadURL } = deps;

  let allStories = [];
  let viewedStoryIds = new Set();
  let __sv = { groups: [], gIdx: 0, sIdx: 0, timer: null, paused: false };
  let __as = { mode: 'text', bgColor: AS_COLORS[0], imgFile: null, imgPreview: '' };

  function groupStoriesByUser() {
    return groupStoriesByUserUid(allStories, getState().currentUid);
  }

  function subscribe() {
    const { currentUid } = getState();
    if (!currentUid) return;
    const query = q(coll(db, 'stories'), ob('createdAt', 'desc'), lim(200));
    onSnap(query, (snap) => {
      const now = Date.now();
      allStories = snap.docs.map(d => ({ ...d.data(), _id: d.id }))
        .filter(s => {
          const exp = s.expiresAt?.seconds ? s.expiresAt.seconds * 1000 : (s.createdAt?.seconds ? (s.createdAt.seconds + 86400) * 1000 : 0);
          return exp > now;
        })
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      renderRow();
    }, (err) => {
      console.warn('[stories] subscription failed:', err.code, err.message);
    });
  }

  function renderRow() {
    const row = $('stories-row');
    if (!row) return;
    const { currentUid, currentUserName, currentRole, allUsers, roleColorMap } = getState();
    row.innerHTML = buildStoriesRowHTML({
      groups: groupStoriesByUser(),
      currentUid, currentUserName, currentRole,
      allUsers, roleColorMap,
    });
  }

  function openViewer(userId) {
    const groups = groupStoriesByUser();
    const idx = groups.findIndex(g => g.uid === userId);
    if (idx < 0) return;
    const { currentUid } = getState();
    __sv.groups = groups; __sv.gIdx = idx; __sv.sIdx = 0;
    if (userId !== currentUid) {
      const firstUnviewed = groups[idx].stories.findIndex(s => !(s.viewers || []).includes(currentUid));
      if (firstUnviewed > 0) __sv.sIdx = firstUnviewed;
    }
    $('sv-ov').classList.add('show');
    showCurrentStory();
  }

  function closeViewer() {
    $('sv-ov').classList.remove('show');
    if (__sv.timer) { clearInterval(__sv.timer); __sv.timer = null; }
    __sv.paused = false;
  }

  function showCurrentStory() {
    if (__sv.timer) { clearInterval(__sv.timer); __sv.timer = null; }
    const { currentUid, allUsers, roleColorMap } = getState();
    const info = getCurrentStoryViewInfo({
      group: __sv.groups[__sv.gIdx], sIdx: __sv.sIdx,
      currentUid, allUsers, roleColorMap,
    });
    if (!info) { closeViewer(); return; }
    const { story: s, name, color: col, createdAtLabel, barsHTML, viewersCount, canDelete } = info;
    $('sv-hdr-av').textContent = name.charAt(0).toUpperCase();
    $('sv-hdr-av').style.background = col;
    $('sv-hdr-name').textContent = name;
    $('sv-hdr-time').textContent = createdAtLabel;
    $('sv-bars').innerHTML = barsHTML;

    const stage = $('sv-stage');
    const navL = stage.querySelector('.ib-sv-nav-l');
    const navR = stage.querySelector('.ib-sv-nav-r');
    stage.innerHTML = '';
    if (s.type === 'image' && s.mediaUrl) {
      const img = document.createElement('img');
      img.src = s.mediaUrl;
      stage.appendChild(img);
      if (s.text) {
        const cap = document.createElement('div');
        cap.className = 'ib-sv-caption';
        cap.textContent = s.text;
        stage.appendChild(cap);
      }
    } else {
      const div = document.createElement('div');
      div.className = 'ib-sv-text';
      div.style.background = s.bgColor || '#00a884';
      div.textContent = s.text || '';
      stage.appendChild(div);
    }
    stage.appendChild(navL);
    stage.appendChild(navR);

    $('sv-viewers-count').textContent = viewersCount;
    $('sv-del-btn').style.display = canDelete ? '' : 'none';

    if (!canDelete && !viewedStoryIds.has(s._id) && !(s.viewers || []).includes(currentUid)) {
      viewedStoryIds.add(s._id);
      inboxActions.recordStoryView({ db, storyId: s._id, userId: currentUid }).catch(_ => {});
    }

    const DURATION = 5000;
    const fill = $(`sv-fill-${__sv.sIdx}`);
    if (fill) {
      fill.style.transition = 'none';
      fill.style.width = '0%';
      requestAnimationFrame(() => { fill.style.transition = `width ${DURATION}ms linear`; fill.style.width = '100%'; });
    }
    __sv.timer = setTimeout(() => navigate(1), DURATION);
  }

  function navigate(dir) {
    if (__sv.timer) { clearTimeout(__sv.timer); __sv.timer = null; }
    const group = __sv.groups[__sv.gIdx];
    if (!group) return;
    __sv.sIdx += dir;
    if (__sv.sIdx >= group.stories.length) {
      __sv.gIdx++; __sv.sIdx = 0;
      if (__sv.gIdx >= __sv.groups.length) { closeViewer(); return; }
    } else if (__sv.sIdx < 0) {
      __sv.gIdx--;
      if (__sv.gIdx < 0) { __sv.gIdx = 0; __sv.sIdx = 0; }
      else { __sv.sIdx = __sv.groups[__sv.gIdx].stories.length - 1; }
    }
    showCurrentStory();
  }

  async function deleteCurrentStory() {
    const group = __sv.groups[__sv.gIdx]; if (!group) return;
    const { currentUid } = getState();
    const s = group.stories[__sv.sIdx]; if (!s || s.userId !== currentUid) return;
    if (!confirm('حذف هذه اللحظة؟')) return;
    try {
      await inboxActions.deleteStory({ db, storyId: s._id });
      toast('🗑 تم حذف اللحظة', 'ok');
      closeViewer();
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  }

  function toggleViewers() {
    const { currentUid, allUsers } = getState();
    const group = __sv.groups[__sv.gIdx]; if (!group) return;
    const s = group.stories[__sv.sIdx]; if (!s) return;
    const others = (s.viewers || []).filter(u => u !== currentUid);
    if (!others.length) { toast('لا يوجد مشاهدون بعد', 'ok'); return; }
    const names = others.slice(0, 5).map(uid => allUsers.find(u => u._id === uid)?.name || 'موظف').join('، ');
    toast(`👁 شاهدها: ${names}${others.length > 5 ? ` و${others.length - 5} آخرين` : ''}`, 'ok');
  }

  function openAddStory() {
    __as = { mode: 'text', bgColor: AS_COLORS[0], imgFile: null, imgPreview: '' };
    $('as-txt').value = '';
    $('as-caption').value = '';
    $('as-preview').innerHTML = 'اختر صورة من جهازك';
    $('as-img-submit').disabled = true;
    switchTab('text');
    $('as-colors').innerHTML = AS_COLORS.map((c, i) => `<div class="ib-as-col ${i === 0 ? 'sel' : ''}" style="background:${c}" onclick="pickAsColor('${c}',this)"></div>`).join('');
    $('as-ov').classList.add('show');
  }

  function closeAddStory() { $('as-ov').classList.remove('show'); }

  function switchTab(mode) {
    __as.mode = mode;
    $('as-tab-text').classList.toggle('active', mode === 'text');
    $('as-tab-image').classList.toggle('active', mode === 'image');
    $('as-body-text').style.display = mode === 'text' ? '' : 'none';
    $('as-body-image').style.display = mode === 'image' ? '' : 'none';
  }

  function pickColor(c, el) {
    __as.bgColor = c;
    document.querySelectorAll('.ib-as-col').forEach(x => x.classList.remove('sel'));
    el.classList.add('sel');
  }

  function onFileSelected() {
    const f = $('as-file').files[0]; if (!f) return;
    __as.imgFile = f;
    const url = URL.createObjectURL(f);
    __as.imgPreview = url;
    $('as-preview').innerHTML = `<img src="${url}" loading="lazy" decoding="async" alt="">`;
    $('as-img-submit').disabled = false;
  }

  async function postStory(data) {
    const { currentUid, currentUserName, currentRole, colorOf } = getState();
    await inboxActions.postStory({
      db, data,
      userId: currentUid,
      userName: currentUserName || 'موظف',
      color: colorOf(currentRole) || '#00a884',
    });
  }

  async function submitText() {
    const txt = $('as-txt').value.trim();
    if (!txt) { toast('اكتب نصاً أولاً', 'err'); return; }
    try {
      await postStory({ type: 'text', text: txt, bgColor: __as.bgColor });
      toast('✅ نُشرت اللحظة', 'ok');
      closeAddStory();
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  }

  async function submitImage() {
    if (!__as.imgFile) { toast('اختر صورة', 'err'); return; }
    const { currentUid } = getState();
    const btn = $('as-img-submit'); btn.disabled = true; btn.textContent = 'جاري الرفع…';
    try {
      const path = `stories/${currentUid}/${Date.now()}_${__as.imgFile.name}`;
      const r = ref(storage, path);
      await uploadBytes(r, __as.imgFile);
      const url = await getDownloadURL(r);
      await postStory({ type: 'image', mediaUrl: url, text: $('as-caption').value.trim() });
      toast('✅ نُشرت اللحظة', 'ok');
      closeAddStory();
    } catch (e) {
      toast('❌ ' + e.message, 'err');
    } finally {
      btn.disabled = false; btn.textContent = 'نشر اللحظة';
    }
  }

  return {
    subscribe,
    renderRow,
    openViewer,
    closeViewer,
    navigate,
    deleteCurrentStory,
    toggleViewers,
    openAddStory,
    closeAddStory,
    switchTab,
    pickColor,
    onFileSelected,
    submitText,
    submitImage,
  };
}
