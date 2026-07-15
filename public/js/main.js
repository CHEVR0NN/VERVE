// ── Theme toggle (runs regardless of login state) ────────────────────────
(function () {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    const root    = document.documentElement;
    const current = root.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next    = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('vrv_theme', next);
    btn.setAttribute('aria-label', next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  });
})();

(function () {

  const API_BASE = 'https://backend-production-41dc3.up.railway.app';

  // ── Already logged in → skip straight to dashboard ────────────────────────
  if (localStorage.getItem('vrv_token')) {
    window.location.href = 'dashboard.html';
    return;
  }

  const form = document.getElementById('loginForm');
  if (!form) return;

  const accessBtn  = form.querySelector('.btn-access');
  const PORTAL_URL = 'dashboard.html';

  // ── Inject general error message element ─────────────────────────────────
  const errorEl = document.createElement('p');
  errorEl.style.cssText = [
    'color:#c96a5e', 'font-size:0.78rem', 'letter-spacing:0.08em',
    'margin:-8px 0 14px', 'min-height:1.1em', 'text-align:center',
    'font-family:inherit',
  ].join(';');
  accessBtn.insertAdjacentElement('beforebegin', errorEl);

  // ── Clear field error on input ────────────────────────────────────────────
  document.getElementById('membershipId').addEventListener('input', function () {
    document.getElementById('fieldMembershipId').classList.remove('field--error');
  });
  document.getElementById('emailAddress').addEventListener('input', function () {
    document.getElementById('fieldEmailAddress').classList.remove('field--error');
  });

  // ── Form submit ───────────────────────────────────────────────────────────
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorEl.textContent = '';

    const membership_number = document.getElementById('membershipId').value.trim().toUpperCase();
    const email             = document.getElementById('emailAddress').value.trim();

    let hasError = false;
    if (!membership_number) {
      document.getElementById('fieldMembershipId').classList.add('field--error');
      hasError = true;
    }
    if (!email) {
      document.getElementById('fieldEmailAddress').classList.add('field--error');
      hasError = true;
    }
    if (hasError) {
      shakeButton();
      return;
    }

    setLoading(true);

    try {
      const res  = await fetch(`${API_BASE}/api/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ membership_number, email }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        errorEl.textContent = data.message || 'Invalid membership number or email.';
        shakeButton();
        return;
      }

      localStorage.setItem('vrv_token',  data.token);
      localStorage.setItem('src_member', JSON.stringify(data.member));
      window.location.href = PORTAL_URL;

    } catch {
      errorEl.textContent = 'Unable to connect to the server. Please try again.';
      shakeButton();
    } finally {
      setLoading(false);
    }
  });

  function setLoading(state) {
    const textEl  = accessBtn.querySelector('.btn-access__text');
    const arrowEl = accessBtn.querySelector('.btn-access__arrow');

    if (textEl && arrowEl) {
      accessBtn.disabled      = state;
      textEl.textContent      = state ? 'Verifying'   : 'Access Portal';
      arrowEl.textContent     = state ? '…'           : '→';
      accessBtn.style.opacity = state ? '0.75'        : '1';
    } else {
      accessBtn.disabled      = state;
      accessBtn.textContent   = state ? 'Verifying…' : 'Access Portal';
      accessBtn.style.opacity = state ? '0.75'        : '1';
    }
  }

  function shakeButton() {
    accessBtn.classList.remove('shake');
    void accessBtn.offsetWidth;
    accessBtn.classList.add('shake');
    accessBtn.addEventListener('animationend', function () {
      accessBtn.classList.remove('shake');
    }, { once: true });
  }

})();
