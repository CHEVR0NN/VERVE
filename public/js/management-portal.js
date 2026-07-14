(function () {
  const API_BASE = 'https://backend-production-41dc3.up.railway.app';

  // ── Inline notification bar ────────────────────────────────────────────────
  let _notifyTimer = null;
  function notify(message, isError) {
    let el = document.getElementById('mgmt-notify');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mgmt-notify';
      el.style.cssText = 'position:fixed;top:1rem;right:1rem;padding:0.75rem 1.25rem;border-radius:8px;font-size:0.9rem;z-index:9999;transition:opacity 0.3s;';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.opacity = '1';
    el.style.background = isError ? '#c96a5e' : '#c25972';
    el.style.color = '#fff';
    clearTimeout(_notifyTimer);
    _notifyTimer = setTimeout(() => { el.style.opacity = '0'; }, 5000);
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const token = sessionStorage.getItem('mgmtToken');
  if (!token) return;

  const apiFetch = (url, opts = {}) =>
    fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });

  // ── Inbox unread badge ─────────────────────────────────────────────────────
  async function loadInboxBadge() {
    try {
      const lastRead = parseInt(localStorage.getItem('mgmtInboxLastRead') || '0', 10);
      const res  = await apiFetch(`${API_BASE}/api/events/inbox`);
      const data = await res.json();
      const count = (data.threads || []).filter(t => {
        const replies = t.replies || [];
        if (!replies.length) return false;
        const last = replies[replies.length - 1];
        return last.sender_type === 'member' && new Date(t.latest_at).getTime() > lastRead;
      }).length;

      let badge = document.getElementById('inboxNavBadge');
      if (!badge) {
        const inboxLink = document.querySelector('a[href="management-inbox.html"]');
        if (!inboxLink) return;
        badge = document.createElement('span');
        badge.id = 'inboxNavBadge';
        badge.style.cssText = 'display:none;align-items:center;justify-content:center;background:#c96a5e;color:#fff;border-radius:50%;min-width:18px;height:18px;font-size:0.7rem;font-weight:700;margin-left:auto;padding:0 3px;';
        inboxLink.style.cssText += ';display:flex;align-items:center;';
        inboxLink.appendChild(badge);
      }
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
    } catch {}
  }
  loadInboxBadge();

  // ── Shared modal helpers ───────────────────────────────────────────────────
  const overlay = document.getElementById('modalOverlay');

  function openModal(modal) {
    if (modal) { modal.showModal(); if (overlay) overlay.hidden = false; }
  }
  function closeModal(modal) {
    if (modal) { modal.close(); if (overlay) overlay.hidden = true; }
  }

  document.querySelectorAll('[data-close]').forEach(btn =>
    btn.addEventListener('click', () => {
      const dialog = btn.closest('dialog');
      if (dialog) closeModal(dialog);
    })
  );

  // ════════════════════════════════════════════════════════════════════════════
  // 5.1  SHIFT OVERVIEW / DASHBOARD KPIs  (management.html)
  // ════════════════════════════════════════════════════════════════════════════
  if (document.getElementById('overviewBody')) {
    const overviewDate   = document.getElementById('overviewDate');
    const overviewRef    = document.getElementById('overviewRefreshed');
    const tbody          = document.getElementById('overviewBody');

    const kpiTotal       = document.getElementById('kpiTotal');
    const kpiCheckin     = document.getElementById('kpiCheckin');
    const kpiNoshow      = document.getElementById('kpiNoshow');
    const kpiCancelled   = document.getElementById('kpiCancelled');
    const kpiLateCancel  = document.getElementById('kpiLateCancel');
    const kpiGuests      = document.getElementById('kpiGuests');
    const kpiUtilisation = document.getElementById('kpiUtilisation');

    const today = new Date().toLocaleDateString('en-GB', {
      timeZone: 'Asia/Singapore', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    if (overviewDate) overviewDate.textContent = today;

    // Override status modal
    const overrideModal   = document.getElementById('overrideStatusModal');
    const overrideForm    = document.getElementById('overrideStatusForm');
    const overrideId      = document.getElementById('overrideContactId');

    // Add note modal
    const noteModal       = document.getElementById('addNoteModal');
    const noteForm        = document.getElementById('addNoteForm');
    const noteId          = document.getElementById('noteContactId');

    // Full record modal
    const fullRecordModal = document.getElementById('fullRecordModal');
    const fullRecordDiv   = document.getElementById('fullRecordContent');

    // Global action handlers
    window.mgmtOverrideStatus = (ref) => {
      overrideId.value = ref;
      openModal(overrideModal);
    };
    window.mgmtAddNote = (ref) => {
      noteId.value = ref;
      openModal(noteModal);
    };
    window.mgmtViewRecord = async (ref) => {
      fullRecordDiv.innerHTML = '<p>Loading…</p>';
      openModal(fullRecordModal);
      try {
        const res  = await apiFetch(`${API_BASE}/api/management/contact/${encodeURIComponent(ref)}`);
        const data = await res.json();
        const b    = data.booking;
        if (!b) { fullRecordDiv.innerHTML = '<p>No data found.</p>'; return; }
        const time = [b.slot_start_time, b.slot_end_time].filter(Boolean).join(' – ') || '—';
        const rows = [
          ['Booking Reference', b.booking_reference],
          ['Booking Type',      b.booking_type],
          ['Facility / Venue',  b.facility_or_venue],
          ['Membership No.',    b.membership_number],
          ['Name',              b.name],
          ['Pax',               b.outlet_pax],
          ['Date',              b.slot_date],
          ['Time',              time],
          ['Notes',             b.notes || b.special_request || '—'],
        ];
        fullRecordDiv.innerHTML =
          '<table class="data-table">' +
          rows.map(([label, val]) => `<tr><td><strong>${label}</strong></td><td>${val ?? '—'}</td></tr>`).join('') +
          '</table>';
      } catch {
        fullRecordDiv.innerHTML = '<p>Failed to load record.</p>';
      }
    };

    if (overrideForm) {
      overrideForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ref    = overrideId.value;
        const status = document.getElementById('overrideStatus').value;
        const res    = await apiFetch(`${API_BASE}/api/management/override-status`, {
          method: 'PUT',
          body: JSON.stringify({ booking_reference: ref, new_status: status }),
        });
        const data = await res.json();
        notify(data.message, !data.success);
        closeModal(overrideModal);
        if (data.success) loadDashboard();
      });
    }

    if (noteForm) {
      noteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ref  = noteId.value;
        const note = document.getElementById('noteText').value.trim();
        const res  = await apiFetch(`${API_BASE}/api/management/add-note`, {
          method: 'POST',
          body: JSON.stringify({ booking_reference: ref, note }),
        });
        const data = await res.json();
        notify(data.message, !data.success);
        closeModal(noteModal);
        noteForm.reset();
      });
    }

    async function loadDashboard() {
      // Load KPIs
      try {
        const res  = await apiFetch(`${API_BASE}/api/management/dashboard`);
        const data = await res.json();
        if (data.success) {
          const k = data.kpis;
          kpiTotal.textContent       = k.total;
          kpiCheckin.textContent     = k.checkedIn;
          kpiNoshow.textContent      = k.noShows;
          kpiCancelled.textContent   = k.cancelled;
          kpiLateCancel.textContent  = k.lateCancel;
          kpiGuests.textContent      = k.guests;
          kpiUtilisation.textContent = k.utilisation + '%';
        }
      } catch { /* silent */ }

      // Load schedule
      try {
        const res  = await apiFetch(`${API_BASE}/api/management/schedule`);
        const data = await res.json();
        const rows = data.bookings || [];

        if (!rows.length) {
          tbody.innerHTML = '<tr class="table-empty"><td colspan="8">No bookings today.</td></tr>';
        } else {
          tbody.innerHTML = rows.map(b => `
            <tr>
              <td>${b.slot_start_time || '—'}</td>
              <td>${b.name || '—'}</td>
              <td>${b.membership_number}</td>
              <td>${b.facility_or_venue || '—'}</td>
              <td>${b.outlet_pax || '—'}</td>
              <td>${b.booking_type || '—'}</td>
              <td><span class="status-badge status--${(b.booking_status || '').toLowerCase().replace(/\s/g, '-')}">${b.booking_status || '—'}</span></td>
              <td>
                <button class="btn-sm btn-secondary" onclick="mgmtViewRecord('${b.booking_reference}')">View</button>
                <button class="btn-sm btn-secondary" onclick="mgmtOverrideStatus('${b.booking_reference}')">Override</button>
                <button class="btn-sm btn-secondary" onclick="mgmtAddNote('${b.booking_reference}')">Note</button>
              </td>
            </tr>`).join('');
        }
        if (overviewRef) overviewRef.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
      } catch {
        tbody.innerHTML = '<tr class="table-empty"><td colspan="8">Failed to load.</td></tr>';
      }
    }

    loadDashboard();
    setInterval(loadDashboard, 120000); // every 2 min
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 5.2  LIVE OCCUPANCY  (management-occupancy.html)
  // ════════════════════════════════════════════════════════════════════════════
  if (document.getElementById('refreshOccupancyBtn')) {
    const refreshBtn = document.getElementById('refreshOccupancyBtn');

    function setGauge(id, count, cap) {
      const card  = document.getElementById(`gauge-${id}`);
      const cnt   = document.getElementById(`cnt-${id}`);
      const badge = document.getElementById(`badge-${id}`);
      if (!card || !cnt || !badge) return;

      cnt.textContent = count;
      const pct = Math.min(Math.round((count / cap) * 100), 100);
      const bar = card.querySelector('.gauge-bar__fill');
      if (bar) bar.style.width = pct + '%';

      // Colour: green = 0 booked (available), orange = partially booked, red = full
      let colour = 'green';
      if (count >= cap)    colour = 'red';
      else if (count > 0)  colour = 'orange';

      card.className = card.className.replace(/gauge-card--(green|orange|red)/g, '').trim();
      card.classList.add(`gauge-card--${colour}`);
      badge.textContent = colour === 'green' ? 'Available' : colour === 'orange' ? 'Partially Booked' : 'Full';
      badge.style.color = colour === 'green' ? '#c25972' : colour === 'orange' ? '#d9a878' : '#c96a5e';
      if (bar) bar.style.background = colour === 'green' ? '#c25972' : colour === 'orange' ? '#d9a878' : '#c96a5e';
    }

    async function loadOccupancy() {
      try {
        const res  = await apiFetch(`${API_BASE}/api/management/occupancy`);
        const data = await res.json();
        if (!data.success) return;
        const v = data.venues;

        // Tennis — single gauge, max 4 slots
        setGauge('tennis', v.tennis.count, 4);

        // Squash — single gauge, max 4 slots
        setGauge('squash', v.squash.count, 4);

        setGauge('gym', v.gym.count, 20);
        setGauge('lemansion-lunch', v.leMansionLunch.count, 15);
        setGauge('lemansion-dinner', v.leMansionDinner.count, 15);
        setGauge('barkers', v.barkers.count, 10);
        setGauge('oasis', v.oasis.count, 12);
      } catch { /* silent */ }
    }

    refreshBtn.addEventListener('click', loadOccupancy);
    loadOccupancy();
    setInterval(loadOccupancy, 120000);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 5.3  BOOKING ANALYTICS  (management-analytics.html)
  // ════════════════════════════════════════════════════════════════════════════
  if (document.getElementById('analyticsBody')) {
    const tbody      = document.getElementById('analyticsBody');
    const anaVenue   = document.getElementById('anaVenue');
    const anaShift   = document.getElementById('anaShift');
    const anaRange   = document.getElementById('anaDateRange');
    const anaFrom    = document.getElementById('anaDateFrom');
    const anaTo      = document.getElementById('anaDateTo');
    const anaType    = document.getElementById('anaType');
    const anaStatus  = document.getElementById('anaStatus');
    const anaSource  = document.getElementById('anaSource');

    // Modals (same IDs as management.html)
    const overrideModal = document.getElementById('overrideStatusModal');
    const overrideForm  = document.getElementById('overrideStatusForm');
    const overrideId    = document.getElementById('overrideContactId');
    const noteModal     = document.getElementById('addNoteModal');
    const noteForm      = document.getElementById('addNoteForm');
    const noteId        = document.getElementById('noteContactId');
    const fullRecordModal = document.getElementById('fullRecordModal');
    const fullRecordDiv   = document.getElementById('fullRecordContent');

    let allBookings = [];

    const todaySGT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });

    // Toggle custom date fields
    anaRange.addEventListener('change', () => {
      const custom = anaRange.value === 'custom';
      anaFrom.hidden = !custom;
      anaTo.hidden   = !custom;
    });

    // Toggle shift dropdown when Le Mansion is selected
    anaVenue.addEventListener('change', () => {
      const isLeMansion = anaVenue.value === 'Le Mansion';
      anaShift.hidden = !isLeMansion;
      if (!isLeMansion) anaShift.value = '';
      renderAnalytics();
    });

    function getWeekRange() {
      const now = new Date();
      const day = now.getDay();
      const mon = new Date(now);
      mon.setDate(now.getDate() - ((day + 6) % 7));
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return {
        from: mon.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }),
        to:   sun.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }),
      };
    }

    // ── Chart instances ──
    let chartInstances = {};

    // Venue display names
    const venueLabels = {
      'Tennis': 'Tennis',
      'Squash': 'Squash',
      'Gym': 'Gym',
      'Le Mansion': 'Le Mansion',
      'Barkerslounge': "Barker's Lounge",
      'Oasis': 'Oasis',
    };

    // Dashboard-matching colour palette
    const COLORS = {
      navy:      '#1e1e22',
      navyDeep:  '#0a0a0c',
      gold:      '#BFB194',
      goldLight: '#E8DFD0',
      goldDim:   '#9a8e73',
      white:     '#f8f9fa',
      green:     '#c25972',
      red:       '#c96a5e',
      amber:     '#e3cbb3',
      blue:      '#7d9bc4',
    };

    const VENUE_COLORS = ['#BFB194', '#c25972', '#e3cbb3', '#7d9bc4', '#a98bc0', '#8e8e96'];
    const STATUS_COLORS = {
      'Confirmed':  '#BFB194',
      'Checked In': '#c25972',
      'No-Show':    '#c96a5e',
      'Cancelled':  '#8e8e96',
      'Pending':    '#e3cbb3',
      'Overdue':    '#d9a878',
      'Walkin':     '#7d9bc4',
      'Completed':  '#d98ba0',
    };
    // Map any booking_status variant to its canonical GHL picklist value
    function normalizeStatus(raw) {
      const key = (raw || '').toLowerCase().replace(/[\s_-]+/g, '');
      const map = {
        'confirmed': 'Confirmed', 'pending': 'Pending', 'checkedin': 'Checked In',
        'noshow': 'No-Show', 'cancelled': 'Cancelled', 'overdue': 'Overdue',
        'walkin': 'Walkin', 'completed': 'Completed', 'latefeepaid': 'Late Fee Paid',
      };
      return map[key] || raw;
    }
    // Map any facility_or_venue variant to its canonical GHL picklist value
    function normalizeVenue(raw) {
      const key = (raw || '').toLowerCase().replace(/[\s_'-]+/g, '');
      const map = {
        'tennis': 'Tennis', 'squash': 'Squash', 'gym': 'Gym',
        'lemansion': 'Le Mansion', 'barkerslounge': 'Barkerslounge', 'oasis': 'Oasis',
      };
      return map[key] || raw;
    }
    // Normalise booking_type to exactly 4 chart categories
    function normalizeType(raw) {
      const key = (raw || '').toLowerCase().trim();
      if (key === 'dining')                              return 'Dining';
      if (key === 'walkin' || key === 'walk-in' || key === 'walk_in') return 'Walkin';
      if (key === 'guest_pass' || key === 'guest pass' || key === 'guest') return 'Guest';
      return 'Facility'; // facility, advance, block, cancellation, etc.
    }
    const TYPE_COLORS  = { 'Facility': '#BFB194', 'Dining': '#c25972', 'Walkin': '#7d9bc4', 'Guest': '#e3cbb3' };
    const TYPE_LABELS  = { 'Facility': 'Facility', 'Dining': 'Dining', 'Walkin': 'Walk-in', 'Guest': 'Guest' };

    // Shared Chart.js defaults
    const chartFont = { family: "'Quicksand', 'Palatino Linotype', sans-serif", size: 12 };
    if (typeof Chart !== 'undefined') {
      Chart.defaults.font.family = chartFont.family;
      Chart.defaults.font.size   = 12;
      Chart.defaults.color       = '#8e8e96';
    }

    function destroyCharts() {
      Object.values(chartInstances).forEach(c => c.destroy());
      chartInstances = {};
    }

    function getFilteredRows() {
      // Exclude facility blocks — analytics should only show member/guest bookings
      let rows = allBookings.filter(b => (b.booking_type || '').toLowerCase() !== 'block');
      const venue  = anaVenue.value;
      const shift  = anaShift ? anaShift.value : '';
      const type   = anaType.value;
      const status = anaStatus.value;
      const source = anaSource.value;

      const range = anaRange.value;
      if (range === 'today') {
        const today = todaySGT();
        rows = rows.filter(b => b.slot_date === today);
      } else if (range === 'week') {
        const { from, to } = getWeekRange();
        rows = rows.filter(b => b.slot_date >= from && b.slot_date <= to);
      } else if (range === 'custom') {
        const from = anaFrom.value;
        const to   = anaTo.value;
        if (from) rows = rows.filter(b => b.slot_date >= from);
        if (to)   rows = rows.filter(b => b.slot_date <= to);
      }

      if (venue)  rows = rows.filter(b => normalizeVenue(b.facility_or_venue) === venue);
      if (shift)  rows = rows.filter(b => (b.booking_shift || '').toLowerCase() === shift.toLowerCase());
      if (type)   rows = rows.filter(b => normalizeType(b.booking_type) === normalizeType(type));
      if (status) rows = rows.filter(b => (b.booking_status || '').toLowerCase().replace(/[\s-]/g, '_') === status);
      if (source) rows = rows.filter(b => sourceGroup(b) === source);
      return rows;
    }

    // Canonical source bucket. Prefers the persisted `source` field (set at
    // write-time by each controller) and falls back to the legacy heuristic
    // for older rows that pre-date that field.
    function sourceGroup(b) {
      const raw = (b.source || '').toLowerCase();
      if (raw === 'member')                         return 'member';
      if (raw === 'staff' || raw === 'walkin')      return 'staff';
      if (raw === 'guest_pass' || raw === 'guest')  return 'guest';
      // Legacy fallback: only walk-ins persisted 'STAFF' as membership_number.
      if (b.membership_number === 'STAFF') return 'staff';
      if ((b.booking_type || '').toLowerCase().includes('guest')) return 'guest';
      return 'member';
    }
    function sourceLabel(b) {
      const g = sourceGroup(b);
      return g === 'staff' ? 'Staff Created' : g === 'guest' ? 'Guest Pass' : 'Member Portal';
    }

    function renderCharts(rows) {
      if (typeof Chart === 'undefined') return;
      destroyCharts();

      // ── 1. Bookings Over Time (line chart) ──
      const dateCounts = {};
      rows.forEach(b => { if (b.slot_date) dateCounts[b.slot_date] = (dateCounts[b.slot_date] || 0) + 1; });
      const sortedDates = Object.keys(dateCounts).sort();
      const ctxLine = document.getElementById('chartBookingsOverTime');
      if (ctxLine) {
        chartInstances.line = new Chart(ctxLine, {
          type: 'line',
          data: {
            labels: sortedDates.map(d => { const p = d.split('-'); return p[2] + '/' + p[1]; }),
            datasets: [{
              label: 'Bookings',
              data: sortedDates.map(d => dateCounts[d]),
              borderColor: COLORS.navy,
              backgroundColor: 'rgba(191,177,148,0.10)',
              borderWidth: 2,
              pointBackgroundColor: COLORS.gold,
              pointBorderColor: COLORS.navy,
              pointRadius: 4,
              pointHoverRadius: 6,
              fill: true,
              tension: 0.3,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: COLORS.navyDeep,
                titleColor: COLORS.goldLight,
                bodyColor: COLORS.white,
                borderColor: 'rgba(191,177,148,0.35)',
                borderWidth: 1,
                cornerRadius: 0,
                titleFont: { family: "'Faculty Glyphic', Georgia, serif", size: 14, weight: '600' },
                bodyFont: chartFont,
              },
            },
            scales: {
              x: {
                grid: { color: 'rgba(243,243,245,0.06)' },
                ticks: { font: chartFont, color: COLORS.goldDim },
              },
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(243,243,245,0.06)' },
                ticks: { font: chartFont, color: COLORS.goldDim, stepSize: 1 },
              },
            },
          },
        });
      }

      // ── 2. By Venue (doughnut) ──
      const venueCounts = {};
      rows.forEach(b => {
        const v = normalizeVenue(b.facility_or_venue || 'Other');
        venueCounts[v] = (venueCounts[v] || 0) + 1;
      });
      const venueKeys = Object.keys(venueCounts);
      const ctxVenue = document.getElementById('chartByVenue');
      if (ctxVenue) {
        chartInstances.venue = new Chart(ctxVenue, {
          type: 'doughnut',
          data: {
            labels: venueKeys.map(k => venueLabels[k] || k),
            datasets: [{
              data: venueKeys.map(k => venueCounts[k]),
              backgroundColor: venueKeys.map((_, i) => VENUE_COLORS[i % VENUE_COLORS.length]),
              borderColor: '#fff',
              borderWidth: 2,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
              legend: {
                position: 'bottom',
                labels: { font: chartFont, color: COLORS.goldDim, padding: 14, usePointStyle: true, pointStyleWidth: 10 },
              },
              tooltip: {
                backgroundColor: COLORS.navyDeep,
                titleColor: COLORS.goldLight,
                bodyColor: COLORS.white,
                borderColor: 'rgba(191,177,148,0.35)',
                borderWidth: 1,
                cornerRadius: 0,
              },
            },
          },
        });
      }

      // ── 3. By Status (doughnut) ──
      const statusCounts = {};
      rows.forEach(b => {
        const s = normalizeStatus(b.booking_status || 'Unknown');
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      });
      const statusKeys = Object.keys(statusCounts);
      const ctxStatus = document.getElementById('chartByStatus');
      if (ctxStatus) {
        chartInstances.status = new Chart(ctxStatus, {
          type: 'doughnut',
          data: {
            labels: statusKeys,
            datasets: [{
              data: statusKeys.map(k => statusCounts[k]),
              backgroundColor: statusKeys.map(k => STATUS_COLORS[k] || '#999'),
              borderColor: '#fff',
              borderWidth: 2,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
              legend: {
                position: 'bottom',
                labels: { font: chartFont, color: COLORS.goldDim, padding: 14, usePointStyle: true, pointStyleWidth: 10 },
              },
              tooltip: {
                backgroundColor: COLORS.navyDeep,
                titleColor: COLORS.goldLight,
                bodyColor: COLORS.white,
                borderColor: 'rgba(191,177,148,0.35)',
                borderWidth: 1,
                cornerRadius: 0,
              },
            },
          },
        });
      }

      // ── 4. By Type (doughnut) ──
      const typeCounts = {};
      rows.forEach(b => {
        const t = normalizeType(b.booking_type || 'other');
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      });
      const typeKeys = Object.keys(typeCounts);
      const ctxType = document.getElementById('chartByType');
      if (ctxType) {
        chartInstances.type = new Chart(ctxType, {
          type: 'doughnut',
          data: {
            labels: typeKeys.map(k => TYPE_LABELS[k] || k),
            datasets: [{
              data: typeKeys.map(k => typeCounts[k]),
              backgroundColor: typeKeys.map(k => TYPE_COLORS[k] || '#999'),
              borderColor: '#fff',
              borderWidth: 2,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
              legend: {
                position: 'bottom',
                labels: { font: chartFont, color: COLORS.goldDim, padding: 14, usePointStyle: true, pointStyleWidth: 10 },
              },
              tooltip: {
                backgroundColor: COLORS.navyDeep,
                titleColor: COLORS.goldLight,
                bodyColor: COLORS.white,
                borderColor: 'rgba(191,177,148,0.35)',
                borderWidth: 1,
                cornerRadius: 0,
              },
            },
          },
        });
      }

      // ── 5. Peak Hours (bar chart) ──
      const hourCounts = {};
      rows.forEach(b => {
        if (!b.slot_start_time) return;
        const hour = b.slot_start_time.split(':')[0];
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });
      const hourKeys = Object.keys(hourCounts).sort();
      const ctxHours = document.getElementById('chartPeakHours');
      if (ctxHours) {
        chartInstances.hours = new Chart(ctxHours, {
          type: 'bar',
          data: {
            labels: hourKeys.map(h => h + ':00'),
            datasets: [{
              label: 'Bookings',
              data: hourKeys.map(h => hourCounts[h]),
              backgroundColor: hourKeys.map(h => {
                const c = hourCounts[h];
                const max = Math.max(...Object.values(hourCounts));
                return c >= max * 0.8 ? COLORS.gold : 'rgba(243,243,245,0.28)';
              }),
              borderColor: 'transparent',
              borderWidth: 0,
              borderRadius: 2,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: COLORS.navyDeep,
                titleColor: COLORS.goldLight,
                bodyColor: COLORS.white,
                borderColor: 'rgba(191,177,148,0.35)',
                borderWidth: 1,
                cornerRadius: 0,
              },
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { font: chartFont, color: COLORS.goldDim },
              },
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(243,243,245,0.06)' },
                ticks: { font: chartFont, color: COLORS.goldDim, stepSize: 1 },
              },
            },
          },
        });
      }

      // ── 6. Source (doughnut) ──
      let memberCount = 0, staffCount = 0, guestCount = 0;
      rows.forEach(b => {
        const g = sourceGroup(b);
        if (g === 'staff')      staffCount++;
        else if (g === 'guest') guestCount++;
        else                    memberCount++;
      });
      const ctxSource = document.getElementById('chartBySource');
      if (ctxSource) {
        chartInstances.source = new Chart(ctxSource, {
          type: 'doughnut',
          data: {
            labels: ['Member Portal', 'Staff Created', 'Guest Pass'],
            datasets: [{
              data: [memberCount, staffCount, guestCount],
              backgroundColor: [COLORS.navy, COLORS.gold, COLORS.goldLight],
              borderColor: '#fff',
              borderWidth: 2,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
              legend: {
                position: 'bottom',
                labels: { font: chartFont, color: COLORS.goldDim, padding: 14, usePointStyle: true, pointStyleWidth: 10 },
              },
              tooltip: {
                backgroundColor: COLORS.navyDeep,
                titleColor: COLORS.goldLight,
                bodyColor: COLORS.white,
                borderColor: 'rgba(191,177,148,0.35)',
                borderWidth: 1,
                cornerRadius: 0,
              },
            },
          },
        });
      }
    }

    function renderAnalytics() {
      const rows = getFilteredRows();

      if (!rows.length) {
        tbody.innerHTML = '<tr class="table-empty"><td colspan="10">No bookings match filters.</td></tr>';
        renderCharts([]);
        return;
      }

      renderCharts(rows);

      tbody.innerHTML = rows.map(b => `
        <tr>
          <td>${b.slot_date || '—'}</td>
          <td>${b.slot_start_time || '—'}</td>
          <td>${b.name || '—'}</td>
          <td>${b.membership_number || '—'}</td>
          <td>${b.facility_or_venue || '—'}</td>
          <td>${b.outlet_pax || '—'}</td>
          <td>${b.booking_type || '—'}</td>
          <td>${sourceLabel(b)}</td>
          <td><span class="status-badge status--${(b.booking_status || '').toLowerCase().replace(/\s/g, '-')}">${b.booking_status || '—'}</span></td>
          <td>
            <button class="btn-sm btn-secondary" onclick="mgmtViewRecord('${b.booking_reference}')">View</button>
            <button class="btn-sm btn-secondary" onclick="mgmtOverrideStatus('${b.booking_reference}')">Override</button>
            <button class="btn-sm btn-secondary" onclick="mgmtAddNote('${b.booking_reference}')">Note</button>
          </td>
        </tr>`).join('');
    }

    // Global action handlers (shared with management.html)
    window.mgmtOverrideStatus = window.mgmtOverrideStatus || function(ref) {
      overrideId.value = ref;
      openModal(overrideModal);
    };
    window.mgmtAddNote = window.mgmtAddNote || function(ref) {
      noteId.value = ref;
      openModal(noteModal);
    };
    window.mgmtViewRecord = window.mgmtViewRecord || async function(ref) {
      fullRecordDiv.innerHTML = '<p>Loading…</p>';
      openModal(fullRecordModal);
      try {
        const res  = await apiFetch(`${API_BASE}/api/management/contact/${encodeURIComponent(ref)}`);
        const data = await res.json();
        const b    = data.booking;
        if (!b) { fullRecordDiv.innerHTML = '<p>No data found.</p>'; return; }
        const time = [b.slot_start_time, b.slot_end_time].filter(Boolean).join(' – ') || '—';
        const rows = [
          ['Booking Reference', b.booking_reference],
          ['Booking Type',      b.booking_type],
          ['Facility / Venue',  b.facility_or_venue],
          ['Membership No.',    b.membership_number],
          ['Name',              b.name],
          ['Pax',               b.outlet_pax],
          ['Date',              b.slot_date],
          ['Time',              time],
          ['Notes',             b.notes || b.special_request || '—'],
        ];
        fullRecordDiv.innerHTML =
          '<table class="data-table">' +
          rows.map(([label, val]) => `<tr><td><strong>${label}</strong></td><td>${val ?? '—'}</td></tr>`).join('') +
          '</table>';
      } catch {
        fullRecordDiv.innerHTML = '<p>Failed to load record.</p>';
      }
    };

    if (overrideForm) {
      overrideForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ref    = overrideId.value;
        const status = document.getElementById('overrideStatus').value;
        const res    = await apiFetch(`${API_BASE}/api/management/override-status`, {
          method: 'PUT',
          body: JSON.stringify({ booking_reference: ref, new_status: status }),
        });
        const data = await res.json();
        notify(data.message, !data.success);
        closeModal(overrideModal);
        if (data.success) { loadAnalytics(); }
      });
    }

    if (noteForm) {
      noteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ref  = noteId.value;
        const note = document.getElementById('noteText').value.trim();
        const res  = await apiFetch(`${API_BASE}/api/management/add-note`, {
          method: 'POST',
          body: JSON.stringify({ booking_reference: ref, note }),
        });
        const data = await res.json();
        notify(data.message, !data.success);
        closeModal(noteModal);
        noteForm.reset();
      });
    }

    async function loadAnalytics() {
      tbody.innerHTML = '<tr class="table-empty"><td colspan="10">Loading analytics…</td></tr>';
      try {
        const res  = await apiFetch(`${API_BASE}/api/management/analytics`);
        const data = await res.json();
        allBookings = data.bookings || [];
        renderAnalytics();
      } catch {
        tbody.innerHTML = '<tr class="table-empty"><td colspan="10">Failed to load.</td></tr>';
      }
    }

    [anaVenue, anaShift, anaRange, anaFrom, anaTo, anaType, anaStatus, anaSource].forEach(el => {
      if (el) el.addEventListener('change', renderAnalytics);
    });

    loadAnalytics();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 5.4  NO-SHOW TRACKER  (management-noshow.html)
  // ════════════════════════════════════════════════════════════════════════════
  if (document.getElementById('noshowBody')) {
    const tbody = document.getElementById('noshowBody');

    window.mgmtFlagMember = async (membership_number) => {
      const res  = await apiFetch(`${API_BASE}/api/management/flag-member`, {
        method: 'POST',
        body: JSON.stringify({ membership_number }),
      });
      const data = await res.json();
      notify(data.message, !data.success);
      if (data.success) loadNoShows();
    };

    async function loadNoShows() {
      tbody.innerHTML = '<tr class="table-empty"><td colspan="6">Loading…</td></tr>';
      try {
        const res  = await apiFetch(`${API_BASE}/api/management/no-shows`);
        const data = await res.json();
        const members = data.members || [];

        if (!members.length) {
          tbody.innerHTML = '<tr class="table-empty"><td colspan="6">No no-shows recorded.</td></tr>';
          return;
        }

        tbody.innerHTML = members.map(m => {
          let cls = '';
          if (m.count >= 5) cls = 'row--red';
          else if (m.count >= 3) cls = 'row--amber';

          const flagBadge = m.is_flagged
            ? `<span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:600;background:#c96a5e;color:#fff;">Flagged</span>`
            : '';

          return `
          <tr class="${cls}" style="${m.count >= 5 ? 'background:rgba(201,106,94,0.1)' : m.count >= 3 ? 'background:rgba(227,203,179,0.1)' : ''}">
            <td>${m.name || '—'}${flagBadge}</td>
            <td>${m.membership_number}</td>
            <td><strong>${m.count}</strong></td>
            <td>${m.mostRecent || '—'}</td>
            <td>${m.facility || '—'}</td>
            <td>
              ${m.is_flagged ? '' : `<button class="btn-sm btn-secondary" onclick="mgmtFlagMember('${m.membership_number}')">Flag</button>`}
              ${m.count >= 5 && !m.is_flagged ? `<button class="btn-sm btn-secondary" style="color:#c96a5e" onclick="mgmtFlagMember('${m.membership_number}')">Restrict</button>` : ''}
            </td>
          </tr>`;
        }).join('');
      } catch {
        tbody.innerHTML = '<tr class="table-empty"><td colspan="6">Failed to load.</td></tr>';
      }
    }

    loadNoShows();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 5.5  GUEST RECORD AUDIT  (management-guests.html)
  // ════════════════════════════════════════════════════════════════════════════
  if (document.getElementById('guestsBody')) {
    const tbody         = document.getElementById('guestsBody');
    const quotaModal    = document.getElementById('adjustQuotaModal');
    const quotaForm     = document.getElementById('adjustQuotaForm');
    const quotaContactId = document.getElementById('quotaContactId');

    window.mgmtAdjustQuota = (membership_number) => {
      quotaContactId.value = membership_number;
      openModal(quotaModal);
    };

    if (quotaForm) {
      quotaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const membership_number = quotaContactId.value;
        const new_quota = document.getElementById('quotaValue').value;
        const res  = await apiFetch(`${API_BASE}/api/management/adjust-quota`, {
          method: 'PUT',
          body: JSON.stringify({ membership_number, new_quota: parseInt(new_quota) }),
        });
        const data = await res.json();
        notify(data.message, !data.success);
        closeModal(quotaModal);
        quotaForm.reset();
      });
    }

    // Toggle the expanded guest-records row for a member
    window.mgmtToggleGuestRecords = (membershipNumber) => {
      const row = document.getElementById(`guest-records-${membershipNumber}`);
      const btn = document.getElementById(`guest-expand-${membershipNumber}`);
      if (!row) return;
      const isHidden = row.style.display === 'none' || row.style.display === '';
      row.style.display = isHidden ? '' : 'none';
      if (btn) btn.textContent = isHidden ? 'Hide Guests' : 'View Guests';
    };

    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    async function loadGuests() {
      tbody.innerHTML = '<tr class="table-empty"><td colspan="6">Loading…</td></tr>';
      try {
        const res  = await apiFetch(`${API_BASE}/api/management/guests`);
        const data = await res.json();
        const members = data.members || [];

        if (!members.length) {
          tbody.innerHTML = '<tr class="table-empty"><td colspan="6">No guest passes this month.</td></tr>';
          return;
        }

        tbody.innerHTML = members.map(m => {
          const flagged   = m.sameGuestMax >= 2;
          const memNum    = escapeHtml(m.membership_number || '');
          const rowStyle  = flagged ? 'background:rgba(227,203,179,0.1)' : '';

          // Detail rows for each guest record (initially hidden)
          const guestRows = (m.records || []).map(r => `
            <div class="guest-record-row" style="display:grid;grid-template-columns:1.4fr 1.6fr 1.2fr 1fr 1fr 1fr;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.07);font-size:0.92em;">
              <span><strong>${escapeHtml(r.guest_name)}</strong></span>
              <span>${escapeHtml(r.guest_email) || '—'}${r.guest_phone ? ' · ' + escapeHtml(r.guest_phone) : ''}</span>
              <span>${escapeHtml(r.facility_or_venue)}${r.booking_shift ? ' · ' + escapeHtml(r.booking_shift) : ''}</span>
              <span>${escapeHtml(r.slot_date)}</span>
              <span>${escapeHtml(r.booking_status)}</span>
              <span style="color:#666;font-family:monospace;font-size:0.85em;">${escapeHtml(r.booking_reference)}</span>
            </div>`).join('');

          return `
          <tr style="${rowStyle}">
            <td>${escapeHtml(m.name) || '—'}</td>
            <td>${memNum || '—'}</td>
            <td>${m.quota}</td>
            <td>${m.used}</td>
            <td>${flagged ? `<strong style="color:#e3cbb3">${m.sameGuestMax}</strong>` : m.sameGuestMax}</td>
            <td>
              <button class="btn-sm btn-secondary" id="guest-expand-${memNum}" onclick="mgmtToggleGuestRecords('${memNum}')">View Guests</button>
              <button class="btn-sm btn-secondary" onclick="mgmtAdjustQuota('${memNum}')">Adjust Quota</button>
            </td>
          </tr>
          <tr id="guest-records-${memNum}" style="display:none;">
            <td colspan="6" style="background:rgba(255,255,255,0.03);padding:0;">
              <div style="display:grid;grid-template-columns:1.4fr 1.6fr 1.2fr 1fr 1fr 1fr;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.1);font-weight:600;font-size:0.85em;color:#a0a0a8;">
                <span>Guest Name</span>
                <span>Contact</span>
                <span>Venue</span>
                <span>Date</span>
                <span>Status</span>
                <span>Reference</span>
              </div>
              ${guestRows || '<div style="padding:12px;color:#666;">No guest records.</div>'}
            </td>
          </tr>`;
        }).join('');
      } catch {
        tbody.innerHTML = '<tr class="table-empty"><td colspan="6">Failed to load.</td></tr>';
      }
    }

    loadGuests();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 5.6  LATE CANCELLATION FEES  (management-fees.html)
  // ════════════════════════════════════════════════════════════════════════════
  if (document.getElementById('lateFeesBody')) {
    const tbody       = document.getElementById('lateFeesBody');
    const waiveModal  = document.getElementById('waiveFeeModal');
    const waiveForm   = document.getElementById('waiveFeeForm');
    const waiverId    = document.getElementById('waiverContactId');

    window.mgmtMarkPaid = async (ref) => {
      const res  = await apiFetch(`${API_BASE}/api/management/mark-paid`, {
        method: 'PUT',
        body: JSON.stringify({ booking_reference: ref }),
      });
      const data = await res.json();
      notify(data.message, !data.success);
      if (data.success) loadFees();
    };

    window.mgmtWaive = (ref) => {
      waiverId.value = ref;
      openModal(waiveModal);
    };

    if (waiveForm) {
      waiveForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ref    = waiverId.value;
        const reason = document.getElementById('waiverReason').value.trim();
        const res    = await apiFetch(`${API_BASE}/api/management/waive-fee`, {
          method: 'PUT',
          body: JSON.stringify({ booking_reference: ref, waiver_reason: reason }),
        });
        const data = await res.json();
        notify(data.message, !data.success);
        closeModal(waiveModal);
        waiveForm.reset();
        if (data.success) loadFees();
      });
    }

    async function loadFees() {
      tbody.innerHTML = '<tr class="table-empty"><td colspan="8">Loading…</td></tr>';
      try {
        const res  = await apiFetch(`${API_BASE}/api/management/fees`);
        const data = await res.json();
        const rows = data.bookings || [];

        if (!rows.length) {
          tbody.innerHTML = '<tr class="table-empty"><td colspan="8">No late cancellations.</td></tr>';
          return;
        }

        tbody.innerHTML = rows.map(b => {
          let feeStatus = 'Pending';
          let statusColor = '#c96a5e';
          if (b.fee_waived) { feeStatus = 'Waived'; statusColor = '#e3cbb3'; }
          else if (/late_fee_paid/i.test(b.booking_status)) { feeStatus = 'Paid'; statusColor = '#c25972'; }

          return `
          <tr>
            <td>
              <div class="cell-member">
                <span class="cell-member__name">${b.name || '—'}</span>
                ${b.membership_number ? `<span class="cell-member__id">${b.membership_number}</span>` : ''}
              </div>
            </td>
            <td>${b.facility_or_venue || '—'}</td>
            <td>${b.slot_date || '—'} ${b.slot_start_time || ''}</td>
            <td>${b.updatedAt ? new Date(b.updatedAt).toLocaleString('en-SG') : '—'}</td>
            <td><span style="color:${statusColor};font-weight:600">${feeStatus}</span></td>
            <td>
              ${b.waiver_reason
                ? `<div class="cell-waiver" onclick="this.classList.toggle('cell-waiver--open')"><span class="cell-waiver__text">${b.waiver_reason}</span><span class="cell-waiver__toggle"></span></div>`
                : '—'}
            </td>
            <td>${b.waiver_by || '—'}</td>
            <td>
              ${feeStatus === 'Pending' ? `
                <div class="cell-actions">
                  <button class="btn-row--navy" onclick="mgmtMarkPaid('${b.booking_reference}')">Mark Paid</button>
                  <button class="btn-row--gold" onclick="mgmtWaive('${b.booking_reference}')">Waive</button>
                </div>
              ` : '—'}
            </td>
          </tr>`;
        }).join('');

        // Only show expand toggle when text genuinely overflows its cell
        tbody.querySelectorAll('.cell-waiver').forEach(wrapper => {
          const text = wrapper.querySelector('.cell-waiver__text');
          const toggle = wrapper.querySelector('.cell-waiver__toggle');
          if (text && toggle && text.scrollWidth <= text.offsetWidth) {
            toggle.hidden = true;
            wrapper.style.cursor = 'default';
          }
        });
      } catch {
        tbody.innerHTML = '<tr class="table-empty"><td colspan="8">Failed to load.</td></tr>';
      }
    }

    loadFees();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 5.7  FACILITY BLOCKS  (management-blocks.html)
  // ════════════════════════════════════════════════════════════════════════════
  if (document.getElementById('mgmtBlockForm')) {
    const blockForm    = document.getElementById('mgmtBlockForm');
    const tbody        = document.getElementById('mgmtBlocksBody');
    const dateFromInput = document.getElementById('mgmtBlockDateFrom');
    const dateToInput   = document.getElementById('mgmtBlockDateTo');

    // Set date constraints: today to 30 days ahead
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    const maxDate  = new Date(today);
    maxDate.setDate(today.getDate() + 30);
    const maxStr = maxDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    if (dateFromInput) { dateFromInput.min = todayStr; dateFromInput.max = maxStr; }
    if (dateToInput)   { dateToInput.min   = todayStr; dateToInput.max   = maxStr; }

    // Keep Date To min in sync with Date From
    if (dateFromInput && dateToInput) {
      dateFromInput.addEventListener('change', () => {
        dateToInput.min = dateFromInput.value || todayStr;
        if (dateToInput.value && dateToInput.value < dateFromInput.value) {
          dateToInput.value = dateFromInput.value;
        }
      });
    }

    function validateBlock(dateFrom, dateTo, startTime, endTime, isEdit = false, originalDateFrom = null) {
      if (!dateFrom) return 'Please select a start date.';
      if (!isEdit && dateFrom < todayStr) return 'Block start date cannot be in the past.';
      // In edit mode an active block may already have a past start, but the admin
      // must not push the start date further into the past than it already was.
      if (isEdit && dateFrom < todayStr && originalDateFrom && dateFrom < originalDateFrom) {
        return 'Start date cannot be moved further into the past.';
      }
      if (!dateTo || dateTo < dateFrom) return 'End date must be on or after start date.';
      if (!startTime || !endTime) return 'Please select start and end times.';
      if (dateFrom === dateTo) {
        if (endTime === '00:00') return 'Blocks cannot span midnight — please split into two separate blocks.';
        if (endTime <= startTime) return 'End time must be after start time.';
      }
      const nowSGT = new Date().toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false,
      });
      if (!isEdit && dateFrom === todayStr) {
        if (startTime <= nowSGT) return 'Start time has already passed — please select a future time.';
      }
      if (isEdit) {
        // The block's end (date + time) must be in the future, otherwise saving
        // makes it expire immediately and the row disappears from the active list.
        if (dateTo < todayStr) return 'End date cannot be in the past.';
        if (dateTo === todayStr && endTime <= nowSGT) {
          return 'End time has already passed — please select a future time.';
        }
      }
      return null;
    }

    window.mgmtRemoveBlock = (ref) => {
      const overlay    = document.getElementById('removeBlockOverlay');
      const confirmBtn = document.getElementById('removeBlockConfirmBtn');
      const cancelBtn  = document.getElementById('removeBlockCancelBtn');

      overlay.style.display = 'flex';

      const close = () => { overlay.style.display = 'none'; };
      cancelBtn.onclick = close;

      confirmBtn.onclick = async () => {
        close();
        const res  = await apiFetch(`${API_BASE}/api/management/blocks/${encodeURIComponent(ref)}`, {
          method: 'DELETE',
        });
        const data = await res.json();
        notify(data.message, !data.success);
        if (data.success) loadBlocks();
      };
    };

    // ── Edit block ──────────────────────────────────────────────────
    // Track the original start date so validation can allow an active block to
    // keep its past start, while still blocking further backward edits.
    let editBlockOriginalDateFrom = null;

    window.mgmtEditBlock = (ref, facility, dateFrom, dateTo, start, end, reason) => {
      document.getElementById('editBlockRef').value      = ref;
      document.getElementById('editBlockFacility').value = facility;

      const fromInput = document.getElementById('editBlockDateFrom');
      const toInput   = document.getElementById('editBlockDateTo');

      editBlockOriginalDateFrom = dateFrom || null;

      // Date From floor: today, unless the block already started in the past
      // (active block) — then floor at its original start so it can be displayed
      // and saved, but cannot be pushed further back.
      const fromFloor = (dateFrom && dateFrom < todayStr) ? dateFrom : todayStr;
      fromInput.min = fromFloor; fromInput.max = maxStr;
      // Date To floor is always today — the block must not end in the past.
      toInput.min = todayStr;    toInput.max = maxStr;

      fromInput.value = dateFrom;
      toInput.value   = dateTo;

      document.getElementById('editBlockStart').value  = start;
      document.getElementById('editBlockEnd').value    = end;
      document.getElementById('editBlockReason').value = reason;
      document.getElementById('editBlockOverlay').style.display = 'flex';
    };

    // Keep edit-modal Date To >= Date From whenever Date From changes
    {
      const efFrom = document.getElementById('editBlockDateFrom');
      const efTo   = document.getElementById('editBlockDateTo');
      if (efFrom && efTo) {
        efFrom.addEventListener('change', () => {
          const floor = (efFrom.value && efFrom.value > todayStr) ? efFrom.value : todayStr;
          efTo.min = floor;
          if (efTo.value && efTo.value < floor) efTo.value = floor;
        });
      }
    }

    document.getElementById('editBlockCloseBtn').addEventListener('click', () => {
      document.getElementById('editBlockOverlay').style.display = 'none';
    });

    document.getElementById('editBlockOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
    });

    document.getElementById('editBlockForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ref      = document.getElementById('editBlockRef').value;
      const facility = document.getElementById('editBlockFacility').value;
      const dateFrom = document.getElementById('editBlockDateFrom').value;
      const dateTo   = document.getElementById('editBlockDateTo').value;
      const startTime = document.getElementById('editBlockStart').value;
      const endTime   = document.getElementById('editBlockEnd').value;
      const reason    = document.getElementById('editBlockReason').value;

      const editErr = validateBlock(dateFrom, dateTo, startTime, endTime, true, editBlockOriginalDateFrom);
      if (editErr) { notify(editErr, true); return; }

      try {
        const res  = await apiFetch(`${API_BASE}/api/management/blocks/${encodeURIComponent(ref)}`, {
          method: 'PUT',
          body: JSON.stringify({ facility, dateFrom, dateTo, startTime, endTime, reason }),
        });
        if (!res.ok) { notify(`Server error (${res.status}) — please try again.`, true); return; }
        const data = await res.json();
        notify(data.message, !data.success);
        if (data.success) {
          document.getElementById('editBlockOverlay').style.display = 'none';
          loadBlocks();
        }
      } catch {
        notify('Failed to save changes — please try again.', true);
      }
    });

    blockForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const facility  = document.getElementById('mgmtBlockFacility').value;
      const dateFrom  = document.getElementById('mgmtBlockDateFrom').value;
      const dateTo    = document.getElementById('mgmtBlockDateTo').value;
      const startTime = document.getElementById('mgmtBlockStart').value;
      const endTime   = document.getElementById('mgmtBlockEnd').value;
      const reason    = document.getElementById('mgmtBlockReason').value;

      const createErr = validateBlock(dateFrom, dateTo, startTime, endTime);
      if (createErr) { notify(createErr, true); return; }

      const res  = await apiFetch(`${API_BASE}/api/management/blocks`, {
        method: 'POST',
        body: JSON.stringify({ facility, dateFrom, dateTo, startTime, endTime, reason }),
      });
      const data = await res.json();
      notify(data.message, !data.success);
      if (data.success) {
        blockForm.reset();
        loadBlocks();
      }
    });

    // Block start/end are stored as SGT walltime strings (e.g. "2026-05-25" +
    // "21:08"). We treat them — and "now" — as if they were UTC so the diff
    // math is consistent regardless of the browser's local timezone.
    function blockMs(date, time) {
      if (!date || !time) return NaN;
      return new Date(`${date}T${time}:00Z`).getTime();
    }
    function nowSgtMs() {
      // sv-SE gives "YYYY-MM-DD HH:MM:SS" — easy to coerce to an ISO-Z string.
      const sgt = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Singapore' });
      return new Date(sgt.replace(' ', 'T') + 'Z').getTime();
    }

    // Live duration:
    //   • Upcoming block  → full (end − start)
    //   • Ongoing block   → remaining (end − now), decrements minute by minute
    //   • Ended block     → 0 (cell shows "—")
    // Handles same-day, multi-day daytime, and overnight multi-day ranges
    // uniformly. The previous per-day subtraction went negative for overnight
    // blocks and showed "—".
    function computeBlockMinutes(dateFrom, dateTo, startTime, endTime) {
      const startMs = blockMs(dateFrom, startTime);
      const endMs   = blockMs(dateTo || dateFrom, endTime);
      if (isNaN(startMs) || isNaN(endMs)) return 0;
      const effectiveStart = Math.max(startMs, nowSgtMs());
      const mins = Math.round((endMs - effectiveStart) / 60000);
      return mins > 0 ? mins : 0;
    }

    function formatMinutes(mins) {
      if (!mins || mins <= 0) return '—';
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      if (h === 0) return `${m}m`;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }

    // Walk every duration cell and rewrite its text from the block's start/end
    // ISO attributes against the current SGT time. Fires every 60s — no API
    // call, no row rebuild, no flicker.
    function tickBlockDurations() {
      const now = nowSgtMs();
      document.querySelectorAll('#mgmtBlocksBody .block-duration[data-end]').forEach(el => {
        const startMs = new Date(el.dataset.start || '').getTime();
        const endMs   = new Date(el.dataset.end   || '').getTime();
        if (isNaN(startMs) || isNaN(endMs)) return;
        const eff  = Math.max(startMs, now);
        const mins = Math.round((endMs - eff) / 60000);
        el.textContent = mins > 0 ? formatMinutes(mins) : '—';
        const ongoing = now >= startMs && now < endMs;
        el.classList.toggle('block-duration--live', ongoing);
        el.title = ongoing ? 'Ongoing — time remaining until block ends' : '';
      });
    }
    if (!window.__mgmtBlocksTick) {
      window.__mgmtBlocksTick = setInterval(tickBlockDurations, 60000);
    }

    async function loadBlocks() {
      tbody.innerHTML = '<tr class="table-empty"><td colspan="9">Loading…</td></tr>';
      try {
        const res  = await apiFetch(`${API_BASE}/api/management/blocks`);
        const data = await res.json();
        const rows = data.blocks || [];

        if (!rows.length) {
          tbody.innerHTML = '<tr class="table-empty"><td colspan="9">No active blocks.</td></tr>';
          return;
        }

        tbody.innerHTML = rows.map(b => {
          const slotDate   = (b.slot_date    || b.dateFrom  || '').substring(0, 10);
          const slotDateTo = (b.slot_date_to || b.dateTo    || '').substring(0, 10);
          const blockStart = b.slot_start_time || b.startTime || '';
          const blockEnd   = b.slot_end_time   || b.endTime   || '';

          const effDateTo = slotDateTo || slotDate;
          const startIso  = (slotDate  && blockStart) ? `${slotDate}T${blockStart}:00Z` : '';
          const endIso    = (effDateTo && blockEnd)   ? `${effDateTo}T${blockEnd}:00Z`  : '';

          const mins = computeBlockMinutes(slotDate, effDateTo, blockStart, blockEnd);
          const duration = formatMinutes(mins);
          const isOngoing = startIso && endIso && (() => {
            const now = nowSgtMs();
            const s = new Date(startIso).getTime();
            const e = new Date(endIso).getTime();
            return now >= s && now < e;
          })();

          const dateFrom = slotDate    || '—';
          const dateTo   = slotDateTo || slotDate || '—';
          const reason   = (b.notes || b.name?.replace('BLOCK: ', '') || '').replace(/'/g, "\\'");

          return `
          <tr>
            <td>${b.facility_or_venue || '—'}</td>
            <td>${dateFrom}</td>
            <td>${dateTo}</td>
            <td>${blockStart || '—'}</td>
            <td>${blockEnd || '—'}</td>
            <td><span class="block-duration${isOngoing ? ' block-duration--live' : ''}" data-start="${startIso}" data-end="${endIso}"${isOngoing ? ' title="Ongoing — time remaining until block ends"' : ''}>${duration}</span></td>
            <td>${b.notes || b.name?.replace('BLOCK: ', '') || '—'}</td>
            <td>${b.membership_number === 'MGMT' ? 'Management' : b.membership_number === 'STAFF' ? 'Staff' : b.membership_number}</td>
            <td>
              <button class="btn-sm btn-secondary" onclick="mgmtEditBlock('${b.booking_reference}','${(b.facility_or_venue || '').replace(/'/g,"\\'")}','${slotDate}','${slotDateTo || slotDate || ''}','${blockStart}','${blockEnd}','${reason}')">Edit</button>
              <button class="btn-sm btn-secondary" style="color:#c96a5e" onclick="mgmtRemoveBlock('${b.booking_reference}')">Remove</button>
            </td>
          </tr>`;
        }).join('');
      } catch {
        tbody.innerHTML = '<tr class="table-empty"><td colspan="9">Failed to load.</td></tr>';
      }
    }

    loadBlocks();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 5.8  ADD EVENT  (management-events.html)
  // ════════════════════════════════════════════════════════════════════════════
  if (document.getElementById('addEventForm')) {
    const eventForm     = document.getElementById('addEventForm');
    const eventsListEl  = document.getElementById('eventsListContainer');
    const imageInput    = document.getElementById('eventImage');
    const imagePreview  = document.getElementById('eventImagePreview');
    const pdfInput      = document.getElementById('eventPdf');
    const pdfNameEl     = document.getElementById('eventPdfName');
    const submitBtn     = document.getElementById('submitEventBtn');

    let imageBase64 = '';
    let pdfBase64   = '';
    let pdfFilename = '';

    // Restrict event date to today or later (SGT)
    const todayEventStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    document.getElementById('eventDate').min = todayEventStr;

    // Image preview
    imageInput.addEventListener('change', () => {
      const file = imageInput.files[0];
      if (!file) { imagePreview.style.display = 'none'; imageBase64 = ''; return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        imageBase64 = e.target.result;
        imagePreview.src = imageBase64;
        imagePreview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    });

    // PDF filename display
    pdfInput.addEventListener('change', () => {
      const file = pdfInput.files[0];
      if (!file) { pdfNameEl.style.display = 'none'; pdfBase64 = ''; pdfFilename = ''; return; }
      if (file.size > 10 * 1024 * 1024) { notify('PDF must be 10 MB or smaller.', true); pdfInput.value = ''; pdfNameEl.style.display = 'none'; pdfBase64 = ''; pdfFilename = ''; return; }
      pdfFilename = file.name;
      pdfNameEl.textContent = file.name;
      pdfNameEl.style.display = 'block';
      const reader = new FileReader();
      reader.onload = (e) => { pdfBase64 = e.target.result; };
      reader.readAsDataURL(file);
    });

    // Submit event
    eventForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const event_name        = document.getElementById('eventName').value.trim();
      const event_description = document.getElementById('eventDescription').value.trim();
      const event_venue       = document.getElementById('eventVenue').value.trim();
      const event_date        = document.getElementById('eventDate').value;
      const event_duration    = document.getElementById('eventDuration').value.trim();

      if (!event_name || !event_description || !event_venue || !event_date || !event_duration) {
        notify('All required fields must be filled.', true);
        return;
      }
      if (event_date < new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })) {
        notify('Event date cannot be in the past.', true);
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';

      try {
        const res = await apiFetch(`${API_BASE}/api/events/management`, {
          method: 'POST',
          body: JSON.stringify({
            event_name,
            event_description,
            event_venue,
            event_date,
            event_duration,
            image: imageBase64,
            pdf: pdfBase64,
            pdf_filename: pdfFilename,
          }),
        });
        const data = await res.json();
        notify(data.message, !data.success);
        if (data.success) {
          eventForm.reset();
          imagePreview.style.display = 'none';
          pdfNameEl.style.display = 'none';
          imageBase64 = '';
          pdfBase64 = '';
          pdfFilename = '';
          loadEvents();
        }
      } catch {
        notify('Failed to create event.', true);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Event';
      }
    });

    // ── Modals ──────────────────────────────────────────────────────────────
    const viewModal   = document.getElementById('viewEventModal');
    const editModal   = document.getElementById('editEventModal');
    const deleteModal = document.getElementById('deleteEventModal');

    // ── Edit modal: image & PDF preview ──────────────────────────────────────
    const editImageInput   = document.getElementById('editEventImage');
    const editImagePreview = document.getElementById('editEventImagePreview');
    const editPdfInput     = document.getElementById('editEventPdf');
    const editPdfNameEl    = document.getElementById('editEventPdfName');
    let editImageBase64 = '';
    let editPdfBase64   = '';
    let editPdfFilename = '';

    editImageInput.addEventListener('change', () => {
      const file = editImageInput.files[0];
      if (!file) { editImagePreview.style.display = 'none'; editImageBase64 = ''; return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        editImageBase64 = e.target.result;
        editImagePreview.src = editImageBase64;
        editImagePreview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    });

    editPdfInput.addEventListener('change', () => {
      const file = editPdfInput.files[0];
      if (!file) { editPdfNameEl.style.display = 'none'; editPdfBase64 = ''; editPdfFilename = ''; return; }
      if (file.size > 10 * 1024 * 1024) { notify('PDF must be 10 MB or smaller.', true); editPdfInput.value = ''; editPdfNameEl.style.display = 'none'; editPdfBase64 = ''; editPdfFilename = ''; return; }
      editPdfFilename = file.name;
      editPdfNameEl.textContent = file.name;
      editPdfNameEl.style.display = 'block';
      const reader = new FileReader();
      reader.onload = (e) => { editPdfBase64 = e.target.result; };
      reader.readAsDataURL(file);
    });

    // ── Helper ───────────────────────────────────────────────────────────────
    function escH(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    // ── View event ───────────────────────────────────────────────────────────
    window.mgmtViewEvent = async (id) => {
      try {
        const res  = await apiFetch(`${API_BASE}/api/events/management/${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!data.success) { notify(data.message || 'Event not found.', true); return; }
        const ev = data.event;

        document.getElementById('viewEventTitle').textContent    = ev.event_name;
        document.getElementById('viewEventVenue').textContent    = ev.event_venue || '—';
        document.getElementById('viewEventDate').textContent     = ev.event_date || '—';
        document.getElementById('viewEventDuration').textContent = ev.event_duration || '—';
        document.getElementById('viewEventStatus').textContent   = ev.status || '—';
        document.getElementById('viewEventCreatedBy').textContent = ev.created_by || '—';
        document.getElementById('viewEventDesc').textContent     = ev.event_description || '';

        const imgEl = document.getElementById('viewEventImg');
        if (ev.image_url && ev.image_url.startsWith('data:')) {
          imgEl.src = ev.image_url; imgEl.style.display = 'block';
        } else { imgEl.style.display = 'none'; }

        const pdfRow  = document.getElementById('viewEventPdfRow');
        const pdfLink = document.getElementById('viewEventPdfLink');
        if (ev.pdf_url && ev.pdf_url.startsWith('data:')) {
          pdfLink.href = ev.pdf_url;
          pdfLink.download = ev.pdf_filename || 'event.pdf';
          pdfLink.textContent = ev.pdf_filename || 'Download PDF';
          pdfRow.style.display = '';
        } else { pdfRow.style.display = 'none'; }

        openModal(viewModal);
      } catch { notify('Failed to load event details.', true); }
    };

    // ── Open edit modal ──────────────────────────────────────────────────────
    window.mgmtEditEvent = async (id) => {
      try {
        const res  = await apiFetch(`${API_BASE}/api/events/management/${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!data.success) { notify(data.message || 'Event not found.', true); return; }
        const ev = data.event;

        document.getElementById('editEventId').value            = ev._id;
        document.getElementById('editEventName').value          = ev.event_name;
        document.getElementById('editEventDescription').value   = ev.event_description;
        document.getElementById('editEventVenue').value         = ev.event_venue || '';
        document.getElementById('editEventDate').min            = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
        document.getElementById('editEventDate').value          = ev.event_date;
        document.getElementById('editEventDurationInput').value = ev.event_duration;

        // Show existing image preview
        editImageBase64 = '';
        editImageInput.value = '';
        if (ev.image_url && ev.image_url.startsWith('data:')) {
          editImagePreview.src = ev.image_url;
          editImagePreview.style.display = 'block';
        } else { editImagePreview.style.display = 'none'; }

        // Show existing PDF name
        editPdfBase64   = '';
        editPdfFilename = '';
        editPdfInput.value = '';
        if (ev.pdf_filename) {
          editPdfNameEl.textContent = ev.pdf_filename;
          editPdfNameEl.style.display = 'block';
        } else { editPdfNameEl.style.display = 'none'; }

        openModal(editModal);
      } catch { notify('Failed to load event for editing.', true); }
    };

    // ── Submit edit form ─────────────────────────────────────────────────────
    const editForm      = document.getElementById('editEventForm');
    const editSubmitBtn = document.getElementById('editEventSubmitBtn');

    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('editEventId').value;
      const body = {
        event_name:        document.getElementById('editEventName').value.trim(),
        event_description: document.getElementById('editEventDescription').value.trim(),
        event_venue:       document.getElementById('editEventVenue').value.trim(),
        event_date:        document.getElementById('editEventDate').value,
        event_duration:    document.getElementById('editEventDurationInput').value.trim(),
      };
      if (body.event_date < new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })) {
        notify('Event date cannot be in the past.', true);
        return;
      }
      if (editImageBase64) body.image = editImageBase64;
      if (editPdfBase64)   { body.pdf = editPdfBase64; body.pdf_filename = editPdfFilename; }

      editSubmitBtn.disabled = true;
      editSubmitBtn.textContent = 'Saving...';
      try {
        const res  = await apiFetch(`${API_BASE}/api/events/management/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        const data = await res.json();
        notify(data.message, !data.success);
        if (data.success) { closeModal(editModal); loadEvents(); }
      } catch { notify('Failed to update event.', true); }
      finally {
        editSubmitBtn.disabled = false;
        editSubmitBtn.textContent = 'Save Changes';
      }
    });

    // ── Open delete confirmation ─────────────────────────────────────────────
    window.mgmtDeleteEvent = (id, name) => {
      document.getElementById('deleteEventId').value = id;
      document.getElementById('deleteEventName').textContent = name || 'Untitled Event';
      openModal(deleteModal);
    };

    // ── Confirm delete ───────────────────────────────────────────────────────
    const deleteConfirmBtn = document.getElementById('deleteEventConfirmBtn');
    deleteConfirmBtn.addEventListener('click', async () => {
      const id = document.getElementById('deleteEventId').value;
      deleteConfirmBtn.disabled = true;
      deleteConfirmBtn.textContent = 'Deleting...';
      try {
        const res  = await apiFetch(`${API_BASE}/api/events/management/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        const data = await res.json();
        notify(data.message, !data.success);
        if (data.success) { closeModal(deleteModal); loadEvents(); }
      } catch { notify('Failed to delete event.', true); }
      finally {
        deleteConfirmBtn.disabled = false;
        deleteConfirmBtn.textContent = 'Delete Permanently';
      }
    });

    // ── Load & render events list ────────────────────────────────────────────
    async function loadEvents() {
      eventsListEl.innerHTML = '<p class="no-events-msg">Loading...</p>';
      try {
        const res  = await apiFetch(`${API_BASE}/api/events/management`);
        const data = await res.json();
        const events = data.events || [];

        if (!events.length) {
          eventsListEl.innerHTML = '<p class="no-events-msg">No events published yet.</p>';
          return;
        }

        eventsListEl.innerHTML = events.map(ev => {
          const dateDisplay = ev.event_date || '—';
          const hasImg = ev.image_url && ev.image_url.startsWith('data:');
          const hasPdf = ev.pdf_url && ev.pdf_url.startsWith('data:');
          const statusBadge = ev.status === 'active'
            ? '<span class="badge-img">Active</span>'
            : '<span class="badge-pdf">Archived</span>';

          return `
          <div class="event-card-preview">
            ${hasImg ? `<img src="${ev.image_url}" alt="${escH(ev.event_name)}" />` : ''}
            <div class="event-card-preview__info">
              <div class="event-card-preview__title">${escH(ev.event_name)} ${statusBadge}</div>
              <div class="event-card-preview__meta">${escH(ev.event_venue || '')}${ev.event_venue ? ' &middot; ' : ''}${escH(dateDisplay)} &middot; ${escH(ev.event_duration || '')}</div>
              <div class="event-card-preview__desc">${escH(ev.event_description)}</div>
              <div class="event-card-preview__actions">
                ${hasPdf ? '<span class="badge-pdf">PDF</span>' : ''}
                <button class="btn-row" onclick="mgmtViewEvent('${ev._id}')">View</button>
                <button class="btn-row" onclick="mgmtEditEvent('${ev._id}')">Edit</button>
                <button class="btn-row btn-row--red" onclick="mgmtDeleteEvent('${ev._id}','${escH(ev.event_name).replace(/'/g,"\\&#39;")}')">Delete</button>
              </div>
            </div>
          </div>`;
        }).join('');
      } catch {
        eventsListEl.innerHTML = '<p class="no-events-msg">Failed to load events.</p>';
      }
    }

    loadEvents();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 5.9  INBOX  (management-inbox.html)
  // ════════════════════════════════════════════════════════════════════════════
  if (document.getElementById('inboxContainer')) {
    const inboxContainer = document.getElementById('inboxContainer');

    // Mark inbox as read — clears the nav badge
    localStorage.setItem('mgmtInboxLastRead', Date.now().toString());
    loadInboxBadge();

    function escInbox(str) {
      return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    async function loadInbox() {
      inboxContainer.innerHTML = '<p class="inbox-empty">Loading...</p>';
      try {
        const res  = await apiFetch(`${API_BASE}/api/events/inbox`);
        const data = await res.json();
        if (!data.success || !data.threads || !data.threads.length) {
          inboxContainer.innerHTML = '<p class="inbox-empty">No member messages yet.</p>';
          return;
        }

        inboxContainer.innerHTML = data.threads.map((t, idx) => {
          const n = t.notification || {};
          const title = n.title || 'Notice';
          const noticeMsg = n.message || '';
          const replyCount = t.replies ? t.replies.length : 0;
          const latestDate = t.latest_at ? new Date(t.latest_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

          const messagesHtml = (t.replies || []).map(r => {
            const isMgmt = r.sender_type === 'management';
            const avatar = (r.sender_name || 'M').charAt(0).toUpperCase();
            const timeStr = new Date(r.createdAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            return `<div class="inbox-msg ${isMgmt ? 'inbox-msg--mgmt' : ''}">
              <div class="inbox-msg__avatar">${escInbox(avatar)}</div>
              <div class="inbox-msg__bubble">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span class="inbox-msg__name">${escInbox(r.sender_name)}${isMgmt ? ' <em>(Management)</em>' : ''}</span>
                  <span class="inbox-msg__time">${timeStr}</span>
                </div>
                <p class="inbox-msg__text">${escInbox(r.message)}</p>
              </div>
            </div>`;
          }).join('');

          return `<div class="inbox-thread" id="inbox-thread-${idx}">
            <div class="inbox-thread__head" data-idx="${idx}">
              <div>
                <div class="inbox-thread__title">${escInbox(title)}</div>
                <div class="inbox-thread__meta">Latest: ${latestDate}</div>
              </div>
              <div style="display:flex;align-items:center;gap:12px;">
                <span class="inbox-thread__badge">${replyCount} message${replyCount !== 1 ? 's' : ''}</span>
                <span class="inbox-thread__chevron">&#9662;</span>
              </div>
            </div>
            <div class="inbox-thread__body" id="inbox-body-${idx}">
              <div class="inbox-notice"><strong>Original Notice:</strong> ${escInbox(noticeMsg)}</div>
              <div class="inbox-messages" id="inbox-messages-${idx}">${messagesHtml}</div>
              <form class="inbox-reply-form" data-nid="${n._id || ''}" data-idx="${idx}">
                <input class="inbox-reply-input" type="text" placeholder="Reply to this thread..." required />
                <button class="inbox-reply-btn" type="submit">Send</button>
              </form>
            </div>
          </div>`;
        }).join('');

        // Wire up expand/collapse
        inboxContainer.querySelectorAll('.inbox-thread__head').forEach(head => {
          head.addEventListener('click', () => {
            const idx = head.dataset.idx;
            const body = document.getElementById('inbox-body-' + idx);
            const isOpen = body.classList.contains('is-open');
            body.classList.toggle('is-open', !isOpen);
            head.classList.toggle('is-open', !isOpen);
          });
        });

        // Wire up reply forms
        inboxContainer.querySelectorAll('.inbox-reply-form').forEach(form => {
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nid = form.dataset.nid;
            const idx = form.dataset.idx;
            const input = form.querySelector('.inbox-reply-input');
            const msg = input.value.trim();
            if (!msg || !nid) return;

            try {
              const res = await apiFetch(`${API_BASE}/api/events/inbox/${encodeURIComponent(nid)}/reply`, {
                method: 'POST',
                body: JSON.stringify({ message: msg }),
              });
              const data = await res.json();
              if (data.success) {
                input.value = '';
                // Append the new message to the thread
                const messagesEl = document.getElementById('inbox-messages-' + idx);
                const mgmtName = document.getElementById('staffName')?.textContent || 'Management';
                const avatar = mgmtName.charAt(0).toUpperCase();
                const timeStr = new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                messagesEl.innerHTML += `<div class="inbox-msg inbox-msg--mgmt">
                  <div class="inbox-msg__avatar">${escInbox(avatar)}</div>
                  <div class="inbox-msg__bubble">
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span class="inbox-msg__name">${escInbox(mgmtName)} <em>(Management)</em></span>
                      <span class="inbox-msg__time">${timeStr}</span>
                    </div>
                    <p class="inbox-msg__text">${escInbox(msg)}</p>
                  </div>
                </div>`;
                messagesEl.scrollTop = messagesEl.scrollHeight;
                loadInboxBadge();
              } else {
                notify(data.message || 'Failed to send reply.', true);
              }
            } catch (_) {
              notify('Failed to send reply.', true);
            }
          });
        });

      } catch {
        inboxContainer.innerHTML = '<p class="inbox-empty">Failed to load inbox.</p>';
      }
    }

    loadInbox();
  }

})();
