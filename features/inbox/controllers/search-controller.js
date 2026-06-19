/**
 * features/inbox/controllers/search-controller.js
 * ━━━ IN-CONVERSATION SEARCH CONTROLLER — بحث داخل المحادثة ━━━
 * Handles searching within messages of the active conversation.
 */

/**
 * @param {Object} deps
 * @param {Function} deps.$ - getElementById shortcut
 * @param {Function} deps.getState - () => { messages }
 * @param {Function} deps.jumpToMsg
 */
export function createSearchController(deps) {
  const { $, getState, jumpToMsg } = deps;

  let matches = [];
  let idx = 0;

  function toggle() {
    const bar = $('csearch-bar'); if (!bar) return;
    const showing = bar.classList.toggle('show');
    if (showing) {
      setTimeout(() => $('csearch-input')?.focus(), 50);
    } else {
      $('csearch-input').value = '';
      clearHighlights();
      matches = []; idx = 0;
      $('csearch-info').textContent = '—';
    }
  }

  function clearHighlights() {
    document.querySelectorAll('.ib-msg.match-hl').forEach(el => el.classList.remove('match-hl'));
  }

  function search() {
    const q = ($('csearch-input').value || '').trim().toLowerCase();
    clearHighlights();
    if (!q) { matches = []; idx = 0; $('csearch-info').textContent = '—'; return; }
    const { messages } = getState();
    matches = messages.filter(m => !m.deletedAt && ((m.text || '').toLowerCase().includes(q) || (m.attachments?.[0]?.name || '').toLowerCase().includes(q))).map(m => m._id);
    if (!matches.length) { $('csearch-info').textContent = '0/0'; return; }
    matches.forEach(mid => {
      const el = document.querySelector(`.ib-msg[data-mid="${mid}"]`);
      if (el) el.classList.add('match-hl');
    });
    idx = matches.length - 1;
    $('csearch-info').textContent = `${idx + 1}/${matches.length}`;
    jumpToMsg(matches[idx]);
  }

  function onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); navigate(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { toggle(); }
  }

  function navigate(dir) {
    if (!matches.length) return;
    idx = (idx + dir + matches.length) % matches.length;
    $('csearch-info').textContent = `${idx + 1}/${matches.length}`;
    jumpToMsg(matches[idx]);
  }

  function reset() {
    const bar = $('csearch-bar');
    if (bar) bar.classList.remove('show');
    const ci = $('csearch-input'); if (ci) ci.value = '';
    const info = $('csearch-info'); if (info) info.textContent = '—';
    matches = []; idx = 0;
  }

  function reapplyHighlights() {
    if (!matches.length) return;
    const wrap = $('ib-msgs'); if (!wrap) return;
    matches.forEach(mid => {
      const el = wrap.querySelector(`.ib-msg[data-mid="${mid}"]`);
      if (el) el.classList.add('match-hl');
    });
  }

  return {
    toggle,
    search,
    onKey,
    navigate,
    reset,
    reapplyHighlights,
    getMatches: () => matches,
  };
}
