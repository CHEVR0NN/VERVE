(function () {

  const API_BASE = 'https://backend-production-41dc3.up.railway.app';

  // ── Authenticated fetch helper ─────────────────────────────────────────────
  function authFetch(url, options = {}) {
    const token = localStorage.getItem('vrv_token');
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  }

  // ── Time helpers ───────────────────────────────────────────────────────────
  // Valid operating hours: 6:30 AM – 12:00 AM (midnight)
  function buildTimeOptions() {
    const opts = [];
    for (let h = 6; h < 24; h++) {
      for (const m of [0, 30]) {
        if (h === 6 && m === 0) continue; // start at 06:30
        opts.push(makeTimeOpt(h, m));
      }
    }
    opts.push({ value: '00:00', label: '12:00 AM' }); // midnight
    return opts;
  }

  // Returns { date, time } for the current moment in SGT.
  function nowSGT() {
    const d = new Date();
    return {
      date: d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }),
      time: d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false }),
    };
  }

  // Normalise so midnight '00:00' sorts after '23:30' instead of before '06:30'.
  function normTime(t) { return t === '00:00' ? '24:00' : t; }

  // All slots for a future date; only slots strictly after now for today.
  function buildTimeOptionsForDate(dateStr) {
    const all = buildTimeOptions();
    const { date: today, time: now } = nowSGT();
    if (dateStr !== today) return all;
    return all.filter(opt => normTime(opt.value) > normTime(now));
  }

  // Rebuild both edit-modal time selects for dateStr, restoring values only if still valid.
  function populateEditTimes(dateStr, keepStart, keepEnd) {
    const startSel = document.getElementById('editBookingStartTime');
    const endSel   = document.getElementById('editBookingEndTime');
    const opts     = buildTimeOptionsForDate(dateStr);
    [startSel, endSel].forEach(sel => {
      sel.innerHTML = '';
      opts.forEach(o => sel.appendChild(new Option(o.label, o.value)));
    });
    if (keepStart && opts.some(o => o.value === keepStart)) startSel.value = keepStart;
    if (keepEnd   && opts.some(o => o.value === keepEnd))   endSel.value   = keepEnd;
  }

  function makeTimeOpt(h, m) {
    const value  = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const period = h < 12 ? 'AM' : 'PM';
    const h12    = h > 12 ? h - 12 : h;
    const label  = `${h12}:${String(m).padStart(2, '0')} ${period}`;
    return { value, label };
  }

  function formatDisplayTime(time24) {
    if (!time24) return '—';
    // GHL stores slot_start_time as "YYYY-MM-DD HH:MM AM/PM" — extract the time portion
    const timeOnly = time24.replace(/^\d{4}-\d{2}-\d{2}\s+/, '').trim();
    // Already has AM/PM — return as-is
    if (/[AP]M$/i.test(timeOnly)) return timeOnly;
    // HH:MM 24-hour → 12-hour
    const [h, m] = timeOnly.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return time24;
    const period = h < 12 ? 'AM' : 'PM';
    const h12    = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  // ── Add N hours to a HH:MM string ─────────────────────────────────────────
  function addHours(time, hours) {
    const [h, m] = time.split(':').map(Number);
    const endH   = String((h + hours) % 24).padStart(2, '0');
    return `${endH}:${m.toString().padStart(2, '0')}`;
  }

  // ── Auth guard ────────────────────────────────────────────────────────────
  const token  = localStorage.getItem('vrv_token');
  const member = JSON.parse(localStorage.getItem('src_member') || 'null');
  if (!token || !member) {
    window.location.href = 'index.html';
    return;
  }

  // ── Member info ───────────────────────────────────────────────────────────
  document.getElementById('memberGreeting').textContent = `Hello, ${member.name || 'Member'} !`;
  document.getElementById('memberId').textContent       = `Member ID: ${member.membership_number || '—'}`;

  // ── Greeting date ─────────────────────────────────────────────────────────
  const greetingDateEl = document.getElementById('greetingDate');
  if (greetingDateEl) {
    greetingDateEl.textContent = new Date().toLocaleDateString('en-SG', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  // ── Hardcoded facilities and venues with GHL calendar IDs ─────────────────
  const FACILITIES = [
    { name: 'Tennis', cid: 'PBybXIrnK5Y5Z8QYj0Re' },
    { name: 'Squash', cid: 'iOHOpI35vxyABNK2NDKK' },
    { name: 'Gym',    cid: 'j1jv7fk0AnlrfAeSCgQ5' },
  ];
  const VENUES = [
    { name: 'Oasis',         cid: 'LGzqWrWZ0Ia6DYsOQ3wZ' },
    { name: 'Barkerslounge', cid: 'SrFhhBpGuhprk6nVuND5' },
    { name: 'Le Mansion',    cid: '' },
  ];

  const LE_MANSION_CALENDARS = {
    Lunch:  'hPNlJNlQtHcOBLQdMhmq',
    Dinner: 'Xppv7hBSv8VikwOygLYp',
  };

  const toOption = ({ name, cid }) =>
    `<option value="${name}" data-cid="${cid}">${name}</option>`;

  document.getElementById('facilityName').innerHTML =
    '<option value="">Select a facility</option>' + FACILITIES.map(toOption).join('');

  document.getElementById('diningVenue').innerHTML =
    '<option value="">Select a venue</option>' + VENUES.map(toOption).join('');

  // ── Inject time options (30-min increments, 6:30 AM – 12:00 AM) ──────────
  const TIME_OPT_HTML =
    '<option value="">Select a time</option>' +
    buildTimeOptions().map(o => `<option value="${o.value}">${o.label}</option>`).join('');

  document.getElementById('facilityTime').innerHTML = TIME_OPT_HTML;
  document.getElementById('diningTime').innerHTML   = TIME_OPT_HTML;

  // ── Venue-aware notes placeholder map ────────────────────────────────────
  const NOTES_PLACEHOLDERS = {
    'Tennis':        'e.g. racket rental needed, court preference',
    'Squash':        'e.g. racket rental needed, coaching request',
    'Gym':           'e.g. personal training session, equipment preference',
    'Le Mansion':    'e.g. window seat preferred, vegetarian menu, birthday cake arrangement',
    'Barkerslounge': 'e.g. preferred seating, birthday celebration setup',
    'Oasis':         'e.g. poolside table preference, dietary requirements',
  };

  function setNotesPlaceholder(venue, textareaId) {
    const el = document.getElementById(textareaId);
    if (el) el.placeholder = NOTES_PLACEHOLDERS[venue] || 'e.g. any special requests or notes';
  }

  // ── Le Mansion shift → allowed time windows ──────────────────────────────
  const SHIFT_TIMES = {
    Lunch:  { start: '12:00', end: '15:00' },
    Dinner: { start: '18:00', end: '22:00' },
  };

  function applyDiningTimes(venue, shift) {
    const timeEl = document.getElementById('diningTime');
    const current = timeEl.value;
    let opts = buildTimeOptions();
    if (venue === 'Le Mansion' && shift && SHIFT_TIMES[shift]) {
      const { start, end } = SHIFT_TIMES[shift];
      opts = opts.filter(o => o.value >= start && o.value <= end);
    }
    timeEl.innerHTML = '<option value="">Select a time</option>' +
      opts.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    // Restore previous selection only if it's still valid
    if (current && opts.some(o => o.value === current)) timeEl.value = current;
  }

  // ── Le Mansion: show/hide shift dropdown + update notes placeholder ───────
  document.getElementById('diningVenue').addEventListener('change', function () {
    const isLeMansion = this.value === 'Le Mansion';
    const shiftLabel  = document.getElementById('diningShiftLabel');
    const shiftEl     = document.getElementById('diningShift');
    shiftLabel.style.display = isLeMansion ? '' : 'none';
    shiftEl.required         = isLeMansion;
    shiftEl.value            = '';
    setNotesPlaceholder(this.value, 'diningNotes');
    applyDiningTimes(this.value, '');
  });

  // Re-filter time options whenever shift changes
  document.getElementById('diningShift').addEventListener('change', function () {
    const venue = document.getElementById('diningVenue').value;
    applyDiningTimes(venue, this.value);
  });

  // ── Inject facility/venue select into Guest modal ─────────────────────────
  const guestFacilityLabel = document.createElement('label');
  guestFacilityLabel.innerHTML =
    'Facility / Venue<select id="guestFacility" required>' +
    '<option value="">Select a facility / venue</option>' +
    [...FACILITIES, ...VENUES].map(toOption).join('') +
    '</select>';
  document.getElementById('guestShiftLabel')
    .insertAdjacentElement('beforebegin', guestFacilityLabel);

  document.getElementById('guestFacility').addEventListener('change', function () {
    const isLeMansion = this.value === 'Le Mansion';
    const shiftLabel  = document.getElementById('guestShiftLabel');
    const shiftEl     = document.getElementById('guestShift');
    shiftLabel.style.display = isLeMansion ? '' : 'none';
    shiftEl.required         = isLeMansion;
    shiftEl.value            = '';
  });

  // ── Load and render bookings from backend ─────────────────────────────────
  const EMPTY_STATE_HTML       = document.getElementById('upcomingList').innerHTML;
  const GUEST_EMPTY_STATE_HTML = document.getElementById('guestList').innerHTML;

  async function loadBookings() {
    try {
      const res  = await authFetch(`${API_BASE}/api/member/bookings`);
      const data = await res.json();
      if (data.success) {
        const allBookings = data.bookings || [];
        const isGuestType = (t) => t === 'guest' || t === 'guest_pass';
        const guestBookings    = allBookings.filter(b => isGuestType(b.booking_type));
        const nonGuestBookings = allBookings.filter(b => !isGuestType(b.booking_type));
        renderBookings(nonGuestBookings);
        renderGuests(guestBookings.map(b => ({
          name:              b.name || '—',
          email:             b.email || '',
          facility:          b.facility_or_venue || '',
          date:              b.slot_date || '',
          booking_reference: b.booking_reference || '',
          status:            b.booking_status || '',
        })));
      }
    } catch {
      // fail silently — empty state remains
    }
  }

  // ── Classify a booking as "upcoming" or "past" ─────────────────────────────
  const PAST_STATUSES = ['cancelled', 'late-cancellation', 'checked-in', 'no-show', 'completed', 'done', 'late-fee-paid'];

  function isUpcoming(b) {
    const todaySG   = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    const statusKey = (b.booking_status || 'confirmed').toLowerCase().replace(/[\s_]+/g, '-');
    // Terminal statuses are always past regardless of date
    if (PAST_STATUSES.includes(statusKey)) return false;
    // Future or today bookings with active status are upcoming
    return (b.slot_date || '') >= todaySG;
  }

  function renderBookings(bookings) {
    const totalBookingsEl = document.getElementById('totalBookings');
    const upcomingList    = document.getElementById('upcomingList');

    const total = bookings.length;
    totalBookingsEl.textContent = `${total} booking${total === 1 ? '' : 's'}`;

    const facilityCount = bookings.filter(b => b.booking_type !== 'dining').length;
    const diningCount   = bookings.filter(b => b.booking_type === 'dining').length;
    const statFacility  = document.getElementById('statFacility');
    const statDining    = document.getElementById('statDining');
    if (statFacility) statFacility.textContent = facilityCount;
    if (statDining)   statDining.textContent   = diningCount;

    if (!total) {
      upcomingList.innerHTML = EMPTY_STATE_HTML;
      return;
    }

    // Split into upcoming and past
    const upcoming = bookings.filter(b => isUpcoming(b));
    const past     = bookings.filter(b => !isUpcoming(b));

    upcomingList.innerHTML = '';

    // ── Upcoming section ──────────────────────────────────────────────────────
    if (upcoming.length) {
      const header = document.createElement('h3');
      header.className = 'booking-section-header';
      header.textContent = `Upcoming (${upcoming.length})`;
      upcomingList.appendChild(header);
      upcoming.slice().reverse().forEach(b => upcomingList.appendChild(buildBookingItem(b)));
    }

    // ── Past section ──────────────────────────────────────────────────────────
    if (past.length) {
      const header = document.createElement('h3');
      header.className = 'booking-section-header booking-section-header--past';
      header.textContent = `Past Bookings (${past.length})`;
      upcomingList.appendChild(header);
      past.slice().reverse().forEach(b => upcomingList.appendChild(buildBookingItem(b)));
    }

    if (!upcoming.length && !past.length) {
      upcomingList.innerHTML = EMPTY_STATE_HTML;
    }
  }

  // Returns a timing chip for today's active bookings; empty string otherwise.
  function getTimingChip(b) {
    const statusKey = (b.booking_status || '').toLowerCase().replace(/[\s_]+/g, '-');
    if (PAST_STATUSES.includes(statusKey)) return '';

    const { date: todaySGT, time: nowTime } = nowSGT();
    if ((b.slot_date || '') !== todaySGT) return '';

    const start = b.slot_start_time;
    const end   = b.slot_end_time;
    if (!start) return '';

    if (normTime(start) > normTime(nowTime)) {
      return '<span class="timing-chip timing-chip--soon">Not Yet Started</span>';
    }
    if (end && normTime(nowTime) >= normTime(start) && normTime(end) > normTime(nowTime)) {
      return '<span class="timing-chip timing-chip--live">In Progress</span>';
    }
    return '';
  }

  function buildBookingItem(b) {
    const type      = b.booking_type === 'dining' ? 'Dining' : 'Facility';
    const typeClass = b.booking_type === 'dining' ? 'dining' : 'facility';

    const origStatusKey = (b.booking_status || 'confirmed').toLowerCase().replace(/[\s_]+/g, '-');
    const isLateCancellation = b.late_cancellation || origStatusKey === 'late-fee-paid';

    const rawStatus  = isLateCancellation ? 'late cancellation' : (b.booking_status || 'confirmed').toLowerCase();
    const statusKey  = rawStatus.replace(/[\s_]+/g, '-');
    const statusDisp = rawStatus.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    let feeChip = '';
    if (isLateCancellation) {
      if (origStatusKey === 'late-fee-paid') {
        feeChip = '<span class="fee-status-chip fee-status--paid">Fee Paid</span>';
      } else if (b.fee_waived) {
        feeChip = '<span class="fee-status-chip fee-status--waived">Fee Waived</span>';
      } else {
        feeChip = '<span class="fee-status-chip fee-status--outstanding">Fee Outstanding</span>';
      }
    }

    const date  = b.slot_date || '—';
    const time  = b.slot_start_time
      ? formatDisplayTime(b.slot_start_time) +
        (b.slot_end_time ? ' – ' + formatDisplayTime(b.slot_end_time) : '')
      : '—';
    const pax   = b.outlet_pax || b.pax_size || '—';
    const notes = b.special_request || b.notes || '—';
    const ref   = b.booking_reference || '—';
    const name  = b.facility_or_venue || '—';

    const isActive = !PAST_STATUSES.includes(statusKey);
    const timingChip = getTimingChip(b);

    const item = document.createElement('article');
    item.className   = 'booking-item' + (isActive ? '' : ' booking-item--past');
    item.dataset.ref = ref;
    item.innerHTML = `
      <div class="booking-item__main">
        <span class="booking-type-badge booking-type--${typeClass}">${type}</span>
        <span class="booking-item__name">${name}</span>
        <div class="booking-item__badges"><span class="booking-status-badge booking-status--${statusKey}">${statusDisp}</span>${timingChip}${feeChip}</div>
        <div class="booking-item__actions">
          ${isActive && !['cancelled', 'no-show'].includes(statusKey) ? `<button class="btn-qr-view" type="button" title="View QR Code" data-ref="${ref}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><line x1="21" y1="14" x2="21" y2="14.01"/><line x1="21" y1="21" x2="21" y2="21.01"/><line x1="17" y1="21" x2="17" y2="21.01"/><line x1="21" y1="17" x2="21" y2="17.01"/></svg></button>` : ''}
          <button class="btn-details" type="button">Details</button>
          ${isActive ? `<button class="btn-edit-booking" type="button" data-ref="${ref}">Edit</button>` : ''}
          ${isActive ? '<button class="btn-cancel-booking" type="button">Cancel</button>' : ''}
        </div>
      </div>
      <div class="booking-item__details">
        <div class="booking-detail-row">
          <span class="booking-detail-label">Date</span>
          <span class="booking-detail-value">${date}</span>
        </div>
        <div class="booking-detail-row">
          <span class="booking-detail-label">Time</span>
          <span class="booking-detail-value">${time}</span>
        </div>
        <div class="booking-detail-row">
          <span class="booking-detail-label">Pax</span>
          <span class="booking-detail-value">${pax}</span>
        </div>
        <div class="booking-detail-row">
          <span class="booking-detail-label">Notes</span>
          <span class="booking-detail-value">${notes}</span>
        </div>
      </div>
    `;

    item.querySelector('.btn-details').addEventListener('click', () => {
      const panel   = item.querySelector('.booking-item__details');
      const btn     = item.querySelector('.btn-details');
      const isOpen  = panel.classList.toggle('is-open');
      btn.textContent = isOpen ? 'Hide' : 'Details';
      btn.classList.toggle('btn-details--active', isOpen);
      item.classList.toggle('is-expanded', isOpen);
    });

    const qrBtn = item.querySelector('.btn-qr-view');
    if (qrBtn) {
      qrBtn.addEventListener('click', () => showQrView(ref));
    }

    const cancelBtn = item.querySelector('.btn-cancel-booking');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => handleCancelBooking(ref));
    }

    const editBtn = item.querySelector('.btn-edit-booking');
    if (editBtn) {
      editBtn.addEventListener('click', () => openEditBooking(b));
    }

    return item;
  }

  function handleCancelBooking(ref) {
    const modal    = document.getElementById('cancelConfirmModal');
    const refSpan  = document.getElementById('cancelConfirmRef');
    const errSpan  = document.getElementById('cancelConfirmError');
    const yesBtn   = document.getElementById('cancelConfirmYes');
    const noBtn    = document.getElementById('cancelConfirmNo');

    refSpan.textContent = ref;
    errSpan.hidden = true;
    modal.showModal();

    const closeModal = () => modal.close();
    noBtn.onclick = closeModal;
    modal.querySelector('[data-close]').onclick = closeModal;

    yesBtn.onclick = async () => {
      errSpan.hidden = true;
      try {
        const res  = await authFetch(`${API_BASE}/api/cancellation`, {
          method: 'POST',
          body:   JSON.stringify({ email: member.email, booking_reference: ref }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          errSpan.textContent = data.message || 'Cancellation failed. Please try again.';
          errSpan.hidden = false;
          return;
        }
        closeModal();
        loadBookings();
      } catch {
        errSpan.textContent = 'Unable to connect to the server. Please try again.';
        errSpan.hidden = false;
      }
    };
  }

  // ── Edit booking ──────────────────────────────────────────────────────────
  function openEditBooking(booking) {
    document.getElementById('editBookingRef').value         = booking.booking_reference;
    document.getElementById('editBookingVenue').textContent = booking.facility_or_venue || '—';

    const editDateInput = document.getElementById('editBookingDate');
    editDateInput.min   = nowSGT().date;
    editDateInput.value = booking.slot_date || '';

    populateEditTimes(booking.slot_date || '', booking.slot_start_time, booking.slot_end_time);

    document.getElementById('editBookingPax').value   = booking.outlet_pax || booking.pax_size || 1;
    document.getElementById('editBookingNotes').value = booking.notes || booking.special_request || '';
    setNotesPlaceholder(booking.facility_or_venue, 'editBookingNotes');

    showModal('editBookingModal');
  }

  // Re-filter time slots whenever the edit date changes (e.g. user switches to today).
  document.getElementById('editBookingDate').addEventListener('change', function () {
    const startSel = document.getElementById('editBookingStartTime');
    const endSel   = document.getElementById('editBookingEndTime');
    populateEditTimes(this.value, startSel.value, endSel.value);
  });

  document.getElementById('editBookingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ref       = document.getElementById('editBookingRef').value;
    const editDate  = document.getElementById('editBookingDate').value;
    const { date: todayEdit, time: nowTime } = nowSGT();

    if (editDate < todayEdit) {
      alert('You cannot reschedule a booking to a past date. Please select today or a future date.');
      return;
    }

    const startTime = document.getElementById('editBookingStartTime').value;
    const endTime   = document.getElementById('editBookingEndTime').value;

    if (editDate === todayEdit && (!startTime || normTime(startTime) <= normTime(nowTime))) {
      alert('Start time has already passed. Please select a future time.');
      return;
    }

    if (startTime && endTime && normTime(endTime) <= normTime(startTime)) {
      alert('End time must be after start time.');
      return;
    }

    const editNotes = document.getElementById('editBookingNotes').value;
    if (editNotes.length > 500) {
      alert('Special request must not exceed 500 characters.');
      return;
    }
    const body = {
      slot_date:       editDate,
      slot_start_time: document.getElementById('editBookingStartTime').value,
      slot_end_time:   document.getElementById('editBookingEndTime').value,
      outlet_pax:      document.getElementById('editBookingPax').value,
      notes:           editNotes,
    };

    try {
      const res  = await authFetch(`${API_BASE}/api/member/bookings/${encodeURIComponent(ref)}`, {
        method: 'PUT',
        body:   JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.message || 'Failed to update booking. Please try again.');
        return;
      }
      closeModal(document.getElementById('editBookingModal'));
      loadBookings();
    } catch {
      alert('Unable to connect to the server. Please try again.');
    }
  });

  // ── Render registered guests (loaded from API in loadBookings) ─────────────

  function renderGuests(guests) {
    const guestList       = document.getElementById('guestList');
    const totalGuestsEl   = document.getElementById('totalGuestsCount');
    const statGuestsEl    = document.getElementById('statGuests');

    const total = guests.length;
    if (totalGuestsEl) totalGuestsEl.textContent = `${total} guest${total === 1 ? '' : 's'}`;
    if (statGuestsEl)  statGuestsEl.textContent  = total;

    if (!total) {
      guestList.innerHTML = GUEST_EMPTY_STATE_HTML;
      return;
    }

    guestList.innerHTML = '';
    guests.forEach(g => {
      const item = document.createElement('div');
      item.className = 'guest-item';
      const statusKey  = (g.status || '').toLowerCase().replace(/[\s_]+/g, '-');
      const statusDisp = (g.status || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      // Friendly date: "25 May 2026" (falls back to raw string if invalid)
      let dateDisp = '';
      if (g.date) {
        const d = new Date(g.date);
        dateDisp = isNaN(d.getTime())
          ? g.date
          : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      }

      const venuePart = g.facility ? `<span class="guest-item__venue">${g.facility}</span>` : '';
      const datePart  = dateDisp   ? `<span class="guest-item__date">${dateDisp}</span>`    : '';
      const metaLine  = (venuePart || datePart)
        ? `<span class="guest-item__meta">${[venuePart, datePart].filter(Boolean).join('<span class="guest-item__meta-dot">·</span>')}</span>`
        : '';

      item.innerHTML = `
        <div class="guest-item__main">
          <span class="guest-item__name">${g.name}</span>
          ${metaLine}
        </div>
        ${statusKey ? `<span class="booking-status-badge booking-status--${statusKey}">${statusDisp}</span>` : ''}
        <div class="guest-item__actions">
          ${g.booking_reference ? `<span class="guest-item__ref">${g.booking_reference}</span>` : ''}
          ${g.booking_reference ? `<button class="btn-qr-view" type="button" title="View QR Code" data-ref="${g.booking_reference}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><line x1="21" y1="14" x2="21" y2="14.01"/><line x1="21" y1="21" x2="21" y2="21.01"/><line x1="17" y1="21" x2="17" y2="21.01"/><line x1="21" y1="17" x2="21" y2="17.01"/></svg></button>` : ''}
        </div>
      `;

      const qrBtn = item.querySelector('.btn-qr-view');
      if (qrBtn) {
        qrBtn.addEventListener('click', () => showQrView(qrBtn.dataset.ref));
      }

      guestList.appendChild(item);
    });
  }

  loadBookings();

  // ── Modal helpers ─────────────────────────────────────────────────────────
  function showModal(id) {
    const dialog = document.getElementById(id);
    // Lock past dates on all date inputs inside the modal
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    dialog.querySelectorAll('input[type="date"]').forEach(inp => { inp.min = today; });
    dialog.showModal();
    document.getElementById('modalOverlay').hidden = false;
  }

  function closeModal(elem) {
    const dialog = elem instanceof HTMLDialogElement ? elem : elem.closest('dialog');
    if (dialog) dialog.close();
    document.getElementById('modalOverlay').hidden = true;
  }

  document.querySelectorAll('[data-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      showModal(btn.dataset.modal);
      // Refresh guest quota every time the Register Guests modal opens
      // so the form caps to whatever the member still has left this month.
      if (btn.dataset.modal === 'guestModal') {
        loadGuestQuota();
      }
    });
  });

  // ── Deep-link a modal open via #open=facility|dining|guest (used by dashboard-home.html) ──
  // Hash-based rather than a query string: static hosts (incl. this project's
  // own `serve public` dev server) redirect /dashboard.html -> /dashboard and
  // drop query strings on the way, but a URL fragment never reaches the
  // server at all, so it survives that redirect intact.
  (function openModalFromHash() {
    const match  = /^#open=(facility|dining|guest)$/.exec(location.hash);
    const target = match && { facility: 'facilityModal', dining: 'diningModal', guest: 'guestModal' }[match[1]];
    if (!target) return;
    showModal(target);
    if (target === 'guestModal') loadGuestQuota();
    history.replaceState(null, '', location.pathname + location.search);
  })();

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn));
  });

  document.getElementById('modalOverlay').addEventListener('click', () => {
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    document.getElementById('modalOverlay').hidden = true;
    pendingSubmit   = null;
    summarySourceId = null;
  });

  // ── Booking confirmation modal ────────────────────────────────────────────
  function showConfirmation({ venue, date, time, pax, reference }) {
    document.getElementById('confirmGreeting').textContent =
      `Hi ${member.name || 'Member'}, your booking has been confirmed!`;
    document.getElementById('confirmVenue').textContent = venue;
    document.getElementById('confirmDate').textContent  = date;
    document.getElementById('confirmTime').textContent  = formatDisplayTime(time);
    document.getElementById('confirmPax').textContent   = pax;
    document.getElementById('confirmRef').textContent   = reference;
    document.getElementById('confirmQr').src =
      `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(reference)}`;
    showModal('confirmationModal');
  }

  document.getElementById('confirmDoneBtn').addEventListener('click', () => {
    closeModal(document.getElementById('confirmationModal'));
  });

  // ── QR Code view modal ────────────────────────────────────────────────────
  function showQrView(reference) {
    document.getElementById('qrViewRef').textContent = reference;
    document.getElementById('qrViewImg').src =
      `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(reference)}`;
    showModal('qrViewModal');
  }

  function downloadQr(imgEl, filename) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const a = document.createElement('a');
      a.href     = canvas.toDataURL('image/png');
      a.download = filename;
      a.click();
    };
    img.src = imgEl.src;
  }

  document.getElementById('confirmQrDownload').addEventListener('click', () => {
    const ref = document.getElementById('confirmRef').textContent || 'QR';
    downloadQr(document.getElementById('confirmQr'), `VRV-QR-${ref}.png`);
  });

  document.getElementById('qrViewDownload').addEventListener('click', () => {
    const ref = document.getElementById('qrViewRef').textContent || 'QR';
    downloadQr(document.getElementById('qrViewImg'), `VRV-QR-${ref}.png`);
  });

  document.getElementById('qrViewDoneBtn').addEventListener('click', () => {
    closeModal(document.getElementById('qrViewModal'));
  });

  // ── Guest registration confirmation modal ─────────────────────────────────
  function showGuestConfirmation(guestResults) {
    document.getElementById('guestConfirmGreeting').textContent =
      `Hi ${member.name || 'Member'}, your guest${guestResults.length > 1 ? 's have' : ' has'} been registered!`;

    const listEl = document.getElementById('guestConfirmList');
    listEl.innerHTML = guestResults.map(g => `
      <div class="guest-confirm-card">
        <div class="guest-confirm-card__name">${g.name}</div>
        <div class="guest-confirm-card__email">${g.email}</div>
        <div class="guest-confirm-card__ref">Ref: ${g.booking_reference}</div>
        <div class="guest-confirm-card__qr">
          <div class="guest-confirm-card__qr-label">Guest Check-in QR Code</div>
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(g.booking_reference)}" alt="QR Code for ${g.name}" />
        </div>
      </div>
    `).join('');

    showModal('guestConfirmationModal');
  }

  document.getElementById('guestConfirmDoneBtn').addEventListener('click', () => {
    closeModal(document.getElementById('guestConfirmationModal'));
    setTimeout(() => {
      const guestListEl = document.getElementById('guestList');
      if (guestListEl) guestListEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  });

  // ── Booking Summary Modal ─────────────────────────────────────────────────
  let pendingSubmit   = null;
  let summarySourceId = null;

  function showSummary(rows, sourceModalId, onConfirm) {
    summarySourceId = sourceModalId;
    pendingSubmit   = onConfirm;

    document.getElementById('summaryDetails').innerHTML = rows
      .map(([label, value]) =>
        `<div class="summary-row">
          <span class="summary-label">${label}</span>
          <span class="summary-value">${value}</span>
        </div>`)
      .join('');

    // Close source modal without hiding the overlay
    document.getElementById(sourceModalId).close();
    document.getElementById('summaryModal').showModal();
  }

  document.getElementById('summaryEditBtn').addEventListener('click', () => {
    document.getElementById('summaryModal').close();
    document.getElementById(summarySourceId).showModal();
  });

  document.getElementById('summaryCloseBtn').addEventListener('click', () => {
    document.getElementById('summaryModal').close();
    document.getElementById('modalOverlay').hidden = true;
    pendingSubmit   = null;
    summarySourceId = null;
  });

  document.getElementById('summaryConfirmBtn').addEventListener('click', async () => {
    const doSubmit  = pendingSubmit;
    pendingSubmit   = null;
    summarySourceId = null;
    document.getElementById('summaryModal').close();
    document.getElementById('modalOverlay').hidden = true;
    if (doSubmit) await doSubmit();
  });

  // ── Availability: mark fully-booked time slots in the dropdown ─────────────
  // Fetches per-time-slot usage from the backend and re-renders the time
  // <select> so members can see at a glance which times are full.
  async function loadAvailability(facility, date, timeEl, currentValue) {
    if (!facility || !date || !timeEl) return;
    let data = null;
    try {
      const res = await authFetch(`${API_BASE}/api/booking/availability?facility=${encodeURIComponent(facility)}&date=${encodeURIComponent(date)}`);
      data = await res.json();
    } catch {
      // Network error — leave dropdown as-is, user will see backend error on submit
      return;
    }
    if (!data || !data.success) return;

    // Pull base options from the existing dropdown so we keep shift-filtering
    // and any other constraints already applied by the page. Strip previously
    // appended availability hints so they don't accumulate across refreshes.
    const stripHint = (s) => s
      .replace(/\s+—\s+Fully booked$/i, '')
      .replace(/\s+\(\d+\/\d+\s+booked\)$/i, '');
    const baseOpts = Array.from(timeEl.querySelectorAll('option'))
      .filter(o => o.value !== '')
      .map(o => ({ value: o.value, label: stripHint(o.textContent) }));

    const slots = data.slots || {};
    const cap   = data.cap;

    timeEl.innerHTML = '<option value="">Select a time</option>' +
      baseOpts.map(o => {
        const slot = slots[o.value];
        if (!slot) return `<option value="${o.value}">${o.label}</option>`;
        if (slot.isFull) {
          return `<option value="${o.value}" disabled style="color:#aaa;">${o.label} — Fully booked</option>`;
        }
        // Show capacity hint when getting close to full (>50% used)
        if (cap && slot.used > 0 && slot.used >= cap / 2) {
          return `<option value="${o.value}">${o.label} (${slot.used}/${cap} booked)</option>`;
        }
        return `<option value="${o.value}">${o.label}</option>`;
      }).join('');

    // Restore the previously-selected time if it's still available
    if (currentValue && !slots[currentValue]?.isFull) {
      timeEl.value = currentValue;
    }
  }

  function refreshFacilityAvailability() {
    const facility = document.getElementById('facilityName').value;
    const date     = document.getElementById('facilityDate').value;
    const timeEl   = document.getElementById('facilityTime');
    loadAvailability(facility, date, timeEl, timeEl.value);
  }

  function refreshDiningAvailability() {
    const venue  = document.getElementById('diningVenue').value;
    const date   = document.getElementById('diningDate').value;
    const timeEl = document.getElementById('diningTime');
    loadAvailability(venue, date, timeEl, timeEl.value);
  }

  document.getElementById('facilityName').addEventListener('change', refreshFacilityAvailability);
  document.getElementById('diningVenue').addEventListener('change', refreshDiningAvailability);
  document.getElementById('diningShift').addEventListener('change', refreshDiningAvailability);

  // ── Facility booking form → POST /api/booking ─────────────────────────────
  document.getElementById('facilityDate').addEventListener('change', () => {
    document.getElementById('facilityDateError').hidden = true;
    refreshFacilityAvailability();
  });
  document.getElementById('facilityTime').addEventListener('change', () => {
    document.getElementById('facilityTimeError').hidden = true;
  });
  document.getElementById('diningDate').addEventListener('change', () => {
    document.getElementById('diningDateError').hidden = true;
    refreshDiningAvailability();
  });
  document.getElementById('diningTime').addEventListener('change', () => {
    document.getElementById('diningTimeError').hidden = true;
  });
  document.getElementById('guestVisitDate').addEventListener('change', () => {
    document.getElementById('guestDateError').hidden = true;
    document.getElementById('guestCapacityError').hidden = true;
  });

  document.getElementById('facilityForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const facilityEl = document.getElementById('facilityName');
    const facility   = facilityEl.value;
    const calendarId = facilityEl.selectedOptions[0]?.dataset.cid || '';
    const date       = document.getElementById('facilityDate').value;
    const startTime  = document.getElementById('facilityTime').value;
    const guests     = document.getElementById('facilityGuests').value;

    if (!facility || !date || !startTime) {
      alert('Please select a facility, date, and start time.');
      return;
    }
    const todayFacility = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    if (date < todayFacility) {
      document.getElementById('facilityDateError').hidden = false;
      document.getElementById('facilityDate').focus();
      return;
    }
    document.getElementById('facilityDateError').hidden = true;
    if (date === todayFacility) {
      const now = new Date();
      const sgMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 480) % 1440;
      const [h, m] = startTime.split(':').map(Number);
      if (h * 60 + m <= sgMinutes) {
        document.getElementById('facilityTimeError').hidden = false;
        document.getElementById('facilityTime').focus();
        return;
      }
    }
    document.getElementById('facilityTimeError').hidden = true;

    const facilityEndTime = addHours(startTime, 1);
    if (facilityEndTime <= startTime) {
      document.getElementById('facilityTimeError').textContent = 'Selected time would extend past midnight. Please choose an earlier time.';
      document.getElementById('facilityTimeError').hidden = false;
      document.getElementById('facilityTime').focus();
      return;
    }

    const rows = [
      ['Facility', facility],
      ['Date',     date],
      ['Time',     formatDisplayTime(startTime)],
      ['Pax',      guests],
    ];

    showSummary(rows, 'facilityModal', async () => {
      try {
        const res  = await authFetch(`${API_BASE}/api/booking`, {
          method: 'POST',
          body:   JSON.stringify({
            email:             member.email,
            name:              member.name,
            membership_number: member.membership_number,
            facility_or_venue: facility,
            calendar_id:       calendarId,
            slot_date:         date,
            slot_start_time:   startTime,
            slot_end_time:     addHours(startTime, 1),
            outlet_pax:        guests,
            booking_type:      'facility',
          }),
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          document.getElementById('summaryModal').close();
          document.getElementById('facilityModal').showModal();
          const errEl = document.getElementById('facilityCapacityError');
          errEl.textContent = data.message || 'Booking failed. Please try again.';
          errEl.hidden = false;
          return;
        }

        document.getElementById('facilityCapacityError').hidden = true;
        document.getElementById('facilityForm').reset();
        loadBookings();
        showConfirmation({
          venue:     facility,
          date:      date,
          time:      startTime,
          pax:       guests,
          reference: data.booking_reference,
        });
      } catch {
        alert('Unable to connect to the server. Please try again.');
      }
    });
  });

  // ── Dining reservation form → POST /api/booking ───────────────────────────
  document.getElementById('diningForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const venueEl   = document.getElementById('diningVenue');
    const venue     = venueEl.value;
    const shift     = document.getElementById('diningShift').value;
    const date      = document.getElementById('diningDate').value;
    const startTime = document.getElementById('diningTime').value;
    const pax       = document.getElementById('diningPax').value;
    const notes     = document.getElementById('diningNotes').value;

    const calendarId = venue === 'Le Mansion'
      ? (LE_MANSION_CALENDARS[shift] || '')
      : (venueEl.selectedOptions[0]?.dataset.cid || '');

    if (!venue || !date || !startTime || !pax) {
      alert('Please select a venue, date, time, and pax size.');
      return;
    }
    if (notes.length > 500) {
      alert('Special request must not exceed 500 characters.');
      return;
    }
    const todayDining = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    if (date < todayDining) {
      document.getElementById('diningDateError').hidden = false;
      document.getElementById('diningDate').focus();
      return;
    }
    document.getElementById('diningDateError').hidden = true;
    if (date === todayDining) {
      const now = new Date();
      const sgMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 480) % 1440;
      const [h, m] = startTime.split(':').map(Number);
      if (h * 60 + m <= sgMinutes) {
        document.getElementById('diningTimeError').hidden = false;
        document.getElementById('diningTime').focus();
        return;
      }
    }
    document.getElementById('diningTimeError').hidden = true;

    const diningEndTime = addHours(startTime, 1);
    if (diningEndTime <= startTime) {
      document.getElementById('diningTimeError').textContent = 'Selected time would extend past midnight. Please choose an earlier time.';
      document.getElementById('diningTimeError').hidden = false;
      document.getElementById('diningTime').focus();
      return;
    }

    if (venue === 'Le Mansion' && !shift) {
      alert('Please select a booking shift (Lunch or Dinner) for Le Mansion.');
      return;
    }
    if (venue === 'Le Mansion' && shift && SHIFT_TIMES[shift] && startTime) {
      const { start, end } = SHIFT_TIMES[shift];
      if (startTime < start || startTime > end) {
        alert(`${shift} shift only accepts times between ${SHIFT_TIMES[shift].start === '12:00' ? '12:00 PM – 3:00 PM' : '6:00 PM – 10:00 PM'}.`);
        return;
      }
    }

    const rows = [
      ['Venue', venue],
      ...(shift ? [['Shift', shift]] : []),
      ['Date',  date],
      ['Time',  formatDisplayTime(startTime)],
      ['Pax',   pax],
      ...(notes ? [['Notes', notes]] : []),
    ];

    showSummary(rows, 'diningModal', async () => {
      try {
        const res  = await authFetch(`${API_BASE}/api/booking`, {
          method: 'POST',
          body:   JSON.stringify({
            email:             member.email,
            name:              member.name,
            membership_number: member.membership_number,
            facility_or_venue: venue,
            calendar_id:       calendarId,
            booking_shift:     shift || '',
            slot_date:         date,
            slot_start_time:   startTime,
            slot_end_time:     addHours(startTime, 1),
            outlet_pax:        pax,
            booking_type:      'dining',
            special_request:   notes || '',
          }),
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          document.getElementById('summaryModal').close();
          document.getElementById('diningModal').showModal();
          const errEl = document.getElementById('diningCapacityError');
          errEl.textContent = data.message || 'Reservation failed. Please try again.';
          errEl.hidden = false;
          return;
        }

        document.getElementById('diningCapacityError').hidden = true;
        document.getElementById('diningForm').reset();
        document.getElementById('diningShiftLabel').style.display = 'none';
        document.getElementById('diningShift').required = false;
        loadBookings();
        showConfirmation({
          venue:     venue,
          date:      date,
          time:      startTime,
          pax:       pax,
          reference: data.booking_reference,
        });
      } catch {
        alert('Unable to connect to the server. Please try again.');
      }
    });
  });

  // ── Guest registration form ────────────────────────────────────────────────
  let guestCount = 0;
  let guestQuotaRemaining = 4;   // refreshed from backend when modal opens
  let guestQuotaUsed      = 0;
  const guestContainer = document.getElementById('guestContainer');
  const addGuestBtn    = document.getElementById('addGuestBtn');
  const guestQuotaInfo = document.getElementById('guestQuotaInfo');

  // Fetch current monthly guest-pass usage from backend; falls back to 4 if
  // the call fails so the form is still usable (backend will reject overages).
  async function loadGuestQuota() {
    try {
      const res  = await authFetch(`${API_BASE}/api/member/guest-quota`);
      const data = await res.json();
      if (data && data.success) {
        guestQuotaUsed      = data.used;
        guestQuotaRemaining = data.remaining;
      }
    } catch {
      guestQuotaUsed      = 0;
      guestQuotaRemaining = 4;
    }
    renderGuestQuotaInfo();
    updateAddGuestBtn();
  }

  function renderGuestQuotaInfo() {
    if (!guestQuotaInfo) return;
    if (guestQuotaRemaining <= 0) {
      guestQuotaInfo.textContent = `You have reached your monthly limit of 4 guests (${guestQuotaUsed}/4 used). The quota resets on the 1st of next month.`;
      guestQuotaInfo.style.color = '#c0392b';
    } else {
      const noun = guestQuotaRemaining === 1 ? 'guest' : 'guests';
      guestQuotaInfo.textContent = `You can register ${guestQuotaRemaining} more ${noun} this month (${guestQuotaUsed}/4 used).`;
      guestQuotaInfo.style.color = '';
    }
    guestQuotaInfo.style.display = '';
  }

  // Renders guest fieldsets, restoring supplied values into the inputs.
  // Always pass the values you want to appear; omit to render empty fields.
  function renderGuestFields(savedNames = [], savedEmails = [], savedPhones = []) {
    guestContainer.innerHTML = '';

    for (let i = 0; i < guestCount; i++) {
      const block = document.createElement('div');
      block.className = 'guest-fieldset';
      block.innerHTML = `
        <div class="guest-fieldset__header">
          <span class="guest-fieldset__title">Guest ${i + 1}</span>
          <button type="button" class="btn-remove-guest" data-index="${i}">Remove</button>
        </div>
        <label>Full Name <input type="text"  class="guestName"  required /></label>
        <label>Email     <input type="email" class="guestEmail" required /></label>
        <label>Phone (optional) <input type="tel" class="guestPhone" /></label>
      `;
      guestContainer.appendChild(block);
    }

    // Restore passed-in values
    document.querySelectorAll('.guestName').forEach((el, i)  => { el.value = savedNames[i]  || ''; });
    document.querySelectorAll('.guestEmail').forEach((el, i) => { el.value = savedEmails[i] || ''; });
    document.querySelectorAll('.guestPhone').forEach((el, i) => { el.value = savedPhones[i] || ''; });

    // Wire up remove buttons
    guestContainer.querySelectorAll('.btn-remove-guest').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx    = parseInt(btn.dataset.index, 10);
        const names  = Array.from(document.querySelectorAll('.guestName')).map(el => el.value);
        const emails = Array.from(document.querySelectorAll('.guestEmail')).map(el => el.value);
        const phones = Array.from(document.querySelectorAll('.guestPhone')).map(el => el.value);
        names.splice(idx, 1);
        emails.splice(idx, 1);
        phones.splice(idx, 1);
        guestCount--;
        renderGuestFields(names, emails, phones);
      });
    });

    updateAddGuestBtn();
  }

  function updateAddGuestBtn() {
    const limit = guestQuotaRemaining;
    if (limit <= 0) {
      addGuestBtn.disabled    = true;
      addGuestBtn.textContent = 'Monthly limit reached';
    } else if (guestCount >= limit) {
      addGuestBtn.disabled    = true;
      addGuestBtn.textContent = `+ Add Guest (max ${limit} this month)`;
    } else {
      addGuestBtn.disabled    = false;
      addGuestBtn.textContent = '+ Add Guest';
    }
  }

  addGuestBtn.addEventListener('click', () => {
    if (guestCount >= guestQuotaRemaining) return;
    // Capture current field values before incrementing so they survive re-render
    const names  = Array.from(document.querySelectorAll('.guestName')).map(el => el.value);
    const emails = Array.from(document.querySelectorAll('.guestEmail')).map(el => el.value);
    const phones = Array.from(document.querySelectorAll('.guestPhone')).map(el => el.value);
    guestCount++;
    renderGuestFields(names, emails, phones);
  });

  document.getElementById('guestForm').addEventListener('submit', (e) => {
    e.preventDefault();

    if (!guestCount) {
      alert('Please add at least one guest.');
      return;
    }

    // Belt-and-braces check — also runs server-side, but catch over-quota
    // submissions before sending so the user gets an immediate, clear message.
    if (guestCount > guestQuotaRemaining) {
      alert(`You can only register ${guestQuotaRemaining} more guest(s) this month. Please remove ${guestCount - guestQuotaRemaining} guest(s) from this form.`);
      return;
    }

    const names      = Array.from(document.querySelectorAll('.guestName')).map(el => el.value.trim());
    const emails     = Array.from(document.querySelectorAll('.guestEmail')).map(el => el.value.trim());
    const phones     = Array.from(document.querySelectorAll('.guestPhone')).map(el => el.value.trim());
    const visitDate  = document.getElementById('guestVisitDate').value;
    const facility   = document.getElementById('guestFacility').value;
    const guestShift = document.getElementById('guestShift').value;

    if (names.some(n => !n) || emails.some(em => !em) || !visitDate || !facility) {
      alert('Please complete all required fields, select a facility, and set a visit date.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmail = emails.find(em => !emailRegex.test(em));
    if (invalidEmail) {
      alert(`"${invalidEmail}" is not a valid email address. Please enter a valid guest email.`);
      return;
    }
    const phoneRegex = /^\+?[\d\s\-(). ]{7,20}$/;
    const invalidPhone = phones.find(p => p && !phoneRegex.test(p));
    if (invalidPhone) {
      alert(`Invalid phone number: "${invalidPhone}". Please enter digits only (e.g. +6512345678).`);
      return;
    }
    const todayGuest = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    if (visitDate < todayGuest) {
      document.getElementById('guestDateError').hidden = false;
      document.getElementById('guestVisitDate').focus();
      return;
    }
    document.getElementById('guestDateError').hidden = true;
    if (facility === 'Le Mansion' && !guestShift) {
      alert('Please select a booking shift (Lunch or Dinner) for Le Mansion.');
      return;
    }

    const rows = [
      ['Facility', facility],
      ...(guestShift ? [['Shift', guestShift]] : []),
      ['Date',   visitDate],
      ['Guests', String(guestCount)],
      ...names.map((name, i) => [`Guest ${i + 1}`, `${name} (${emails[i]})`]),
    ];

    showSummary(rows, 'guestModal', async () => {
      try {
        // Register guests one at a time so the backend's per-request quota
        // check sees the count after the previous insert — eliminates the
        // race window that allowed parallel requests to all pass a stale check.
        const results = [];
        for (let idx = 0; idx < names.length; idx++) {
          const res = await authFetch(`${API_BASE}/api/guest-registration`, {
            method: 'POST',
            body:   JSON.stringify({
              email:              member.email,
              guest_name:         names[idx],
              guest_email:        emails[idx],
              guest_phone:        phones[idx] || '',
              inviting_member_id: member.membership_number,
              slot_date:          visitDate,
              facility_or_venue:  facility,
              booking_shift:      guestShift || '',
            }),
          });
          results.push(await res.json());
        }

        const failed = results.filter(r => !r.success);
        if (failed.length) {
          document.getElementById('summaryModal').close();
          document.getElementById('guestModal').showModal();
          const errEl = document.getElementById('guestCapacityError');
          errEl.textContent = failed[0].message || `${failed.length} guest(s) failed to register. Please try again.`;
          errEl.hidden = false;
          return;
        }

        document.getElementById('guestCapacityError').hidden = true;
        // Build guest confirmation data with booking references
        const guestResults = results.map((r, i) => ({
          name:              names[i],
          email:             emails[i],
          booking_reference: r.booking_reference || '—',
        }));

        // Reset guest form
        guestCount = 0;
        renderGuestFields();
        document.getElementById('guestForm').reset();
        document.getElementById('guestShiftLabel').style.display = 'none';
        document.getElementById('guestShift').required = false;

        // Refresh bookings (includes guest panel) and show confirmation with QR codes
        loadBookings();
        showGuestConfirmation(guestResults);

      } catch {
        alert('Unable to connect to the server. Please try again.');
      }
    });
  });

  // ── View all bookings (modal) ─────────────────────────────────────────────
  const allBookingsModal   = document.getElementById('allBookingsModal');
  const allBookingsList    = document.getElementById('allBookingsList');
  const allBookingsCount   = document.getElementById('allBookingsCount');
  const allBookingsChips   = document.querySelectorAll('.all-bookings__chip');
  let   _allBookingsCache  = [];
  let   _allBookingsFilter = 'all';

  function escapeAll(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function monthAbbr(dateStr) {
    if (!dateStr) return '';
    const m = new Date(dateStr + 'T00:00:00+08:00');
    if (isNaN(m.getTime())) return '';
    return m.toLocaleDateString('en-SG', { month: 'short', timeZone: 'Asia/Singapore' }).toUpperCase();
  }

  function dayNum(dateStr) {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    return parts[2] ? parseInt(parts[2], 10) : '—';
  }

  function renderAllBookings() {
    const todaySG = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    const PAST = ['cancelled', 'late-cancellation', 'checked-in', 'no-show', 'completed', 'done', 'late-fee-paid'];

    let list = _allBookingsCache.slice();
    if (_allBookingsFilter === 'upcoming') {
      list = list.filter(b => {
        const key = (b.booking_status || 'confirmed').toLowerCase().replace(/[\s_]+/g, '-');
        if (PAST.includes(key)) return false;
        return (b.slot_date || '') >= todaySG;
      });
    } else if (_allBookingsFilter === 'past') {
      list = list.filter(b => {
        const key = (b.booking_status || 'confirmed').toLowerCase().replace(/[\s_]+/g, '-');
        if (PAST.includes(key)) return true;
        return (b.slot_date || '') < todaySG;
      });
    }

    // Newest first
    list.sort((a, b) => (b.slot_date || '').localeCompare(a.slot_date || ''));

    allBookingsCount.textContent = `${list.length} ${list.length === 1 ? 'booking' : 'bookings'}${_allBookingsFilter !== 'all' ? ' · ' + _allBookingsFilter : ''}`;

    if (!list.length) {
      allBookingsList.innerHTML = '<p class="all-bookings__empty">No bookings to show.</p>';
      return;
    }

    allBookingsList.innerHTML = list.map(b => {
      const statusKey = (b.booking_status || 'confirmed').toLowerCase().replace(/[\s_]+/g, '-');
      const statusDisp = (b.booking_status || 'Confirmed').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const startTime = b.slot_start_time ? formatDisplayTime(b.slot_start_time) : (b.booking_shift || '—');
      const endTime   = b.slot_end_time ? ' – ' + formatDisplayTime(b.slot_end_time) : '';
      const venue     = escapeAll(b.facility_or_venue || '—');
      const ref       = escapeAll(b.booking_reference || '—');
      return `
        <article class="all-bookings__item">
          <div class="all-bookings__date">
            <span class="all-bookings__date-day">${dayNum(b.slot_date)}</span>
            <span class="all-bookings__date-month">${monthAbbr(b.slot_date)}</span>
          </div>
          <div class="all-bookings__main">
            <span class="all-bookings__venue">${venue}</span>
            <span class="all-bookings__meta">${escapeAll(startTime)}${escapeAll(endTime)}${b.outlet_pax ? ' · ' + escapeAll(b.outlet_pax) + ' pax' : ''}</span>
            <span class="all-bookings__ref">${ref}</span>
          </div>
          <span class="all-bookings__status all-bookings__status--${statusKey}">${escapeAll(statusDisp)}</span>
        </article>`;
    }).join('');
  }

  allBookingsChips.forEach(chip => {
    chip.addEventListener('click', () => {
      allBookingsChips.forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      _allBookingsFilter = chip.dataset.filter;
      renderAllBookings();
    });
  });

  document.getElementById('viewAllBtn').addEventListener('click', async () => {
    allBookingsList.innerHTML = '<p class="all-bookings__empty">Loading your bookings…</p>';
    allBookingsCount.textContent = 'Loading…';
    allBookingsModal.showModal();
    document.getElementById('modalOverlay').hidden = false;
    try {
      const res  = await authFetch(`${API_BASE}/api/member/bookings`);
      const data = await res.json();
      // Backend filters by membership_number from JWT, so only this member's
      // records ever come back. Strip guest_pass entries — those belong to the
      // Registered Guests panel, not the member's personal booking list.
      const raw = (data && data.success && Array.isArray(data.bookings)) ? data.bookings : [];
      const isGuest = (t) => t === 'guest' || t === 'guest_pass';
      _allBookingsCache = raw.filter(b => !isGuest(b.booking_type));

      if (!_allBookingsCache.length) {
        allBookingsCount.textContent = '0 bookings';
        allBookingsList.innerHTML = '<p class="all-bookings__empty">You don\'t have any bookings yet.</p>';
        return;
      }
      renderAllBookings();
    } catch {
      allBookingsCount.textContent = 'Error';
      allBookingsList.innerHTML = '<p class="all-bookings__empty">Could not load your bookings. Please try again.</p>';
    }
  });

})();
