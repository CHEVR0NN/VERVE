(function () {
  const API_BASE = 'https://backend-production-41dc3.up.railway.app';

  // ── Inline notification bar ────────────────────────────────────────────────
  let _notifyTimer = null;
  function notify(message, isError) {
    let el = document.getElementById('staff-notify');
    if (!el) {
      el = document.createElement('div');
      el.id = 'staff-notify';
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

  // ── Auth guard ──────────────────────────────────────────────────────────────
  const token = sessionStorage.getItem('staffToken');
  const staff = JSON.parse(sessionStorage.getItem('staffUser') || 'null');

  if (!token || !staff) {
    window.location.href = 'staff-login.html';
    return;
  }

  // ── Sidebar user info ───────────────────────────────────────────────────────
  const nameEl = document.getElementById('staffName');
  const roleEl = document.getElementById('staffRole');
  if (nameEl) nameEl.textContent = staff.displayName || staff.username;
  if (roleEl) roleEl.textContent = staff.role;

  // ── Logout ──────────────────────────────────────────────────────────────────
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      sessionStorage.removeItem('staffToken');
      sessionStorage.removeItem('staffUser');
      window.location.href = 'staff-login.html';
    });
  }

  // ── Authenticated fetch helper ──────────────────────────────────────────────
  const apiFetch = (url, opts = {}) =>
    fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });

  // ── Calendar IDs by venue ───────────────────────────────────────────────────
  const CALENDAR_MAP = {
    'Tennis':          'PBybXIrnK5Y5Z8QYj0Re',
    'Squash':          'iOHOpI35vxyABNK2NDKK',
    'Gym':             'j1jv7fk0AnlrfAeSCgQ5',
    'Barkerslounge':   'SrFhhBpGuhprk6nVuND5',
    "Barker's Lounge": 'SrFhhBpGuhprk6nVuND5',
    'Oasis':           'LGzqWrWZ0Ia6DYsOQ3wZ',
  };

  const LE_MANSION_CALENDARS = {
    'Lunch':  'hPNlJNlQtHcOBLQdMhmq',
    'Dinner': 'Xppv7hBSv8VikwOygLYp',
  };

  const page = document.title;

  // ════════════════════════════════════════════════════════════════════════════
  // TODAY'S SCHEDULE  (staff.html)
  // ════════════════════════════════════════════════════════════════════════════
  if (document.getElementById('scheduleBody')) {
    const dateEl      = document.getElementById('scheduleDate');
    const refreshBtn  = document.getElementById('refreshScheduleBtn');
    const lastRefEl   = document.getElementById('lastRefreshed');
    const tbody       = document.getElementById('scheduleBody');
    const filterType  = document.getElementById('filterType');
    const filterVenue = document.getElementById('filterVenue');

    let allBookings = [];

    const today = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Singapore', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (dateEl) dateEl.textContent = today;

    function renderSchedule() {
      const type  = filterType.value;
      const venue = filterVenue.value;
      let rows = allBookings.filter((b) => {
        if (type  && b.booking_type      !== type)  return false;
        if (venue && b.facility_or_venue !== venue) return false;
        return true;
      });

      if (!rows.length) {
        tbody.innerHTML = '<tr class="table-empty"><td colspan="8">No bookings today.</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map((b) => `
        <tr>
          <td>${b.slot_start_time || '—'}</td>
          <td>${b.name || '—'}</td>
          <td>${b.membership_number}</td>
          <td>${b.facility_or_venue || '—'}</td>
          <td>${b.outlet_pax || '—'}</td>
          <td>${b.booking_type || '—'}</td>
          <td><span class="status-badge status--${(b.booking_status || '').toLowerCase().replace(/\s/g,'-')}">${b.booking_status || '—'}</span></td>
          <td>
            ${b.booking_status === 'Confirmed' ? `<button class="btn-sm btn-primary" onclick="checkIn('${b.booking_reference}')">Check In</button>` : ''}
          </td>
        </tr>`).join('');
    }

    window.checkIn = async (booking_reference) => {
      const res  = await apiFetch(`${API_BASE}/api/checkin`, {
        method: 'POST',
        body: JSON.stringify({ booking_reference, checked_in_by: staff.username }),
      });
      const data = await res.json();
      notify(data.message, !data.success);
      if (data.success) loadSchedule();
    };

    async function loadSchedule() {
      tbody.innerHTML = '<tr class="table-empty"><td colspan="8">Loading…</td></tr>';
      try {
        const res  = await apiFetch(`${API_BASE}/api/staff/schedule`);
        const data = await res.json();
        allBookings = data.bookings || [];
        renderSchedule();
        if (lastRefEl) lastRefEl.textContent = `Last refreshed: ${new Date().toLocaleTimeString()}`;
      } catch {
        tbody.innerHTML = '<tr class="table-empty"><td colspan="8">Failed to load schedule.</td></tr>';
      }
    }

    filterType.addEventListener('change', renderSchedule);
    filterVenue.addEventListener('change', renderSchedule);
    refreshBtn.addEventListener('click', loadSchedule);
    loadSchedule();
    setInterval(loadSchedule, 60000);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LOG WALK-IN  (staff-walkin.html)
  // ════════════════════════════════════════════════════════════════════════════
  if (document.getElementById('walkinForm')) {
    const walkinForm  = document.getElementById('walkinForm');
    const typeSelect  = document.getElementById('walkinType');
    const venueSelect = document.getElementById('walkinVenue');
    const shiftField  = document.getElementById('walkinShiftField');

    const DINING_VENUES   = ['Le Mansion', 'Barkerslounge', 'Oasis'];
    const FACILITY_VENUES = ['Gym', 'Tennis', 'Squash'];
    const SHIFT_VENUES    = ['Le Mansion'];

    function populateVenues(type) {
      const options = type === 'dining' ? DINING_VENUES : type === 'facility' ? FACILITY_VENUES : [];
      venueSelect.innerHTML = options.length
        ? '<option value="">Select venue</option>' + options.map(v => `<option value="${v}">${v}</option>`).join('')
        : '<option value="">Select type first</option>';
    }

    typeSelect.addEventListener('change', () => {
      populateVenues(typeSelect.value);
      shiftField.hidden = true;
    });

    venueSelect.addEventListener('change', () => {
      shiftField.hidden = !SHIFT_VENUES.includes(venueSelect.value);
    });

    shiftField.hidden = true;

    walkinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name     = document.getElementById('walkinName').value.trim();
      const phone    = document.getElementById('walkinPhone').value.trim();
      const facility = venueSelect.value;
      const pax      = document.getElementById('walkinPax').value;
      const shift    = document.getElementById('walkinShift').value;
      const type     = typeSelect.value;

      if (!name) {
        notify('Please enter the visitor name.', true);
        return;
      }

      const res  = await apiFetch(`${API_BASE}/api/walkin`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          phone:    phone || '',
          facility: `${facility}${shift && SHIFT_VENUES.includes(facility) ? ' (' + shift + ')' : ''}`,
          pax,
          staff_id: staff.username,
        }),
      });
      const data = await res.json();
      notify(data.success ? `Walk-in logged for ${name} at ${facility} (${pax} pax).` : data.message, !data.success);
      if (data.success) walkinForm.reset();
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // QR VERIFY  (staff-qr.html)
  // ════════════════════════════════════════════════════════════════════════════
  if (document.getElementById('qrReader')) {
    const qrResult   = document.getElementById('qrResult');
    const qrBadge    = document.getElementById('qrBadge');
    const qrName     = document.getElementById('qrName');
    const qrMeta     = document.getElementById('qrMeta');
    const qrStatus   = document.getElementById('qrStatus');
    const startBtn   = document.getElementById('startScanBtn');
    const stopBtn    = document.getElementById('stopScanBtn');
    const manualBtn  = document.getElementById('qrManualBtn');
    const qrInput    = document.getElementById('qrInput');

    const REJECTION_MESSAGES = {
      ALREADY_CHECKED_IN: 'This member has already checked in.',
      INVALID_STATUS:     'Booking is cancelled or not valid for check-in.',
      WRONG_DATE:         'This QR code is for a different date.',
      INVALID_REFERENCE:  'Booking reference not found.',
    };

    let scanner = null;
    let scanning = false;

    function showResult(valid, contact, message, reason) {
      qrResult.hidden = false;
      qrBadge.className = 'qr-result__badge';
      qrBadge.removeAttribute('style');

      if (valid) {
        qrBadge.classList.add('qr-result__badge--valid');
        qrBadge.textContent  = '✓';
        qrName.textContent   = contact?.name || '—';
        qrMeta.textContent   = `${contact?.facility_or_venue || '—'} · ${contact?.slot_date || '—'}`;
        qrStatus.textContent = 'Check-in successful.';
        qrStatus.style.color = '#c25972';
      } else {
        qrBadge.classList.add('qr-result__badge--invalid');
        qrBadge.textContent  = '✗';
        qrName.textContent   = 'Not Valid';
        qrMeta.textContent   = '—';
        qrStatus.textContent = REJECTION_MESSAGES[reason] || message || 'Verification failed.';
        qrStatus.style.color = '#c96a5e';
      }
    }

    async function verifyQR(value) {
      const ref = value.trim();
      if (!ref) return;

      qrResult.hidden = false;
      qrBadge.className    = 'qr-result__badge';
      qrBadge.removeAttribute('style');
      qrBadge.textContent  = '…';
      qrName.textContent   = '—';
      qrMeta.textContent   = '—';
      qrStatus.textContent = 'Verifying…';
      qrStatus.style.color = '';

      try {
        const res  = await apiFetch(`${API_BASE}/api/checkin`, {
          method: 'POST',
          body:   JSON.stringify({ booking_reference: ref, checked_in_by: staff.username }),
        });
        const data = await res.json();
        showResult(data.valid, data.contact, data.message, data.reason);
      } catch {
        showResult(false, null, 'Connection error. Please try again.', null);
      }
    }

    // ── Camera scanner ──────────────────────────────────────────────────────
    startBtn.addEventListener('click', async () => {
      if (scanning) return;

      if (!window.Html5Qrcode) {
        notify('QR scanner library not loaded. Please refresh the page.', true);
        return;
      }

      scanner  = new Html5Qrcode('qrReader');
      scanning = true;
      startBtn.disabled = true;
      stopBtn.disabled  = false;
      qrResult.hidden   = true;

      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText) => {
            await scanner.stop();
            scanning = false;
            startBtn.disabled = false;
            stopBtn.disabled  = true;
            await verifyQR(decodedText);
          },
          () => {} // scan errors are normal (frame not yet in focus)
        );
      } catch (err) {
        scanning = false;
        startBtn.disabled = false;
        stopBtn.disabled  = true;
        notify('Camera access denied or unavailable. Use manual entry below.', true);
      }
    });

    stopBtn.addEventListener('click', async () => {
      if (scanner && scanning) {
        await scanner.stop();
        scanning = false;
        startBtn.disabled = false;
        stopBtn.disabled  = true;
      }
    });

    // ── Manual entry ────────────────────────────────────────────────────────
    manualBtn.addEventListener('click', () => verifyQR(qrInput.value));
    qrInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') verifyQR(qrInput.value);
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // F&B BOOKINGS  (staff-fnb.html)
  // ════════════════════════════════════════════════════════════════════════════
  if (document.getElementById('fnbBody')) {
    const tbody       = document.getElementById('fnbBody');
    const dateEl      = document.getElementById('fnbDate');
    const refreshBtn  = document.getElementById('refreshFnbBtn');
    const filterVenue = document.getElementById('filterFnbVenue');

    let allFnb = [];

    const today = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Singapore', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (dateEl) dateEl.textContent = today;

    function renderFnb() {
      const venue = filterVenue.value;
      let rows = allFnb.filter((b) => {
        if (venue && b.facility_or_venue !== venue) return false;
        return true;
      });

      if (!rows.length) {
        tbody.innerHTML = '<tr class="table-empty"><td colspan="8">No F&B bookings today.</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map((b) => `
        <tr class="${b.notes ? 'fnb-row--has-request' : ''}">
          <td>${b.slot_start_time || '—'}</td>
          <td>${b.name || '—'}</td>
          <td>${b.membership_number}</td>
          <td>${b.facility_or_venue || '—'}</td>
          <td>${b.outlet_pax || '—'}</td>
          <td>
            ${b.notes
              ? `<div class="fnb-request"><span class="fnb-request__badge">!</span><span class="fnb-request__text">${b.notes}</span></div>`
              : '<span style="color:var(--muted);opacity:0.35">—</span>'}
          </td>
          <td><span class="status-badge status--${(b.booking_status || '').toLowerCase().replace(/\s/g,'-')}">${b.booking_status || '—'}</span></td>
          <td>
            ${b.booking_status === 'Confirmed' ? `<button class="btn-checkin" onclick="checkIn('${b.booking_reference}')">✓ Check In</button>` : ''}
          </td>
        </tr>`).join('');
    }

    window.checkIn = async (booking_reference) => {
      const res  = await apiFetch(`${API_BASE}/api/checkin`, {
        method: 'POST',
        body: JSON.stringify({ booking_reference, checked_in_by: staff.username }),
      });
      const data = await res.json();
      notify(data.message, !data.success);
      if (data.success) loadFnb();
    };

    async function loadFnb() {
      tbody.innerHTML = '<tr class="table-empty"><td colspan="8">Loading…</td></tr>';
      try {
        const res  = await apiFetch(`${API_BASE}/api/staff/fnb`);
        const data = await res.json();
        allFnb = data.bookings || [];
        renderFnb();
      } catch {
        tbody.innerHTML = '<tr class="table-empty"><td colspan="8">Failed to load.</td></tr>';
      }
    }

    filterVenue.addEventListener('change', renderFnb);
    refreshBtn.addEventListener('click', loadFnb);
    loadFnb();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LATE CANCELLATIONS  (staff-cancel.html)
  // ════════════════════════════════════════════════════════════════════════════
  if (document.getElementById('lateCancelBody')) {
    const tbody      = document.getElementById('lateCancelBody');
    const modal      = document.getElementById('waiveFeeModal');
    const overlay    = document.getElementById('modalOverlay');
    const waiveForm  = document.getElementById('waiveFeeForm');
    const refInput   = document.getElementById('waiverContactId');

    // Stash the loaded bookings so the Waive button can look them up by
    // booking_reference. Avoids embedding JSON in onclick attributes
    // (which breaks when the JSON contains quotes).
    let cachedBookings = [];

    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    async function loadLateCancellations() {
      tbody.innerHTML = '<tr class="table-empty"><td colspan="7">Loading…</td></tr>';
      try {
        const res  = await apiFetch(`${API_BASE}/api/staff/late-cancellations`);
        const data = await res.json();
        const rows = data.bookings || [];
        cachedBookings = rows;

        if (!rows.length) {
          tbody.innerHTML = '<tr class="table-empty"><td colspan="7">No late cancellations.</td></tr>';
          return;
        }

        tbody.innerHTML = rows.map((b) => {
          const ref = escapeHtml(b.booking_reference || '');
          return `
          <tr>
            <td>${escapeHtml(b.name || '—')}</td>
            <td>${escapeHtml(b.membership_number || '—')}</td>
            <td>${escapeHtml(b.facility_or_venue || '—')}</td>
            <td>${escapeHtml((b.slot_date || '—') + ' ' + (b.slot_start_time || ''))}</td>
            <td>${b.updatedAt ? new Date(b.updatedAt).toLocaleString('en-SG') : '—'}</td>
            <td>${b.fee_waived
              ? `<span style="color:green">Waived${b.waiver_by ? ' · ' + escapeHtml(b.waiver_by) : ''}</span>`
              : '<span style="color:#c96a5e">Pending</span>'}</td>
            <td>${!b.fee_waived
              ? `<button class="btn-sm btn-secondary" onclick="openWaiver('${ref}')">Waive Fee</button>`
              : '—'}</td>
          </tr>`;
        }).join('');
      } catch {
        tbody.innerHTML = '<tr class="table-empty"><td colspan="7">Failed to load.</td></tr>';
      }
    }

    window.openWaiver = (refOrBooking) => {
      // Accepts either a booking_reference string (from the rendered button)
      // or a full booking object (preserved for backwards compat).
      const b = typeof refOrBooking === 'string'
        ? cachedBookings.find((x) => x.booking_reference === refOrBooking)
        : refOrBooking;
      if (!b) {
        console.warn('[Waiver] booking not found for', refOrBooking);
        return;
      }
      // Populate summary
      document.getElementById('waiverMemberName').textContent  = b.name || '—';
      document.getElementById('waiverMembershipNo').textContent = b.membership_number || '—';
      document.getElementById('waiverFacility').textContent    = b.facility_or_venue || '—';
      document.getElementById('waiverSlot').textContent        = [b.slot_date, b.slot_start_time].filter(Boolean).join(' ') || '—';
      document.getElementById('waiverRef').textContent         = b.booking_reference || '—';
      refInput.value = b.booking_reference;
      // Reset form
      waiveForm.reset();
      document.getElementById('waiverNotesRequired').style.display = 'none';
      modal.showModal();
      overlay.hidden = false;
    };

    // Show "required" marker on notes when "Other" is selected
    document.getElementById('waiverReasonCategory').addEventListener('change', function () {
      document.getElementById('waiverNotesRequired').style.display =
        this.value === 'Other' ? 'inline' : 'none';
    });

    document.querySelectorAll('[data-close]').forEach((btn) =>
      btn.addEventListener('click', () => { modal.close(); overlay.hidden = true; })
    );

    waiveForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const booking_reference = refInput.value;
      const category          = document.getElementById('waiverReasonCategory').value;
      const notes             = document.getElementById('waiverNotes').value.trim();

      if (category === 'Other' && !notes) {
        document.getElementById('waiverNotes').focus();
        return;
      }

      const waiver_reason = notes ? `${category}: ${notes}` : category;

      const res  = await apiFetch(`${API_BASE}/api/staff/waive-fee`, {
        method: 'POST',
        body: JSON.stringify({ booking_reference, waiver_reason, waiver_by: staff.username }),
      });
      const data = await res.json();
      if (data.success) {
        modal.close();
        overlay.hidden = true;
        waiveForm.reset();
        notify(data.message || 'Fee waiver recorded.', false);
        loadLateCancellations();
      } else {
        notify(data.message || 'Waiver failed. Please try again.', true);
      }
    });

    loadLateCancellations();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STAFF BOOKING  (staff-booking.html)
  // ════════════════════════════════════════════════════════════════════════════
  if (document.getElementById('sbSearchBtn')) {
    const sbSearchBtn    = document.getElementById('sbSearchBtn');
    const sbMemberResult = document.getElementById('sbMemberResult');
    const sbMemberName   = document.getElementById('sbMemberName');
    const sbMemberTier   = document.getElementById('sbMemberTier');
    const bookingForm    = document.getElementById('staffBookingForm');
    const sbVenue        = document.getElementById('sbVenue');
    const sbShiftField   = document.getElementById('sbShiftField');

    let foundMember = null;

    // Prevent past dates — staff can book for today or any future date
    const todaySGT = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    const sbDateInput = document.getElementById('sbDate');
    if (sbDateInput) { sbDateInput.min = todaySGT; }

    const FACILITY_VENUES = [
      { value: 'Tennis',       label: 'Tennis' },
      { value: 'Squash',       label: 'Squash' },
      { value: 'Gym',          label: 'Gym' },
    ];
    const DINING_VENUES = [
      { value: 'Barkerslounge', label: "Barker's Lounge" },
      { value: 'Oasis',         label: 'Oasis' },
      { value: 'Le Mansion',    label: 'Le Mansion' },
    ];

    const sbVenueField = document.getElementById('sbVenueField');
    const sbType       = document.getElementById('sbType');

    function populateVenues(venues) {
      sbVenue.innerHTML = '<option value="">Select venue</option>';
      venues.forEach(({ value, label }) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        sbVenue.appendChild(opt);
      });
      sbVenueField.hidden = false;
      sbShiftField.hidden = true;
      sbVenue.value = '';
    }

    sbType.addEventListener('change', () => {
      if (sbType.value === 'Facility') {
        populateVenues(FACILITY_VENUES);
      } else if (sbType.value === 'Dining') {
        populateVenues(DINING_VENUES);
      } else {
        sbVenueField.hidden = true;
        sbShiftField.hidden = true;
        sbVenue.innerHTML = '<option value="">Select venue</option>';
      }
    });

    // Shift only for Le Mansion
    sbVenue.addEventListener('change', () => {
      sbShiftField.hidden = sbVenue.value !== 'Le Mansion';
    });

    sbSearchBtn.addEventListener('click', async () => {
      const membership_number = document.getElementById('sbMemberNo').value.trim();
      if (!membership_number) return;

      sbSearchBtn.textContent = 'Searching…';
      try {
        const res  = await apiFetch(`${API_BASE}/api/staff/member/${encodeURIComponent(membership_number)}`);
        const data = await res.json();

        if (!data.success) { notify('Member not found.', true); return; }

        foundMember = data.contact;
        sbMemberName.textContent = data.contact.name;
        sbMemberTier.textContent = data.contact.membership_tier || '—';
        sbMemberResult.hidden = false;

        // Auto-populate Full Name in Step 2
        const sbFullName = document.getElementById('sbFullName');
        if (sbFullName) sbFullName.value = data.contact.name;
      } catch {
        notify('Error searching member. Please try again.', true);
      } finally {
        sbSearchBtn.textContent = 'Find Member';
      }
    });

    bookingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!foundMember) { notify('Please find a member first.', true); return; }

      const venue         = sbVenue.value;
      const shift         = venue === 'Le Mansion' ? document.getElementById('sbShift').value : '';
      const fullName      = document.getElementById('sbFullName').value.trim() || foundMember.name;
      const slotDate      = document.getElementById('sbDate').value;
      const slotStartTime = document.getElementById('sbTime').value;
      const slotEndTime   = document.getElementById('sbEndTime').value;
      const pax           = document.getElementById('sbPax').value;
      const currentDate   = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });

      if (!slotDate || slotDate < currentDate) {
        notify('Please select a valid date (today or a future date).', true);
        return;
      }
      if (slotDate === currentDate) {
        const currentTime = new Date().toLocaleTimeString('en-GB', {
          timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false,
        });
        if (slotStartTime <= currentTime) {
          notify('The selected start time has already passed. Please choose a future time.', true);
          return;
        }
      }
      if (slotEndTime <= slotStartTime) {
        notify('End time must be after start time and cannot span past midnight.', true);
        return;
      }

      const res  = await apiFetch(`${API_BASE}/api/booking`, {
        method: 'POST',
        body: JSON.stringify({
          email:             foundMember.email,
          phone:             foundMember.phone || '',
          name:              fullName,
          membership_number: foundMember.membership_number,
          facility_or_venue: venue,
          calendar_id:       venue === 'Le Mansion' ? (LE_MANSION_CALENDARS[shift] || '') : (CALENDAR_MAP[venue] || ''),
          booking_shift:     shift,
          slot_date:         slotDate,
          slot_start_time:   slotStartTime,
          slot_end_time:     slotEndTime,
          outlet_pax:        pax,
          booking_type:      document.getElementById('sbType').value,
          special_request:   '',
        }),
      });
      const data = await res.json();
      notify(data.success ? `Booking created: ${data.booking_reference}` : data.message || 'Booking failed.', !data.success);
      if (data.success) {
        bookingForm.reset();
        sbVenueField.hidden = true;
        sbShiftField.hidden = true;
      }
    });
  }


})();
