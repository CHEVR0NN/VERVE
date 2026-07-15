// ── Shared console sidebar ───────────────────────────────────────────
// One source of truth for the Management and Staff portal sidebars.
// Each page keeps a placeholder:
//   <aside class="sidebar" id="sidebarRoot" data-portal="management" data-active="events"></aside>
//   <script src="./js/sidebar.js"></script>
// This script (synchronous, in-body) fills it before first paint, and
// before the auth guard / portal scripts / theme toggle wiring run — they
// all look up #staffName, #logoutBtn, the inbox link, and #themeToggleBtn.
(function () {
  var PORTALS = {
    management: {
      home: 'management.html',
      title: 'Management',
      badge: { name: 'Admin', role: 'Management' },
      sections: [
        { label: 'Overview', items: [
          { key: 'overview',  href: 'management.html',           icon: '≡', label: 'Shift Overview' },
          { key: 'occupancy', href: 'management-occupancy.html', icon: '◈', label: 'Live Occupancy' },
          { key: 'analytics', href: 'management-analytics.html', icon: '◇', label: 'Booking Analytics' },
        ]},
        { label: 'Records', items: [
          { key: 'noshow', href: 'management-noshow.html', icon: '△', label: 'No-Show Tracker' },
          { key: 'guests', href: 'management-guests.html', icon: '⊕', label: 'Guest Record Audit' },
          { key: 'fees',   href: 'management-fees.html',   icon: '◻', label: 'Late Cancellation Fees' },
          { key: 'blocks', href: 'management-blocks.html', icon: '▣', label: 'Facility Blocks' },
        ]},
        { label: 'Comms', items: [
          { key: 'events', href: 'management-events.html', icon: '★', label: 'Add Event' },
          { key: 'inbox',  href: 'management-inbox.html',  icon: '✉', label: 'Inbox' },
        ]},
      ],
    },
    staff: {
      home: 'staff.html',
      title: 'Staff Console',
      badge: { name: 'Staff', role: '—' },
      sections: [
        { label: 'Front Desk', items: [
          { key: 'schedule', href: 'staff.html',         icon: '≡', label: "Today's Schedule" },
          { key: 'booking',  href: 'staff-booking.html', icon: '◇', label: 'Staff Booking' },
          { key: 'walkin',   href: 'staff-walkin.html',  icon: '→', label: 'Log Walk-In' },
          { key: 'qr',       href: 'staff-qr.html',      icon: '▣', label: 'QR Verify' },
        ]},
        { label: 'Service', items: [
          { key: 'fnb',    href: 'staff-fnb.html',    icon: '◈', label: 'F&B Bookings' },
          { key: 'cancel', href: 'staff-cancel.html', icon: '△', label: 'Late Cancellations' },
        ]},
      ],
    },
  };

  var THEME_TOGGLE =
    '<button class="btn-theme-toggle" id="themeToggleBtn" aria-label="Switch to light mode" title="Switch theme">' +
      '<svg class="theme-icon theme-icon--sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12h2.5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/></svg>' +
      '<svg class="theme-icon theme-icon--moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" hidden><path d="M20 14.2A8.5 8.5 0 1 1 9.8 4a6.7 6.7 0 0 0 10.2 10.2z"/></svg>' +
    '</button>';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function render(root) {
    var portal = PORTALS[root.getAttribute('data-portal')];
    if (!portal) return;
    var active = root.getAttribute('data-active');

    var nav = portal.sections.map(function (section) {
      var items = section.items.map(function (it) {
        var cls = 'nav-item' + (it.key === active ? ' nav-item--active' : '');
        return '<a href="' + it.href + '" class="' + cls + '">' +
                 '<span class="nav-item__icon">' + esc(it.icon) + '</span>' +
                 '<span>' + esc(it.label) + '</span>' +
               '</a>';
      }).join('');
      return '<span class="sidebar__nav-label">' + esc(section.label) + '</span>' + items;
    }).join('');

    root.innerHTML =
      '<div class="sidebar__brand">' +
        '<a href="' + portal.home + '" class="sidebar__logo-link" aria-label="Go to home">' +
          '<img src="./asset/logo.png" alt="Verve" class="sidebar__logo" /></a>' +
        '<span class="sidebar__title">' + esc(portal.title) + '</span>' +
      '</div>' +
      '<nav class="sidebar__nav">' + nav + '</nav>' +
      '<div class="sidebar__footer">' +
        '<div class="staff-badge">' +
          '<span class="staff-badge__name" id="staffName">' + esc(portal.badge.name) + '</span>' +
          '<span class="staff-badge__role" id="staffRole">' + esc(portal.badge.role) + '</span>' +
        '</div>' +
        '<div class="sidebar__footer-actions">' +
          '<a href="gateway.html" class="btn-logout" id="logoutBtn">Logout</a>' +
          THEME_TOGGLE +
        '</div>' +
      '</div>';
  }

  var root = document.getElementById('sidebarRoot');
  if (root) render(root);
})();
