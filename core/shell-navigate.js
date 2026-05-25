// ════════════════════════════════════════════════════════════════════
// Business2Card — Shell-Aware Navigation Helper
// ════════════════════════════════════════════════════════════════════
//
// Single source of truth for page navigation inside the Runtime Shell.
//
// When loaded inside `shell.html` iframe → navigates the workspace
// iframe via `B2CShell.openInWorkspace(url)` (no full page reload).
//
// When loaded standalone (god page opened directly) → falls back to
// `window.location.href = url` (full page load — same as before).
//
// Usage from any page:
//   <button onclick="navigatePage('design.html?id=123')">Open</button>
//
// Or from module code:
//   window.navigatePage('design.html?id=123');
//
// Designed to replace the ~35 hardcoded `location.href = 'x.html'`
// patterns in dashboards / workflow pages / command-palette / notifications.
//
// Phase 2 plumbing — see CLEANUP_PLAN.md §Phase 2.
// ════════════════════════════════════════════════════════════════════

(function () {
  if (typeof window === 'undefined') return;

  function navigatePage(url) {
    if (!url) return;
    // Inside shell iframe → window.top.B2CShell is the runtime shell.
    // Standalone page → window.top === window, no B2CShell present.
    var topWin = (function () { try { return window.top; } catch (_) { return null; } })();
    var shell = (topWin && topWin !== window && topWin.B2CShell) || window.B2CShell;
    if (shell && typeof shell.openInWorkspace === 'function') {
      shell.openInWorkspace(url);
    } else {
      window.location.href = url;
    }
  }

  window.navigatePage = navigatePage;
})();
