// Verve Platform — Demo Mode
// Intercepts every fetch() call to the live backend and answers it locally with
// an in-memory mock dataset, so this portfolio build never touches a real
// server or database. Must be loaded before any other <script> on the page.
(function () {
  'use strict';

  const API_BASE = 'https://backend-production-41dc3.up.railway.app';
  const GUEST_QUOTA = 4;

  // ─── time helpers (Asia/Singapore) ─────────────────────────────────────────
  function sgtNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
  }
  function ymd(d) {
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
  }
  function todayStr() { return ymd(sgtNow()); }
  function addDays(dateStr, n) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  }
  function combineSGT(dateStr, timeStr) {
    return new Date(`${dateStr}T${timeStr || '00:00'}:00+08:00`);
  }
  function isoNow() { return new Date().toISOString(); }
  function timeToMin(t) { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; }

  function uid(prefix) {
    return `${prefix}-${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
  }
  function bkRef(dateStr) {
    const suffix = String(Math.floor(Math.random() * 900) + 100);
    return `BK-${dateStr.replace(/-/g, '')}-${suffix}`;
  }

  function delay() { return new Promise((r) => setTimeout(r, 180 + Math.random() * 260)); }
  function json(data, status) {
    return new Response(JSON.stringify(data), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ─── facility config ────────────────────────────────────────────────────────
  const VENUES = {
    'Tennis':      { cap: 4,  type: 'slot' },
    'Squash':      { cap: 4,  type: 'slot' },
    'Gym':         { cap: 20, type: 'pax'  },
    'Le Mansion':  { cap: 15, type: 'pax'  },
    'Barkerslounge': { cap: 10, type: 'pax' },
    'Oasis':       { cap: 12, type: 'pax'  },
  };
  function venueMatch(facility, needle) {
    return (facility || '').toLowerCase().includes(needle);
  }

  // ─── seed data (dates are relative to "today" so the demo always looks live) ─
  const T = todayStr();
  const members = [
    { membership_number: 'VRV-0001', name: 'Ava Sinclair',  email: 'ava.sinclair@vrv.com',    phone: '+1 (702) 555-0161', membership_tier: 'Full Member', is_flagged: false },
    { membership_number: 'VRV-0002', name: 'Cole Bennett',    email: 'cole.bennett@vrv.com',      phone: '+1 (702) 555-0162', membership_tier: 'Full Member', is_flagged: true  },
    { membership_number: 'VRV-0003', name: 'Grace Holloway',   email: 'grace.holloway@vrv.com',     phone: '+1 (702) 555-0163', membership_tier: 'Full Member', is_flagged: false },
    { membership_number: 'VRV-0004', name: 'Everett Shaw', email: 'everett.shaw@vrv.com', phone: '+1 (702) 555-0164', membership_tier: 'Full Member', is_flagged: false },
  ];

  const accounts = [
    { username: 'staff',    password: 'staff123', type: 'staff',      role: 'frontdesk', displayName: 'Front Desk' },
    { username: 'security', password: 'staff123', type: 'staff',      role: 'security',  displayName: 'Security' },
    { username: 'fnb',      password: 'staff123', type: 'staff',      role: 'fnb',       displayName: 'F&B Manager' },
    { username: 'admin',    password: 'admin123', type: 'management', role: 'management', displayName: 'Admin' },
  ];

  function mkBooking(o) {
    return Object.assign({
      booking_reference: bkRef(o.slot_date || T),
      email: '', name: '', phone: '',
      facility_or_venue: '', booking_type: 'advance', booking_status: 'Confirmed',
      booking_shift: '', slot_date: T, slot_date_to: '', slot_start_time: '09:00', slot_end_time: '10:00',
      outlet_pax: '1', notes: '', special_request: '', guest_email: '', guest_phone: '',
      late_cancellation: false, fee_waived: false, waiver_reason: '', waiver_by: '',
      expiry_notified: false, source: 'member', created_by: '',
      createdAt: isoNow(), updatedAt: isoNow(),
    }, o);
  }

  let bookings = [
    // ── today: staff schedule / occupancy / dashboard ──
    mkBooking({ membership_number: 'VRV-0001', email: 'ava.sinclair@vrv.com', name: 'Ava Sinclair', facility_or_venue: 'Tennis', slot_date: T, slot_start_time: '09:00', slot_end_time: '10:00', booking_status: 'Confirmed' }),
    mkBooking({ membership_number: 'VRV-0002', email: 'cole.bennett@vrv.com', name: 'Cole Bennett', facility_or_venue: 'Squash', slot_date: T, slot_start_time: '10:00', slot_end_time: '11:00', booking_status: 'Checked In' }),
    mkBooking({ membership_number: 'VRV-0003', email: 'grace.holloway@vrv.com', name: 'Grace Holloway', facility_or_venue: 'Gym', slot_date: T, slot_start_time: '07:00', slot_end_time: '08:00', booking_status: 'Completed', outlet_pax: '1' }),
    mkBooking({ membership_number: 'VRV-0004', email: 'everett.shaw@vrv.com', name: 'Everett Shaw', facility_or_venue: 'Le Mansion', booking_shift: 'Lunch', slot_date: T, slot_start_time: '12:00', slot_end_time: '13:00', outlet_pax: '4', booking_status: 'Confirmed' }),
    mkBooking({ membership_number: 'VRV-0001', email: 'ava.sinclair@vrv.com', name: 'Ava Sinclair', facility_or_venue: 'Oasis', booking_shift: 'Dinner', slot_date: T, slot_start_time: '19:00', slot_end_time: '20:00', outlet_pax: '2', booking_status: 'Confirmed', notes: 'Window seat please', special_request: 'Window seat please', booking_type: 'dining' }),
    mkBooking({ booking_reference: uid('WK'), membership_number: 'WALKIN', email: '', name: 'Wyatt Reese', facility_or_venue: 'Tennis', slot_date: T, slot_start_time: '15:00', slot_end_time: '16:00', outlet_pax: '1', booking_status: 'Walkin', booking_type: 'walkin', source: 'walkin', created_by: 'staff', notes: 'Phone: +1 (702) 555-0177' }),
    mkBooking({ membership_number: 'VRV-0001', email: 'ava.sinclair@vrv.com', name: 'Harper Quinn', facility_or_venue: 'Barkerslounge', slot_date: T, slot_start_time: '18:30', slot_end_time: '19:30', outlet_pax: '1', booking_status: 'Confirmed', booking_type: 'guest_pass', source: 'guest_pass', guest_email: 'harper.quinn@vrv.com', guest_phone: '+1 (702) 555-0188' }),

    // ── today: more variety so the management KPI dashboard isn't empty ──
    mkBooking({ membership_number: 'VRV-0003', email: 'grace.holloway@vrv.com', name: 'Grace Holloway', facility_or_venue: 'Tennis', slot_date: T, slot_start_time: '11:00', slot_end_time: '12:00', booking_status: 'Confirmed' }),
    mkBooking({ membership_number: 'VRV-0004', email: 'everett.shaw@vrv.com', name: 'Everett Shaw', facility_or_venue: 'Squash', slot_date: T, slot_start_time: '14:00', slot_end_time: '15:00', booking_status: 'Checked In' }),
    mkBooking({ membership_number: 'VRV-0002', email: 'cole.bennett@vrv.com', name: 'Cole Bennett', facility_or_venue: 'Gym', slot_date: T, slot_start_time: '09:00', slot_end_time: '10:00', outlet_pax: '1', booking_status: 'Confirmed' }),
    mkBooking({ membership_number: 'VRV-0001', email: 'ava.sinclair@vrv.com', name: 'Ava Sinclair', facility_or_venue: 'Gym', slot_date: T, slot_start_time: '09:00', slot_end_time: '10:00', outlet_pax: '1', booking_status: 'Checked In' }),
    mkBooking({ membership_number: 'VRV-0003', email: 'grace.holloway@vrv.com', name: 'Grace Holloway', facility_or_venue: 'Le Mansion', booking_shift: 'Dinner', slot_date: T, slot_start_time: '19:00', slot_end_time: '20:00', outlet_pax: '2', booking_status: 'Confirmed', booking_type: 'dining' }),
    mkBooking({ membership_number: 'VRV-0002', email: 'cole.bennett@vrv.com', name: 'Cole Bennett', facility_or_venue: 'Barkerslounge', slot_date: T, slot_start_time: '17:00', slot_end_time: '18:00', outlet_pax: '3', booking_status: 'Confirmed', booking_type: 'dining' }),
    mkBooking({ membership_number: 'VRV-0004', email: 'everett.shaw@vrv.com', name: 'Everett Shaw', facility_or_venue: 'Oasis', booking_shift: 'Lunch', slot_date: T, slot_start_time: '12:30', slot_end_time: '13:30', outlet_pax: '2', booking_status: 'Confirmed', booking_type: 'dining' }),
    mkBooking({ membership_number: 'VRV-0003', email: 'grace.holloway@vrv.com', name: 'Grace Holloway', facility_or_venue: 'Squash', slot_date: T, slot_start_time: '08:00', slot_end_time: '09:00', booking_status: 'No Show' }),
    mkBooking({ membership_number: 'VRV-0004', email: 'everett.shaw@vrv.com', name: 'Everett Shaw', facility_or_venue: 'Tennis', slot_date: T, slot_start_time: '13:00', slot_end_time: '14:00', booking_status: 'No Show' }),
    mkBooking({ membership_number: 'VRV-0002', email: 'cole.bennett@vrv.com', name: 'Cole Bennett', facility_or_venue: 'Gym', slot_date: T, slot_start_time: '16:00', slot_end_time: '17:00', outlet_pax: '1', booking_status: 'Cancelled' }),
    mkBooking({ membership_number: 'VRV-0003', email: 'grace.holloway@vrv.com', name: 'Grace Holloway', facility_or_venue: 'Tennis', slot_date: T, slot_start_time: '17:00', slot_end_time: '18:00', booking_status: 'Cancelled', late_cancellation: true, fee_waived: false }),
    mkBooking({ membership_number: 'VRV-0004', email: 'everett.shaw@vrv.com', name: 'Everett Shaw', facility_or_venue: 'Squash', slot_date: T, slot_start_time: '15:00', slot_end_time: '16:00', booking_status: 'Cancelled', late_cancellation: true, fee_waived: false }),
    mkBooking({ membership_number: 'VRV-0001', email: 'ava.sinclair@vrv.com', name: 'Owen Brooks', facility_or_venue: 'Barkerslounge', slot_date: T, slot_start_time: '20:00', slot_end_time: '21:00', outlet_pax: '1', booking_status: 'Confirmed', booking_type: 'guest_pass', source: 'guest_pass', guest_email: 'owen.brooks@vrv.com', guest_phone: '+1 (702) 555-0191' }),
    mkBooking({ membership_number: 'VRV-0002', email: 'cole.bennett@vrv.com', name: 'Mia Chen', facility_or_venue: 'Oasis', booking_shift: 'Lunch', slot_date: T, slot_start_time: '13:00', slot_end_time: '14:00', outlet_pax: '1', booking_status: 'Confirmed', booking_type: 'guest_pass', source: 'guest_pass', guest_email: 'mia.chen@vrv.com', guest_phone: '+1 (702) 555-0192' }),
    mkBooking({ booking_reference: uid('WK'), membership_number: 'WALKIN', email: '', name: 'Nora Kim', facility_or_venue: 'Gym', slot_date: T, slot_start_time: '10:30', slot_end_time: '11:30', outlet_pax: '1', booking_status: 'Walkin', booking_type: 'walkin', source: 'walkin', created_by: 'staff', notes: 'Phone: +1 (702) 555-0193' }),
    mkBooking({ booking_reference: uid('WK'), membership_number: 'WALKIN', email: '', name: 'Leo Park', facility_or_venue: 'Squash', slot_date: T, slot_start_time: '16:00', slot_end_time: '17:00', outlet_pax: '1', booking_status: 'Walkin', booking_type: 'walkin', source: 'walkin', created_by: 'staff', notes: 'Phone: +1 (702) 555-0194' }),

    // ── future ──
    mkBooking({ membership_number: 'VRV-0001', email: 'ava.sinclair@vrv.com', name: 'Ava Sinclair', facility_or_venue: 'Tennis', slot_date: addDays(T, 4), slot_start_time: '09:00', slot_end_time: '10:00', booking_status: 'Confirmed' }),
    mkBooking({ membership_number: 'VRV-0002', email: 'cole.bennett@vrv.com', name: 'Cole Bennett', facility_or_venue: 'Gym', slot_date: addDays(T, 2), slot_start_time: '17:00', slot_end_time: '18:00', booking_status: 'Confirmed' }),

    // ── past: completed / cancelled / no-shows / late-cancellations ──
    mkBooking({ membership_number: 'VRV-0001', email: 'ava.sinclair@vrv.com', name: 'Ava Sinclair', facility_or_venue: 'Gym', slot_date: addDays(T, -9), slot_start_time: '08:00', slot_end_time: '09:00', booking_status: 'Completed' }),
    mkBooking({ membership_number: 'VRV-0001', email: 'ava.sinclair@vrv.com', name: 'Ava Sinclair', facility_or_venue: 'Squash', slot_date: addDays(T, -16), slot_start_time: '11:00', slot_end_time: '12:00', booking_status: 'Cancelled' }),
    mkBooking({ membership_number: 'VRV-0001', email: 'ava.sinclair@vrv.com', name: 'Ava Sinclair', facility_or_venue: 'Le Mansion', booking_shift: 'Dinner', slot_date: addDays(T, -7), slot_start_time: '19:00', slot_end_time: '20:00', outlet_pax: '2', booking_status: 'Cancelled', late_cancellation: true, fee_waived: false, booking_type: 'dining' }),
    mkBooking({ membership_number: 'VRV-0003', email: 'grace.holloway@vrv.com', name: 'Grace Holloway', facility_or_venue: 'Tennis', slot_date: addDays(T, -8), slot_start_time: '09:00', slot_end_time: '10:00', booking_status: 'Cancelled', late_cancellation: true, fee_waived: true, waiver_reason: 'Family emergency', waiver_by: 'staff' }),
    mkBooking({ membership_number: 'VRV-0002', email: 'cole.bennett@vrv.com', name: 'Cole Bennett', facility_or_venue: 'Squash', slot_date: addDays(T, -3), slot_start_time: '10:00', slot_end_time: '11:00', booking_status: 'Cancelled', late_cancellation: true, fee_waived: false }),

    // ── no-shows (Bob x4 -> flagged/amber, David x2) ──
    mkBooking({ membership_number: 'VRV-0002', email: 'cole.bennett@vrv.com', name: 'Cole Bennett', facility_or_venue: 'Squash', slot_date: addDays(T, -2), slot_start_time: '09:00', slot_end_time: '10:00', booking_status: 'No Show' }),
    mkBooking({ membership_number: 'VRV-0002', email: 'cole.bennett@vrv.com', name: 'Cole Bennett', facility_or_venue: 'Tennis', slot_date: addDays(T, -5), slot_start_time: '09:00', slot_end_time: '10:00', booking_status: 'No Show' }),
    mkBooking({ membership_number: 'VRV-0002', email: 'cole.bennett@vrv.com', name: 'Cole Bennett', facility_or_venue: 'Squash', slot_date: addDays(T, -12), slot_start_time: '09:00', slot_end_time: '10:00', booking_status: 'No Show' }),
    mkBooking({ membership_number: 'VRV-0002', email: 'cole.bennett@vrv.com', name: 'Cole Bennett', facility_or_venue: 'Gym', slot_date: addDays(T, -20), slot_start_time: '09:00', slot_end_time: '10:00', booking_status: 'No Show' }),
    mkBooking({ membership_number: 'VRV-0004', email: 'everett.shaw@vrv.com', name: 'Everett Shaw', facility_or_venue: 'Tennis', slot_date: addDays(T, -6), slot_start_time: '14:00', slot_end_time: '15:00', booking_status: 'No Show' }),
    mkBooking({ membership_number: 'VRV-0004', email: 'everett.shaw@vrv.com', name: 'Everett Shaw', facility_or_venue: 'Oasis', slot_date: addDays(T, -14), slot_start_time: '18:00', slot_end_time: '19:00', booking_status: 'No Show' }),

    // ── another guest pass this month, from Bob, for the Guest Audit page ──
    mkBooking({ membership_number: 'VRV-0002', email: 'cole.bennett@vrv.com', name: 'Nolan Pierce', facility_or_venue: 'Oasis', slot_date: addDays(T, -1), slot_start_time: '12:00', slot_end_time: '13:00', outlet_pax: '1', booking_status: 'Confirmed', booking_type: 'guest_pass', source: 'guest_pass', guest_email: 'nolan.pierce@vrv.com', guest_phone: '' }),

    // ── facility block ──
    mkBooking({ booking_reference: uid('BLK'), membership_number: 'MGMT', email: 'block@vrv.internal', name: 'BLOCK: Court resurfacing', facility_or_venue: 'Tennis', slot_date: addDays(T, 2), slot_date_to: addDays(T, 3), slot_start_time: '00:00', slot_end_time: '23:59', booking_type: 'block', booking_status: 'Confirmed', notes: 'Court resurfacing', created_by: 'admin', source: 'management' }),
  ];

  let events = [
    {
      _id: uid('evt'), event_name: 'Members’ Night: Wine & Canapes', event_description: 'An evening of curated wines and light bites in the Lounge — members and one guest each welcome.',
      event_date: addDays(T, 10), event_duration: '7:00pm - 10:00pm', event_venue: 'Lounge 1962',
      image_url: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?q=80&w=1600&auto=format&fit=crop', pdf_url: '', pdf_filename: '', created_by: 'Admin', status: 'active',
      createdAt: isoNow(), updatedAt: isoNow(),
    },
    {
      _id: uid('evt'), event_name: 'Junior Tennis Clinic', event_description: 'A weekend clinic for junior members, ages 6-14, run by our resident coaches.',
      event_date: addDays(T, 18), event_duration: '9:00am - 11:00am', event_venue: 'Tennis Courts',
      image_url: 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?q=80&w=1600&auto=format&fit=crop', pdf_url: '', pdf_filename: '', created_by: 'Admin', status: 'active',
      createdAt: isoNow(), updatedAt: isoNow(),
    },
  ];

  let notifications = [
    {
      _id: uid('ntf'), type: 'notice', title: 'Facility Block: Tennis',
      message: `Tennis courts will be unavailable from ${addDays(T, 2)} to ${addDays(T, 3)} for court resurfacing.`,
      category: 'facility', reference_id: '', read_by: [], created_by: 'Management',
      createdAt: isoNow(), updatedAt: isoNow(),
    },
  ];
  let replies = [
    {
      _id: uid('rpl'), notification_id: notifications[0]._id, sender_type: 'member', sender_name: 'Ava Sinclair',
      membership_number: 'VRV-0001', message: 'Will the gym stay open during this period?', createdAt: isoNow(), updatedAt: isoNow(),
    },
  ];

  // ─── shared query helpers ───────────────────────────────────────────────────
  function findMember(num) { return members.find((m) => m.membership_number === (num || '').toUpperCase().trim()); }
  function overlaps(aStart, aEnd, bStart, bEnd) { return aStart < bEnd && aEnd > bStart; }
  function isActiveStatus(s) { return /^(confirmed|checkedin|walkin)$/i.test((s || '').replace(/[\s_-]+/g, '')); }
  function normStatus(s) { return (s || '').toLowerCase().replace(/[\s_-]+/g, ''); }

  function occupancyFor(dateStr, facility, startTime, endTime, excludeRef) {
    const cfg = VENUES[facility];
    if (!cfg) return { used: 0, cap: null, type: null };
    const rows = bookings.filter((b) =>
      b.slot_date === dateStr && b.facility_or_venue === facility &&
      b.booking_type !== 'block' && isActiveStatus(b.booking_status) &&
      b.booking_reference !== excludeRef &&
      overlaps(timeToMin(b.slot_start_time), timeToMin(b.slot_end_time), timeToMin(startTime), timeToMin(endTime))
    );
    const used = cfg.type === 'slot' ? rows.length : rows.reduce((s, b) => s + (parseInt(b.outlet_pax, 10) || 1), 0);
    return { used, cap: cfg.cap, type: cfg.type };
  }

  function isBlocked(dateStr, facility) {
    return bookings.some((b) =>
      b.booking_type === 'block' && b.booking_status !== 'Cancelled' &&
      venueMatch(facility, (b.facility_or_venue || '').toLowerCase()) &&
      dateStr >= b.slot_date && dateStr <= (b.slot_date_to || b.slot_date)
    );
  }

  function guestUsageThisMonth(membershipNumber) {
    const now = sgtNow();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return bookings.filter((b) =>
      b.membership_number === membershipNumber &&
      (b.booking_type === 'guest_pass' || b.booking_type === 'guest') &&
      normStatus(b.booking_status) !== 'cancelled' &&
      (b.slot_date || '').startsWith(monthPrefix)
    );
  }

  // ─── route handlers ─────────────────────────────────────────────────────────
  const routes = [];
  function on(method, pattern, handler) { routes.push({ method, re: pattern, handler }); }

  // -- auth --
  on('POST', /^\/api\/auth\/login$/, (m, body) => {
    const num = (body.membership_number || '').toUpperCase().trim();
    const mem = members.find((x) => x.membership_number === num && x.email.toLowerCase() === (body.email || '').toLowerCase().trim());
    if (!mem) return json({ success: false, message: 'Invalid membership number or email.' }, 401);
    return json({ success: true, token: uid('tok'), member: { membership_number: mem.membership_number, email: mem.email, name: mem.name, phone: mem.phone } });
  });
  on('POST', /^\/api\/auth\/staff\/login$/, (m, body) => {
    const acc = accounts.find((a) => a.type === 'staff' && a.username === (body.username || '').toLowerCase().trim() && a.password === body.password);
    if (!acc) return json({ success: false, message: 'Invalid username or password.' }, 401);
    return json({ success: true, token: uid('tok'), staff: { username: acc.username, role: acc.role, displayName: acc.displayName } });
  });
  on('POST', /^\/api\/auth\/management\/login$/, (m, body) => {
    const acc = accounts.find((a) => a.type === 'management' && a.username === (body.username || '').toLowerCase().trim() && a.password === body.password);
    if (!acc) return json({ success: false, message: 'Invalid username or password.' }, 401);
    return json({ success: true, token: uid('tok'), user: { username: acc.username, role: 'management', displayName: acc.displayName } });
  });

  // -- booking availability / create --
  on('GET', /^\/api\/booking\/availability$/, (m, body, qs) => {
    const facility = qs.get('facility') || '';
    const date = qs.get('date') || '';
    const cfg = VENUES[facility];
    if (!cfg) return json({ success: true, facility, date, slots: {}, cap: null, type: null });
    const slots = {};
    for (let mins = 6 * 60 + 30; mins <= 23 * 60 + 30; mins += 30) {
      const hh = String(Math.floor(mins / 60)).padStart(2, '0');
      const mm = String(mins % 60).padStart(2, '0');
      const t = `${hh}:${mm}`;
      const endMins = mins + 60;
      const endT = `${String(Math.floor(endMins / 60) % 24).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;
      const occ = occupancyFor(date, facility, t, endT);
      slots[t] = { used: occ.used, cap: cfg.cap, isFull: occ.used >= cfg.cap };
    }
    return json({ success: true, facility, date, cap: cfg.cap, type: cfg.type, slots });
  });

  on('POST', /^\/api\/booking\/?$/, (m, body) => {
    const { facility_or_venue, slot_date, slot_start_time, slot_end_time } = body;
    if (slot_date < todayStr()) return json({ success: false, message: 'Cannot book on a past date.' }, 422);
    if (timeToMin(slot_end_time) <= timeToMin(slot_start_time)) return json({ success: false, message: 'Booking end time must be after start time and cannot span past midnight.' }, 422);
    if (isBlocked(slot_date, facility_or_venue)) return json({ success: false, message: `${facility_or_venue} is not available on ${slot_date} due to a scheduled maintenance block.` }, 409);
    const cfg = VENUES[facility_or_venue];
    if (cfg) {
      const occ = occupancyFor(slot_date, facility_or_venue, slot_start_time, slot_end_time);
      const need = cfg.type === 'slot' ? 1 : (parseInt(body.outlet_pax, 10) || 1);
      if (occ.used + need > cfg.cap) {
        return json({ success: false, message: `${facility_or_venue} is fully booked from ${slot_start_time} to ${slot_end_time} on ${slot_date}. Please choose a different time.` }, 409);
      }
    }
    const ref = bkRef(slot_date);
    const b = mkBooking({
      booking_reference: ref, email: body.email, name: body.name, phone: body.phone || '',
      membership_number: (body.membership_number || '').toUpperCase().trim(), facility_or_venue,
      booking_shift: body.booking_shift || '', slot_date, slot_start_time, slot_end_time,
      outlet_pax: String(body.outlet_pax || '1'), notes: body.special_request || '', special_request: body.special_request || '',
      booking_type: body.booking_type || 'advance', source: body.calendar_id === undefined && body.staff_id ? 'staff' : 'member',
    });
    bookings.push(b);
    return json({ success: true, message: 'Booking confirmed. A confirmation has been sent to your email.', booking_reference: ref });
  });

  // -- cancellation --
  on('POST', /^\/api\/cancellation\/?$/, (m, body) => {
    const b = bookings.find((x) => x.booking_reference === body.booking_reference);
    if (!b) return json({ success: false, message: 'Booking not found.' }, 404);
    const st = normStatus(b.booking_status);
    if (st === 'cancelled' || st === 'latecancellation') return json({ success: false, message: 'This booking has already been cancelled.' }, 409);
    if (st === 'checkedin') return json({ success: false, message: 'You have already checked in for this booking. Please speak to a staff member if you need to leave early.' }, 409);
    if (st === 'completed' || st === 'latefeepaid') return json({ success: false, message: 'This booking has already been completed and can no longer be cancelled.' }, 409);
    if (st === 'noshow') return json({ success: false, message: 'This booking was marked as a no-show and can no longer be cancelled.' }, 409);
    const isLate = sgtNow() > new Date(combineSGT(b.slot_date, b.slot_start_time).getTime() - 24 * 60 * 60 * 1000);
    b.booking_status = 'Cancelled';
    b.updatedAt = isoNow();
    if (isLate) {
      b.late_cancellation = true;
      return json({ success: true, message: 'Booking cancelled. Because this is within 24 hours of the appointment, it is recorded as a late cancellation and a fee may apply.' });
    }
    return json({ success: true, message: 'Booking cancelled successfully. A confirmation has been sent to your email.' });
  });

  // -- member: bookings / quota / profile / edit --
  on('GET', /^\/api\/member\/bookings$/, (m, body, qs, ctx) => {
    const num = ctx.membership_number;
    return json({ success: true, count: bookings.filter((b) => b.membership_number === num).length, bookings: bookings.filter((b) => b.membership_number === num) });
  });
  on('GET', /^\/api\/member\/guest-quota$/, (m, body, qs, ctx) => {
    const used = guestUsageThisMonth(ctx.membership_number).length;
    return json({ success: true, used, max: GUEST_QUOTA, remaining: Math.max(0, GUEST_QUOTA - used) });
  });
  on('PUT', /^\/api\/member\/profile$/, (m, body, qs, ctx) => {
    const mem = findMember(ctx.membership_number);
    if (mem) { mem.name = body.name || mem.name; mem.email = body.email || mem.email; mem.phone = body.phone || mem.phone; }
    return json({ success: true, member: mem });
  });
  on('PUT', /^\/api\/member\/bookings\/([^/]+)$/, (m, body) => {
    const b = bookings.find((x) => x.booking_reference === decodeURIComponent(m[1]));
    if (!b) return json({ success: false, message: 'Booking not found.' }, 404);
    const locked = ['cancelled', 'latecancellation', 'checkedin', 'noshow', 'completed', 'done', 'latefeepaid'];
    if (locked.includes(normStatus(b.booking_status))) return json({ success: false, message: 'This booking can no longer be edited.' }, 400);
    const slot_date = body.slot_date || b.slot_date, s = body.slot_start_time || b.slot_start_time, e = body.slot_end_time || b.slot_end_time;
    if (slot_date < todayStr()) return json({ success: false, message: 'Cannot book on a past date.' }, 422);
    if (timeToMin(e) <= timeToMin(s)) return json({ success: false, message: 'Booking end time must be after start time.' }, 422);
    const cfg = VENUES[b.facility_or_venue];
    if (cfg) {
      const occ = occupancyFor(slot_date, b.facility_or_venue, s, e, b.booking_reference);
      const need = cfg.type === 'slot' ? 1 : (parseInt(body.outlet_pax || b.outlet_pax, 10) || 1);
      if (occ.used + need > cfg.cap) return json({ success: false, message: `${b.facility_or_venue} is fully booked from ${s} to ${e} on ${slot_date}. Please choose a different time.` }, 409);
    }
    Object.assign(b, { slot_date, slot_start_time: s, slot_end_time: e, outlet_pax: String(body.outlet_pax || b.outlet_pax), notes: body.notes != null ? body.notes : b.notes, updatedAt: isoNow() });
    return json({ success: true, booking: b });
  });
  on('GET', /^\/api\/member\/([^/]+)$/, (m) => {
    const b = bookings.find((x) => x.booking_reference === decodeURIComponent(m[1]));
    if (!b) return json({ success: false, message: 'Booking reference not found.' }, 404);
    return json({ success: true, booking: b });
  });

  // -- guest registration --
  on('POST', /^\/api\/guest-registration\/?$/, (m, body, qs, ctx) => {
    const num = ctx.membership_number;
    const used = guestUsageThisMonth(num).length;
    if (used >= GUEST_QUOTA) return json({ success: false, message: `You have reached your monthly guest limit of ${GUEST_QUOTA}. You've already registered ${used} guest(s) this month. Your quota resets on the 1st of next month.` }, 429);
    if (isBlocked(body.slot_date, body.facility_or_venue)) return json({ success: false, message: `${body.facility_or_venue} is not available on ${body.slot_date} due to a scheduled maintenance block.` }, 409);
    const cfg = VENUES[body.facility_or_venue];
    if (cfg) {
      const sameDay = bookings.filter((b) => b.slot_date === body.slot_date && b.facility_or_venue === body.facility_or_venue && isActiveStatus(b.booking_status) && (body.booking_shift ? b.booking_shift === body.booking_shift : true));
      const used2 = cfg.type === 'slot' ? sameDay.length : sameDay.reduce((s, b) => s + (parseInt(b.outlet_pax, 10) || 1), 0);
      if (used2 >= cfg.cap) return json({ success: false, message: `${body.facility_or_venue}${body.booking_shift ? '(' + body.booking_shift + ')' : ''} is fully booked for ${body.slot_date}. Please choose a different date.` }, 409);
    }
    const ref = bkRef(body.slot_date);
    bookings.push(mkBooking({
      booking_reference: ref, membership_number: num, email: body.email, name: body.guest_name,
      facility_or_venue: body.facility_or_venue, booking_shift: body.booking_shift || '', slot_date: body.slot_date,
      slot_start_time: '12:00', slot_end_time: '13:00', outlet_pax: '1', booking_type: 'guest_pass', source: 'guest_pass',
      guest_email: body.guest_email, guest_phone: body.guest_phone || '',
    }));
    return json({ success: true, message: "Guest registered successfully. A confirmation has been sent to the member's email.", booking_reference: ref });
  });

  // -- check-in --
  on('POST', /^\/api\/checkin\/?$/, (m, body, qs, ctx) => {
    const b = bookings.find((x) => x.booking_reference === body.booking_reference);
    if (!b) return json({ success: false, valid: false, reason: 'INVALID_REFERENCE', message: 'Booking reference not found.' });
    if (normStatus(b.booking_status) === 'checkedin') return json({ success: false, valid: false, reason: 'ALREADY_CHECKED_IN', message: 'Member has already checked in.' });
    if (normStatus(b.booking_status) !== 'confirmed') return json({ success: false, valid: false, reason: 'INVALID_STATUS', message: `Booking status is ${b.booking_status}.` });
    if (b.slot_date !== todayStr()) return json({ success: false, valid: false, reason: 'WRONG_DATE', message: `Booking is for ${b.slot_date}, not today (${todayStr()}).` });
    const start = combineSGT(b.slot_date, b.slot_start_time), end = combineSGT(b.slot_date, b.slot_end_time), now = sgtNow();
    if (now < new Date(start.getTime() - 15 * 60 * 1000)) return json({ success: false, valid: false, reason: 'TOO_EARLY', message: `Booking starts at ${b.slot_start_time}. Please come back closer to the start time.` });
    if (now > end) return json({ success: false, valid: false, reason: 'TOO_LATE', message: `Booking ended at ${b.slot_end_time}. Please make a new booking.` });
    b.booking_status = 'Checked In';
    b.updatedAt = isoNow();
    return json({ success: true, valid: true, message: 'Check-in confirmed.', contact: { name: b.name, email: b.email, booking_reference: b.booking_reference, facility_or_venue: b.facility_or_venue, slot_date: b.slot_date } });
  });

  // -- walk-in --
  on('POST', /^\/api\/walkin\/?$/, (m, body) => {
    const now = sgtNow();
    const ref = uid('WK');
    bookings.push(mkBooking({
      booking_reference: ref, membership_number: 'WALKIN', name: body.name, facility_or_venue: body.facility,
      slot_date: todayStr(), slot_start_time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      slot_end_time: '23:59', outlet_pax: String(body.pax || '1'), booking_type: 'walkin', booking_status: 'Walkin',
      source: 'walkin', created_by: body.staff_id || '', notes: body.phone ? `Phone: ${body.phone}` : '',
    }));
    return json({ success: true, message: 'Walk-in logged successfully.', booking_reference: ref });
  });

  // -- staff: schedule / fnb / member lookup / late cancellations / waive fee --
  on('GET', /^\/api\/staff\/schedule$/, (m, body, qs) => {
    let rows = bookings.filter((b) => b.slot_date === todayStr() && b.booking_type !== 'block');
    const type = qs.get('type'), venue = qs.get('venue');
    if (type) rows = rows.filter((b) => b.booking_type === type);
    if (venue) rows = rows.filter((b) => b.facility_or_venue === venue);
    return json({ success: true, date: todayStr(), count: rows.length, bookings: rows });
  });
  on('GET', /^\/api\/staff\/fnb$/, (m, body, qs) => {
    const fnbVenues = ['Le Mansion', 'Barkerslounge', 'Oasis'];
    let rows = bookings.filter((b) => b.slot_date === todayStr() && fnbVenues.includes(b.facility_or_venue));
    const venue = qs.get('venue'), shift = qs.get('shift');
    if (venue) rows = rows.filter((b) => b.facility_or_venue === venue);
    if (shift) rows = rows.filter((b) => b.booking_shift === shift);
    return json({ success: true, date: todayStr(), count: rows.length, bookings: rows });
  });
  on('GET', /^\/api\/staff\/member\/([^/]+)$/, (m) => {
    const mem = findMember(decodeURIComponent(m[1]));
    if (!mem) return json({ success: false, message: 'Member not found.' }, 404);
    const todays = bookings.filter((b) => b.membership_number === mem.membership_number && b.slot_date === todayStr());
    return json({ success: true, contact: { id: mem.membership_number, name: mem.name, membership_number: mem.membership_number, membership_tier: mem.membership_tier, email: mem.email, phone: mem.phone }, todays_bookings: todays });
  });
  on('GET', /^\/api\/staff\/late-cancellations$/, () => {
    const rows = bookings.filter((b) => b.late_cancellation && !b.fee_waived);
    return json({ success: true, count: rows.length, bookings: rows });
  });
  on('POST', /^\/api\/staff\/waive-fee$/, (m, body, qs, ctx) => {
    const b = bookings.find((x) => x.booking_reference === body.booking_reference);
    if (!b) return json({ success: false, message: 'Booking not found.' }, 404);
    b.fee_waived = true; b.waiver_reason = body.waiver_reason; b.waiver_by = ctx.username; b.updatedAt = isoNow();
    return json({ success: true, message: 'Fee waived.' });
  });

  // -- management: dashboard / schedule / occupancy / analytics --
  on('GET', /^\/api\/management\/dashboard$/, () => {
    const today = bookings.filter((b) => b.slot_date === todayStr() && b.booking_type !== 'block');
    const kpis = {
      total: today.length,
      checkedIn: today.filter((b) => normStatus(b.booking_status) === 'checkedin').length,
      noShows: today.filter((b) => normStatus(b.booking_status) === 'noshow').length,
      cancelled: today.filter((b) => normStatus(b.booking_status) === 'cancelled').length,
      lateCancel: today.filter((b) => b.late_cancellation).length,
      guests: today.filter((b) => b.booking_type === 'guest_pass').length,
      utilisation: Math.round((today.filter((b) => isActiveStatus(b.booking_status)).length / 80) * 100),
    };
    return json({ success: true, date: todayStr(), kpis });
  });
  on('GET', /^\/api\/management\/schedule$/, () => {
    const rows = bookings.filter((b) => b.slot_date === todayStr());
    return json({ success: true, date: todayStr(), count: rows.length, bookings: rows });
  });
  on('GET', /^\/api\/management\/occupancy$/, () => {
    function count(facility, shift) {
      const cfg = VENUES[facility];
      const rows = bookings.filter((b) => b.slot_date === todayStr() && b.facility_or_venue === facility && isActiveStatus(b.booking_status) && (shift ? b.booking_shift === shift : true));
      return cfg.type === 'slot' ? rows.length : rows.reduce((s, b) => s + (parseInt(b.outlet_pax, 10) || 1), 0);
    }
    return json({
      success: true, date: todayStr(),
      venues: {
        tennis: { count: count('Tennis'), cap: 4 },
        squash: { count: count('Squash'), cap: 4 },
        gym: { count: count('Gym'), cap: 20 },
        leMansionLunch: { count: count('Le Mansion', 'Lunch'), cap: 15, buffer: 3 },
        leMansionDinner: { count: count('Le Mansion', 'Dinner'), cap: 15, buffer: 3 },
        barkers: { count: count('Barkerslounge'), cap: 10, buffer: 2 },
        oasis: { count: count('Oasis'), cap: 12, buffer: 2 },
      },
    });
  });
  on('GET', /^\/api\/management\/analytics$/, () => json({ success: true, count: bookings.length, bookings }));

  on('GET', /^\/api\/management\/contact\/([^/]+)$/, (m) => {
    const b = bookings.find((x) => x.booking_reference === decodeURIComponent(m[1]));
    return json({ success: true, booking: b || null, ghlContact: null });
  });
  on('PUT', /^\/api\/management\/override-status$/, (m, body) => {
    const b = bookings.find((x) => x.booking_reference === body.booking_reference);
    if (!b) return json({ success: false, message: 'Booking not found.' }, 404);
    const names = { Confirmed: 'Confirmed', 'Checked In': 'Checked In', Completed: 'Completed', Cancelled: 'Cancelled', 'No Show': 'No Show', 'Late Cancellation': 'Late Cancellation', late_fee_paid: 'Late Fee Paid' };
    if (body.new_status === 'Late Cancellation') { b.late_cancellation = true; b.booking_status = 'Cancelled'; }
    else if (body.new_status === 'late_fee_paid') { b.late_cancellation = true; b.booking_status = 'late_fee_paid'; }
    else b.booking_status = body.new_status;
    b.updatedAt = isoNow();
    return json({ success: true, message: `Booking marked as ${names[body.new_status] || body.new_status}.`, ghl_synced: true });
  });
  on('POST', /^\/api\/management\/add-note$/, (m, body) => {
    const b = bookings.find((x) => x.booking_reference === body.booking_reference);
    if (b) { b.notes = body.note; b.updatedAt = isoNow(); }
    return json({ success: true, message: 'Note saved.' });
  });

  // -- management: no-shows / guests / flag --
  on('GET', /^\/api\/management\/no-shows$/, () => {
    const groups = {};
    bookings.filter((b) => normStatus(b.booking_status) === 'noshow').forEach((b) => {
      const g = groups[b.membership_number] || (groups[b.membership_number] = { name: b.name, membership_number: b.membership_number, count: 0, mostRecent: '0000-00-00', facility: '' });
      g.count++;
      if (b.slot_date > g.mostRecent) { g.mostRecent = b.slot_date; g.facility = b.facility_or_venue; }
    });
    const list = Object.values(groups).map((g) => Object.assign(g, { is_flagged: !!(findMember(g.membership_number) || {}).is_flagged })).sort((a, b) => b.count - a.count);
    return json({ success: true, count: list.length, members: list });
  });
  on('POST', /^\/api\/management\/flag-member$/, (m, body) => {
    const mem = findMember(body.membership_number);
    if (mem) mem.is_flagged = true;
    return json({ success: true, message: 'Member flagged.' });
  });
  on('GET', /^\/api\/management\/guests$/, () => {
    const now = sgtNow();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const groups = {};
    bookings.filter((b) => (b.booking_type === 'guest_pass' || b.booking_type === 'guest') && normStatus(b.booking_status) !== 'cancelled' && (b.slot_date || '').startsWith(monthPrefix)).forEach((b) => {
      const mem = findMember(b.membership_number);
      const g = groups[b.membership_number] || (groups[b.membership_number] = { name: (mem || {}).name || b.membership_number, membership_number: b.membership_number, quota: GUEST_QUOTA, used: 0, remaining: GUEST_QUOTA, sameGuestMax: 0, records: [], _byName: {} });
      g.used++;
      g.remaining = Math.max(0, GUEST_QUOTA - g.used);
      g._byName[b.name] = (g._byName[b.name] || 0) + 1;
      g.sameGuestMax = Math.max(g.sameGuestMax, g._byName[b.name]);
      g.records.push({ booking_reference: b.booking_reference, guest_name: b.name, guest_email: b.guest_email, guest_phone: b.guest_phone, facility_or_venue: b.facility_or_venue, booking_shift: b.booking_shift, slot_date: b.slot_date, booking_status: b.booking_status, created_at: b.createdAt });
    });
    const list = Object.values(groups).map((g) => { delete g._byName; return g; });
    return json({ success: true, count: list.length, members: list });
  });

  // -- management: fees --
  on('GET', /^\/api\/management\/fees$/, () => {
    const rows = bookings.filter((b) => b.late_cancellation);
    return json({ success: true, count: rows.length, bookings: rows });
  });
  on('PUT', /^\/api\/management\/mark-paid$/, (m, body) => {
    const b = bookings.find((x) => x.booking_reference === body.booking_reference);
    if (b) { b.booking_status = 'late_fee_paid'; b.updatedAt = isoNow(); }
    return json({ success: true, message: 'Marked as paid.' });
  });
  on('PUT', /^\/api\/management\/waive-fee$/, (m, body, qs, ctx) => {
    const b = bookings.find((x) => x.booking_reference === body.booking_reference);
    if (b) { b.fee_waived = true; b.waiver_reason = body.waiver_reason; b.waiver_by = ctx.username; b.updatedAt = isoNow(); }
    return json({ success: true, message: 'Fee waived.' });
  });

  // -- management: blocks --
  on('GET', /^\/api\/management\/blocks$/, () => {
    const rows = bookings.filter((b) => b.booking_type === 'block' && (b.slot_date_to || b.slot_date) >= todayStr());
    return json({ success: true, count: rows.length, blocks: rows });
  });
  on('POST', /^\/api\/management\/blocks$/, (m, body, qs, ctx) => {
    const { facility, dateFrom, dateTo, startTime, endTime, reason } = body;
    if (!facility || !dateFrom || !dateTo || !startTime || !endTime || !reason) return json({ success: false, message: 'All fields are required.' }, 422);
    if (dateTo < dateFrom) return json({ success: false, message: 'End date must be on or after start date.' }, 422);
    if (dateFrom === dateTo && timeToMin(endTime) <= timeToMin(startTime)) return json({ success: false, message: 'End time must be after start time.' }, 422);
    if (dateFrom === todayStr() && timeToMin(startTime) <= timeToMin(`${sgtNow().getHours()}:${sgtNow().getMinutes()}`)) return json({ success: false, message: 'Start time has already passed. Please select a future time.' }, 422);
    const ref = uid('BLK');
    bookings.push(mkBooking({ booking_reference: ref, membership_number: 'MGMT', email: `block+${Date.now()}@vrv.internal`, name: `BLOCK: ${reason}`, facility_or_venue: facility, slot_date: dateFrom, slot_date_to: dateTo, slot_start_time: startTime, slot_end_time: endTime, booking_type: 'block', notes: reason, created_by: ctx.username || 'admin', source: 'management' }));
    notifications.push({ _id: uid('ntf'), type: 'notice', title: `Facility Block: ${facility}`, message: `${facility} will be unavailable from ${dateFrom} to ${dateTo}: ${reason}`, category: 'facility', reference_id: ref, read_by: [], created_by: 'Management', createdAt: isoNow(), updatedAt: isoNow() });
    return json({ success: true, message: 'Block created and members notified.', booking_reference: ref });
  });
  on('PUT', /^\/api\/management\/blocks\/([^/]+)$/, (m, body) => {
    const b = bookings.find((x) => x.booking_reference === decodeURIComponent(m[1]) && x.booking_type === 'block');
    if (!b) return json({ success: false, message: 'Block not found.' }, 404);
    const { facility, dateFrom, dateTo, startTime, endTime, reason } = body;
    if (!facility || !dateFrom || !dateTo || !startTime || !endTime || !reason) return json({ success: false, message: 'All fields are required.' }, 422);
    if (dateTo < dateFrom) return json({ success: false, message: 'End date must be on or after start date.' }, 422);
    Object.assign(b, { facility_or_venue: facility, slot_date: dateFrom, slot_date_to: dateTo, slot_start_time: startTime, slot_end_time: endTime, notes: reason, name: `BLOCK: ${reason}`, updatedAt: isoNow() });
    return json({ success: true, message: 'Block updated and members notified.', block: b });
  });
  on('DELETE', /^\/api\/management\/blocks\/([^/]+)$/, (m) => {
    const b = bookings.find((x) => x.booking_reference === decodeURIComponent(m[1]) && x.booking_type === 'block');
    if (b) { b.booking_status = 'Cancelled'; b.updatedAt = isoNow(); }
    return json({ success: true, message: 'Block removed. Slot is now available.' });
  });

  on('PUT', /^\/api\/management\/adjust-quota$/, (m, body) => json({ success: true, message: `Quota adjusted to ${body.new_quota}.` }));

  // -- events (management CRUD) --
  on('GET', /^\/api\/events\/management$/, () => json({ success: true, count: events.length, events: [...events].sort((a, b) => (a.event_date < b.event_date ? 1 : -1)) }));
  on('GET', /^\/api\/events\/management\/([^/]+)$/, (m) => {
    const ev = events.find((e) => e._id === m[1]);
    if (!ev) return json({ success: false, message: 'Event not found.' }, 404);
    return json({ success: true, event: ev });
  });
  on('POST', /^\/api\/events\/management$/, (m, body, qs, ctx) => {
    const { event_name, event_description, event_date, event_duration, event_venue } = body;
    if (!event_name || !event_description || !event_date || !event_duration || !event_venue) return json({ success: false, message: 'All fields are required.' }, 422);
    const ev = { _id: uid('evt'), event_name, event_description, event_date, event_duration, event_venue, image_url: body.image || '', pdf_url: body.pdf || '', pdf_filename: body.pdf_filename || '', created_by: ctx.displayName || 'Management', status: 'active', createdAt: isoNow(), updatedAt: isoNow() };
    events.push(ev);
    notifications.push({ _id: uid('ntf'), type: 'event', title: event_name, message: event_description.slice(0, 150), category: 'events', reference_id: ev._id, read_by: [], created_by: 'Management', createdAt: isoNow(), updatedAt: isoNow() });
    return json({ success: true, message: 'Event created and notifications sent.', event: ev });
  });
  on('PUT', /^\/api\/events\/management\/([^/]+)$/, (m, body) => {
    const ev = events.find((e) => e._id === m[1]);
    if (!ev) return json({ success: false, message: 'Event not found.' }, 404);
    Object.assign(ev, {
      event_name: body.event_name, event_description: body.event_description, event_date: body.event_date,
      event_duration: body.event_duration, event_venue: body.event_venue,
      image_url: body.image != null && body.image !== '' ? body.image : ev.image_url,
      pdf_url: body.pdf != null ? (body.pdf === '' ? '' : body.pdf) : ev.pdf_url,
      pdf_filename: body.pdf_filename != null ? body.pdf_filename : ev.pdf_filename,
      updatedAt: isoNow(),
    });
    notifications.push({ _id: uid('ntf'), type: 'notice', title: `Updated: ${ev.event_name}`, message: ev.event_description.slice(0, 150), category: 'events', reference_id: ev._id, read_by: [], created_by: 'Management', createdAt: isoNow(), updatedAt: isoNow() });
    return json({ success: true, message: 'Event updated and members notified.', event: ev });
  });
  on('DELETE', /^\/api\/events\/management\/([^/]+)$/, (m) => {
    const ev = events.find((e) => e._id === m[1]);
    if (ev) { ev.status = 'archived'; ev.updatedAt = isoNow(); notifications = notifications.filter((n) => n.reference_id !== ev._id); }
    return json({ success: true, message: 'Event archived.' });
  });

  // -- events (member-facing) --
  on('GET', /^\/api\/events\/active$/, () => {
    const active = events.filter((e) => e.status === 'active').sort((a, b) => (a.event_date > b.event_date ? 1 : -1));
    return json({ success: true, count: active.length, events: active.map((e) => ({ _id: e._id, title: e.event_name, desc: e.event_description, date: e.event_date, duration: e.event_duration, venue: e.event_venue, img: e.image_url, pdf: e.pdf_url, pdf_filename: e.pdf_filename, createdAt: e.createdAt })) });
  });
  on('GET', /^\/api\/events\/notifications\/poll$/, (m, body, qs, ctx) => {
    const n = notifications.filter((x) => !x.read_by.includes(ctx.membership_number)).length;
    return json({ success: true, unreadCount: n });
  });
  on('GET', /^\/api\/events\/notifications$/, (m, body, qs, ctx) => {
    const list = [...notifications].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((n) => Object.assign({}, n, { is_read: n.read_by.includes(ctx.membership_number) }));
    return json({ success: true, count: list.length, notifications: list });
  });
  on('PUT', /^\/api\/events\/notifications\/read-all$/, (m, body, qs, ctx) => {
    notifications.forEach((n) => { if (!n.read_by.includes(ctx.membership_number)) n.read_by.push(ctx.membership_number); });
    return json({ success: true, message: 'All marked as read.' });
  });
  on('PUT', /^\/api\/events\/notifications\/([^/]+)\/read$/, (m, body, qs, ctx) => {
    const n = notifications.find((x) => x._id === m[1]);
    if (n && !n.read_by.includes(ctx.membership_number)) n.read_by.push(ctx.membership_number);
    return json({ success: true, message: 'Marked as read.' });
  });

  // -- notification replies (member) --
  on('GET', /^\/api\/events\/notifications\/([^/]+)\/replies$/, (m) => {
    const list = replies.filter((r) => r.notification_id === m[1]).sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
    return json({ success: true, count: list.length, replies: list });
  });
  on('POST', /^\/api\/events\/notifications\/([^/]+)\/replies$/, (m, body, qs, ctx) => {
    const n = notifications.find((x) => x._id === m[1]);
    if (!n) return json({ success: false, message: 'Notification not found.' }, 404);
    if (n.category === 'events') return json({ success: false, message: 'Replies are not allowed on event notices.' }, 403);
    if (!body.message || !body.message.trim()) return json({ success: false, message: 'Message is required.' }, 422);
    const r = { _id: uid('rpl'), notification_id: n._id, sender_type: 'member', sender_name: ctx.name, membership_number: ctx.membership_number, message: body.message, createdAt: isoNow(), updatedAt: isoNow() };
    replies.push(r);
    return json({ success: true, message: 'Reply sent.', reply: r });
  });

  // -- inbox (management) --
  on('GET', /^\/api\/events\/inbox$/, () => {
    const threads = notifications.map((n) => {
      const rs = replies.filter((r) => r.notification_id === n._id).sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
      return { notification: n, replies: rs, latest_at: rs.length ? rs[rs.length - 1].createdAt : n.createdAt };
    }).filter((t) => t.replies.length).sort((a, b) => (a.latest_at < b.latest_at ? 1 : -1));
    return json({ success: true, count: threads.length, threads });
  });
  on('POST', /^\/api\/events\/inbox\/([^/]+)\/reply$/, (m, body, qs, ctx) => {
    if (!body.message || !body.message.trim()) return json({ success: false, message: 'Message is required.' }, 422);
    const r = { _id: uid('rpl'), notification_id: m[1], sender_type: 'management', sender_name: ctx.displayName || 'Management', membership_number: 'MGMT', message: body.message, createdAt: isoNow(), updatedAt: isoNow() };
    replies.push(r);
    return json({ success: true, message: 'Reply sent.', reply: r });
  });

  // -- calendars / chatbot: harmless stubs, not used by the demo UI in any visible way --
  on('GET', /^\/api\/calendars\/[^/]+\/slots$/, () => json({ success: true, calendarId: 'demo', slots: {} }));
  on('GET', /^\/api\/chatbot\/session$/, () => json({ success: true, locationId: 'demo', widgetConfig: { type: 'live_chat', locationId: 'demo' } }));

  // ─── auth context resolution (decodes our fake tokens back to a user) ──────
  function resolveContext(headers) {
    const auth = headers.get ? headers.get('Authorization') : (headers.Authorization || headers.authorization);
    // Demo tokens carry no payload — identity comes from whichever portal is
    // currently logged in, read straight from storage (mirrors what the real
    // JWT would have encoded for that session).
    try {
      const member = JSON.parse(localStorage.getItem('src_member') || localStorage.getItem('vrv_member') || 'null');
      if (member && member.membership_number) return member;
    } catch (e) {}
    try {
      const staff = JSON.parse(sessionStorage.getItem('staffUser') || 'null');
      if (staff && staff.username) return staff;
    } catch (e) {}
    try {
      const mgmt = JSON.parse(sessionStorage.getItem('mgmtUser') || 'null');
      if (mgmt && mgmt.username) return mgmt;
    } catch (e) {}
    return {};
  }

  async function mockFetch(rawUrl, init) {
    await delay();
    const u = new URL(rawUrl);
    const method = (init.method || 'GET').toUpperCase();
    let body = {};
    if (init.body) { try { body = JSON.parse(init.body); } catch (e) {} }
    const headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers || {});
    const ctx = resolveContext(headers);
    for (const r of routes) {
      if (r.method !== method) continue;
      const match = u.pathname.match(r.re);
      if (match) return r.handler(match, body, u.searchParams, ctx);
    }
    return json({ success: false, message: 'Route not found.' }, 404);
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf(API_BASE) === 0) {
      return mockFetch(url, init || {});
    }
    return realFetch(input, init);
  };

  // main.js reads `src_member`/`vrv_member` depending on rebrand pass timing — keep both in sync.
  window.__DEMO_MODE__ = true;
})();
