// ── Console theme toggle ─────────────────────────────────────────────
// Loaded in <head> (render-blocking) so the saved theme is applied before
// first paint — no flash. Console pages default to dark; a saved preference
// wins. The persistent sidebar stays dark in both modes by design.
(function () {
  // 1) Apply saved theme immediately (pre-paint)
  var saved = localStorage.getItem('vrv_theme');
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.setAttribute('data-theme', saved);
  }

  // 2) Wire the toggle once the DOM is ready
  function wire() {
    var btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    var root = document.documentElement;
    function label() {
      var isDark = (root.getAttribute('data-theme') || 'dark') === 'dark';
      btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }
    label();
    btn.addEventListener('click', function () {
      var current = root.getAttribute('data-theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      var next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem('vrv_theme', next);
      label();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
