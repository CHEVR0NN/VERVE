// Management auth guard — redirects to management-login.html if not authenticated
(function () {
  const token = sessionStorage.getItem('mgmtToken');
  const user  = sessionStorage.getItem('mgmtUser');

  if (!token || !user) {
    window.location.href = 'management-login.html';
    return;
  }

  // Populate sidebar badge with logged-in user info
  try {
    const parsed = JSON.parse(user);
    const nameEl = document.getElementById('staffName');
    const roleEl = document.getElementById('staffRole');
    if (nameEl) nameEl.textContent = parsed.displayName || 'Admin';
    if (roleEl) roleEl.textContent = 'Management';
  } catch (_) { /* keep defaults */ }

  // Logout handler — clear management session
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function (e) {
      e.preventDefault();
      sessionStorage.removeItem('mgmtToken');
      sessionStorage.removeItem('mgmtUser');
      window.location.href = 'management-login.html';
    });
  }
})();
