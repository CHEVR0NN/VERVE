// controllers/managementController.js
// All management dashboard endpoints — reads from MongoDB, writes to GHL + MongoDB.

const ghlService    = require('../models/ghlService');
const bookingStore  = require('../models/bookingStore');
const Notification  = require('../models/Notification');
const AuditLog      = require('../models/AuditLog');
const Member        = require('../models/Member');

const audit = (req, action, target_id, target_type, details) => {
  AuditLog.create({
    actor:       req.mgmt?.username   || 'unknown',
    actor_name:  req.mgmt?.displayName || req.mgmt?.username || 'unknown',
    action,
    target_id,
    target_type,
    details,
  }).catch((err) => console.error('[AuditLog] Failed to write:', err.message));
};

const todaySGT = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });

// ── Facility vs Venue helper ────────────────────────────────────────────────
const FACILITIES = ['Tennis', 'Squash', 'Gym'];
const facilityOrVenue = (name) => FACILITIES.includes(name) ? 'Facility' : 'Venue';

// ── Venue capacity config ────────────────────────────────────────────────────
const VENUE_CAPACITY = {
  'Tennis':            { cap: 4, type: 'slot' },       // 4 courts, 1 booking/slot each
  'Squash':            { cap: 4, type: 'slot' },
  'Gym':               { cap: 20, type: 'pax' },
  'Le Mansion':        { cap: 15, buffer: 3, type: 'booking' },
  'Barkerslounge':     { cap: 10, buffer: 2, type: 'booking' },
  'Oasis':             { cap: 12, buffer: 2, type: 'booking' },
};

// Total slot capacity across all venues for utilisation %
const TOTAL_DAILY_CAPACITY = 4 + 4 + 20 + 15 + 15 + 10 + 12; // Tennis(4) + Squash(4) + Gym(20) + LeMansion Lunch(15) + Dinner(15) + Barkers(10) + Oasis(12) = 80

// ── GET /api/management/dashboard ────────────────────────────────────────────
const getDashboard = async (req, res, next) => {
  try {
    const date = todaySGT();
    const bookings = await bookingStore.getByDate(date);
    const lateCancellations = await bookingStore.getLateCancellations();

    const total      = bookings.length;
    const checkedIn  = bookings.filter(b => /^checked.?in$/i.test(b.booking_status)).length;
    const noShows    = bookings.filter(b => /^no.?show$/i.test(b.booking_status)).length;
    const cancelled  = bookings.filter(b => /^cancelled$/i.test(b.booking_status)).length;
    const lateCancel = lateCancellations.length;
    const guests     = bookings.filter(b => ['guest_pass', 'guest'].includes(b.booking_type)).length;

    // Utilisation: (confirmed + checked_in) / total capacity
    const active = bookings.filter(b =>
      /^confirmed$/i.test(b.booking_status) || /^checked.?in$/i.test(b.booking_status)
    ).length;
    const utilisation = TOTAL_DAILY_CAPACITY > 0
      ? Math.round((active / TOTAL_DAILY_CAPACITY) * 100)
      : 0;

    return res.json({
      success: true,
      date,
      kpis: { total, checkedIn, noShows, cancelled, lateCancel, guests, utilisation },
    });
  } catch (err) { next(err); }
};

// ── GET /api/management/schedule ─────────────────────────────────────────────
const getSchedule = async (req, res, next) => {
  try {
    const date = todaySGT();
    const bookings = await bookingStore.getByDate(date);
    return res.json({ success: true, date, count: bookings.length, bookings });
  } catch (err) { next(err); }
};

// ── GET /api/management/occupancy ────────────────────────────────────────────
const getOccupancy = async (req, res, next) => {
  try {
    const date     = todaySGT();
    const bookings = await bookingStore.getByDate(date);

    // Count active bookings: confirmed, checked-in, and walk-ins
    const active = bookings.filter(b =>
      /^confirmed$/i.test(b.booking_status) ||
      /^checked.?in$/i.test(b.booking_status) ||
      /^walkin$/i.test(b.booking_status)
    );

    // Tennis courts — assume bookings have facility_or_venue = "Tennis" (shared)
    const tennis = active.filter(b => /tennis/i.test(b.facility_or_venue));
    const squash = active.filter(b => /squash/i.test(b.facility_or_venue));
    const gym    = active.filter(b => /gym/i.test(b.facility_or_venue));

    const gymPax = gym.reduce((sum, b) => sum + (parseInt(b.outlet_pax) || 1), 0);

    // F&B — split by shift, count by pax (seats) not booking count
    const sumPax = (arr) => arr.reduce((sum, b) => sum + (parseInt(b.outlet_pax) || 1), 0);

    const leMansion = active.filter(b => /le.?mansion/i.test(b.facility_or_venue));
    const leMansionLunch  = leMansion.filter(b => /lunch/i.test(b.booking_shift));
    const leMansionDinner = leMansion.filter(b => /dinner/i.test(b.booking_shift));

    const barkers = active.filter(b => /barker/i.test(b.facility_or_venue));
    const oasis   = active.filter(b => /oasis/i.test(b.facility_or_venue));

    return res.json({
      success: true,
      date,
      venues: {
        tennis:           { count: tennis.length, cap: 4 },
        squash:           { count: squash.length, cap: 4 },
        gym:              { count: gymPax, cap: 20 },
        leMansionLunch:   { count: sumPax(leMansionLunch), cap: 15, buffer: 3 },
        leMansionDinner:  { count: sumPax(leMansionDinner), cap: 15, buffer: 3 },
        barkers:          { count: sumPax(barkers), cap: 10, buffer: 2 },
        oasis:            { count: sumPax(oasis), cap: 12, buffer: 2 },
      },
    });
  } catch (err) { next(err); }
};

// ── GET /api/management/analytics ────────────────────────────────────────────
// Returns all bookings — client-side filtering
const getAnalytics = async (req, res, next) => {
  try {
    const bookings = await bookingStore.getAllBookings();
    return res.json({ success: true, count: bookings.length, bookings });
  } catch (err) { next(err); }
};

// ── GET /api/management/no-shows ─────────────────────────────────────────────
const getNoShows = async (req, res, next) => {
  try {
    const bookings = await bookingStore.getNoShows();

    // Group by membership_number
    const map = {};
    for (const b of bookings) {
      const key = b.membership_number;
      if (!map[key]) {
        map[key] = {
          name: b.name,
          membership_number: key,
          count: 0,
          mostRecent: b.slot_date,
          facility: b.facility_or_venue,
        };
      }
      map[key].count++;
      if (b.slot_date > map[key].mostRecent) {
        map[key].mostRecent = b.slot_date;
        map[key].facility   = b.facility_or_venue;
      }
    }

    // Attach is_flagged status from Member records
    const memberNums = Object.keys(map);
    const flaggedDocs = await Member.find(
      { membership_number: { $in: memberNums }, is_flagged: true },
      { membership_number: 1 }
    ).lean();
    const flaggedSet = new Set(flaggedDocs.map(d => d.membership_number));
    for (const key of memberNums) {
      map[key].is_flagged = flaggedSet.has(key);
    }

    const members = Object.values(map).sort((a, b) => b.count - a.count);
    return res.json({ success: true, count: members.length, members });
  } catch (err) { next(err); }
};

// ── GET /api/management/guests ───────────────────────────────────────────────
const getGuests = async (req, res, next) => {
  try {
    const now   = new Date();
    const year  = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric' });
    const month = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore', month: '2-digit' });
    const monthStart = `${year}-${month}-01`;
    const monthEnd   = `${year}-${month}-31`;

    const passes = await bookingStore.getGuestPasses(monthStart, monthEnd);

    // Group passes by inviting member. Each member ends up with a list of
    // guest records (full per-booking details) plus aggregate counts.
    const map = {};
    for (const p of passes) {
      const key = p.membership_number;
      if (!map[key]) {
        map[key] = {
          name: '',                       // inviting member's name (filled below)
          membership_number: key,
          quota: 4,
          used: 0,
          sameGuestCounts: {},
          records: [],
        };
      }
      map[key].used++;
      const guestName = p.name || 'Unknown';
      map[key].sameGuestCounts[guestName] = (map[key].sameGuestCounts[guestName] || 0) + 1;
      map[key].records.push({
        booking_reference: p.booking_reference,
        guest_name:        p.name || '',
        guest_email:       p.guest_email || '',
        guest_phone:       p.guest_phone || '',
        facility_or_venue: p.facility_or_venue || '',
        booking_shift:     p.booking_shift || '',
        slot_date:         p.slot_date || '',
        booking_status:    p.booking_status || '',
        created_at:        p.createdAt || null,
      });
    }

    // Fill in the inviting member's name by looking them up once per member.
    const Member = require('../models/Member');
    const memberDocs = await Member.find(
      { membership_number: { $in: Object.keys(map) } },
      { membership_number: 1, name: 1 },
    ).lean();
    const memberNameMap = Object.fromEntries(memberDocs.map(m => [m.membership_number, m.name]));

    const members = Object.values(map).map(m => ({
      name: memberNameMap[m.membership_number] || '—',
      membership_number: m.membership_number,
      quota: m.quota,
      used: m.used,
      remaining: Math.max(0, m.quota - m.used),
      sameGuestMax: Math.max(...Object.values(m.sameGuestCounts), 0),
      records: m.records,
    }));

    return res.json({ success: true, count: members.length, members });
  } catch (err) { next(err); }
};

// ── GET /api/management/fees ─────────────────────────────────────────────────
const getFees = async (req, res, next) => {
  try {
    const bookings = await bookingStore.getAllLateCancellations();
    return res.json({ success: true, count: bookings.length, bookings });
  } catch (err) { next(err); }
};

// ── GET /api/management/blocks ───────────────────────────────────────────────
const getBlocks = async (req, res, next) => {
  try {
    const today  = todaySGT();
    let blocks   = await bookingStore.getBlocks();
    // Only current + future blocks (compare against end date so ongoing blocks remain visible)
    blocks = blocks.filter(b => (b.slot_date_to || b.slot_date) >= today);
    return res.json({ success: true, count: blocks.length, blocks });
  } catch (err) { next(err); }
};

// ── POST /api/management/blocks ──────────────────────────────────────────────
const createBlock = async (req, res, next) => {
  try {
    const { facility, dateFrom, dateTo, startTime, endTime, reason } = req.body;
    if (!facility || !dateFrom || !dateTo || !startTime || !endTime || !reason) {
      return res.status(422).json({ success: false, message: 'All fields are required.' });
    }
    if (dateTo < dateFrom) {
      return res.status(422).json({ success: false, message: 'End date must be on or after start date.' });
    }
    if (dateFrom === dateTo && endTime <= startTime) {
      return res.status(422).json({ success: false, message: 'End time must be after start time.' });
    }
    const nowSGT = new Date();
    const sgDate = nowSGT.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    const sgTime = nowSGT.toLocaleTimeString('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false });
    if (dateFrom === sgDate && startTime <= sgTime) {
      return res.status(422).json({ success: false, message: 'Start time has already passed. Please select a future time.' });
    }

    // One record covering the full range
    const booking_reference = `BLK-${Date.now()}`;
    const block = {
      booking_reference,
      membership_number: 'MGMT',
      email: `block+${Date.now()}@src.internal`,
      name: `BLOCK: ${reason}`,
      facility_or_venue: facility,
      booking_type: 'block',
      booking_status: 'Confirmed',
      slot_date:    dateFrom,
      slot_date_to: dateTo,
      slot_start_time: startTime,
      slot_end_time:   endTime,
      outlet_pax: '0',
      notes: reason,
      source: 'management',
      created_by: req.user?.username || 'admin',
    };
    await bookingStore.save(block);

    try {
      await ghlService.sendBooking({
        ...block, phone: '', calendar_id: '', booking_shift: '',
        special_request: reason, cancellation_deadline: '',
        overdue_check_at: '', no_show_check_at: '', feedback_send_at: '',
        slot_time: startTime,
      });
    } catch (_) { /* GHL sync is best-effort */ }

    const label = facilityOrVenue(facility);
    const fmtDate = d => new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-SG', {
      timeZone: 'Asia/Singapore', day: 'numeric', month: 'long', year: 'numeric',
    });
    const rangeLabel = dateFrom === dateTo ? fmtDate(dateFrom) : `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`;
    await Notification.create({
      type:         'notice',
      title:        `${label} Block: ${facility}`,
      message:      `${facility} is blocked from ${rangeLabel}, ${startTime}–${endTime}. Reason: ${reason}`,
      reference_id: booking_reference,
      category:     'facility',
      created_by:   req.mgmt?.displayName || req.mgmt?.username || 'Management',
    });

    audit(req, 'create_block', booking_reference, 'booking', { facility, dateFrom, dateTo, startTime, endTime, reason });
    return res.json({ success: true, message: 'Block created and members notified.', booking_reference });
  } catch (err) { next(err); }
};

// ── DELETE /api/management/blocks/:booking_reference ─────────────────────────
const removeBlock = async (req, res, next) => {
  try {
    const { booking_reference } = req.params;
    await bookingStore.updateStatus(booking_reference, 'Cancelled');

    // Move the block's opportunity in VRV BOOKINGS to the Cancelled stage.
    try {
      await ghlService.moveOpportunityToStatus(booking_reference, 'Cancelled');
    } catch (err) {
      console.warn(`[Remove Block] GHL pipeline sync failed for ${booking_reference}: ${err.message}`);
    }

    // Notify members that the block has been lifted
    const blockDoc = await bookingStore.getByReference(booking_reference);
    if (blockDoc) {
      const label = facilityOrVenue(blockDoc.facility_or_venue);
      const displayDate = blockDoc.slot_date
        ? new Date(blockDoc.slot_date + 'T00:00:00+08:00').toLocaleDateString('en-SG', {
            timeZone: 'Asia/Singapore', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })
        : '';
      await Notification.create({
        type:         'notice',
        title:        `${label} Block Removed: ${blockDoc.facility_or_venue}`,
        message:      `The block on ${blockDoc.facility_or_venue} for ${displayDate} (${blockDoc.slot_start_time || ''} – ${blockDoc.slot_end_time || ''}) has been lifted. The ${label.toLowerCase()} is now available for booking.`,
        reference_id: booking_reference,
        category:     'facility',
        created_by:   req.mgmt?.displayName || req.mgmt?.username || 'Management',
      });
    }

    audit(req, 'remove_block', booking_reference, 'booking');
    return res.json({ success: true, message: 'Block removed. Slot is now available.' });
  } catch (err) { next(err); }
};

// ── PUT /api/management/blocks/:booking_reference ───────────────────────────
const updateBlock = async (req, res, next) => {
  try {
    const { booking_reference } = req.params;
    const { facility, dateFrom, dateTo, startTime, endTime, reason } = req.body;
    if (!facility || !dateFrom || !dateTo || !startTime || !endTime || !reason) {
      return res.status(422).json({ success: false, message: 'All fields are required.' });
    }
    if (dateTo < dateFrom) {
      return res.status(422).json({ success: false, message: 'End date must be on or after start date.' });
    }

    const updated = await bookingStore.updateBlock(booking_reference, {
      facility_or_venue: facility,
      slot_date:         dateFrom,
      slot_date_to:      dateTo,
      slot_start_time:   startTime,
      slot_end_time:     endTime,
      notes:             reason,
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Block not found.' });
    }

    // No GHL pipeline sync needed — updating a block's date/time/reason doesn't
    // change its status (still Confirmed). The opportunity stage is unchanged.

    // Notify members of the updated block
    const label = facilityOrVenue(facility);
    const fmtBlockDate = d => new Date(d + 'T00:00:00+08:00').toLocaleDateString('en-SG', {
      timeZone: 'Asia/Singapore', day: 'numeric', month: 'long', year: 'numeric',
    });
    const updatedRange = dateFrom === dateTo ? fmtBlockDate(dateFrom) : `${fmtBlockDate(dateFrom)} – ${fmtBlockDate(dateTo)}`;
    await Notification.create({
      type:         'notice',
      title:        `${label} Block Updated: ${facility}`,
      message:      `The ${label.toLowerCase()} block for ${facility} has been updated. New schedule: ${updatedRange}, ${startTime} – ${endTime}. Reason: ${reason}`,
      reference_id: booking_reference,
      category:     'facility',
      created_by:   req.mgmt?.displayName || req.mgmt?.username || 'Management',
    });

    audit(req, 'update_block', booking_reference, 'booking', { facility, dateFrom, dateTo, startTime, endTime, reason });
    return res.json({ success: true, message: 'Block updated and members notified.', block: updated });
  } catch (err) { next(err); }
};

// ── PUT /api/management/override-status ──────────────────────────────────────
// Maps each new_status to its user-facing display name. Used in the toast
// message so internal values like "late_fee_paid" never leak to the user.
const STATUS_DISPLAY_NAME = {
  'Confirmed':         'Confirmed',
  'Checked In':        'Checked In',
  'Completed':         'Completed',
  'Cancelled':         'Cancelled',
  'No Show':           'No Show',
  'Late Cancellation': 'Late Cancellation',
  'late_fee_paid':     'Late Fee Paid',
};

const overrideStatus = async (req, res, next) => {
  try {
    const { booking_reference, new_status } = req.body;
    if (!booking_reference || !new_status) {
      return res.status(422).json({ success: false, message: 'Please select a booking and a new status.' });
    }

    // For statuses that imply a late cancellation (the late-cancellation
    // stage itself, or the paid variant) we also need to flag the booking
    // so the Late Cancellation Fees list in management can find it.
    if (new_status === 'Late Cancellation') {
      await bookingStore.flagLateCancellation(booking_reference);
    } else if (new_status === 'late_fee_paid') {
      await bookingStore.flagLateCancellation(booking_reference);
      await bookingStore.markFeePaid(booking_reference, req.mgmt.username);
    } else {
      await bookingStore.updateStatus(booking_reference, new_status);
    }

    let ghlSyncError = null;
    try {
      await ghlService.moveOpportunityToStatus(booking_reference, new_status);
    } catch (err) {
      const apiDetail = err.response?.data
        ? (typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data))
        : err.message;
      ghlSyncError = apiDetail;
      console.error(`[Override Status] GHL pipeline sync failed for ${booking_reference}: ${apiDetail}`);
    }

    audit(req, 'override_status', booking_reference, 'booking', { new_status, ghl_sync_ok: !ghlSyncError });

    const displayName = STATUS_DISPLAY_NAME[new_status] || new_status;
    return res.json({
      success: true,
      message: ghlSyncError
        ? `Booking marked as ${displayName}. The pipeline view will refresh shortly.`
        : `Booking marked as ${displayName}.`,
      ghl_synced: !ghlSyncError,
    });
  } catch (err) { next(err); }
};

// ── POST /api/management/add-note ────────────────────────────────────────────
const addNote = async (req, res, next) => {
  try {
    const { booking_reference, note } = req.body;
    if (!booking_reference || !note) {
      return res.status(422).json({ success: false, message: 'Please select a booking and enter a note before saving.' });
    }

    // Persist note to MongoDB so it shows up in the full record view
    await bookingStore.updateBooking(booking_reference, { notes: note });

    // Add note to GHL contact (best-effort)
    try {
      const contact = await ghlService.findContactByReference(booking_reference);
      if (contact) {
        await ghlService.addContactNote(contact.id, note);
      }
    } catch (_) { /* best-effort */ }

    audit(req, 'add_note', booking_reference, 'booking', { note });
    return res.json({ success: true, message: 'Note saved.' });
  } catch (err) { next(err); }
};

// ── PUT /api/management/mark-paid ────────────────────────────────────────────
const markPaid = async (req, res, next) => {
  try {
    const { booking_reference } = req.body;
    if (!booking_reference) {
      return res.status(422).json({ success: false, message: 'Please select a booking first.' });
    }

    await bookingStore.markFeePaid(booking_reference, req.mgmt.username);

    // Move the opportunity to the Late Fee Paid stage so finance can see paid
    // late cancellations in the pipeline view.
    try {
      await ghlService.moveOpportunityToStatus(booking_reference, 'late_fee_paid');
    } catch (err) {
      console.warn(`[Mark Paid] GHL pipeline sync failed for ${booking_reference}: ${err.message}`);
    }

    audit(req, 'mark_paid', booking_reference, 'booking');
    return res.json({ success: true, message: 'Marked as paid.' });
  } catch (err) { next(err); }
};

// ── PUT /api/management/waive-fee ────────────────────────────────────────────
const waiveFee = async (req, res, next) => {
  try {
    const { booking_reference, waiver_reason } = req.body;
    if (!booking_reference || !waiver_reason) {
      return res.status(422).json({ success: false, message: 'Please select a booking and enter a reason for the waiver.' });
    }

    const waiver_by = req.mgmt.username;
    await bookingStore.waiveFee(booking_reference, waiver_reason, waiver_by);

    try {
      const contact = await ghlService.findContactByReference(booking_reference);
      if (contact) {
        await ghlService.updateContactCustomFields(contact.id, [
          { id: 'N1P00iQI8CNFUfh2BzUN', field_value: 'true' },
          { id: 'SsjDZhq4Fe9gcaAnVEpo', field_value: waiver_reason },
          { id: 'Q2YmvIjxUJliP9Yah51r', field_value: waiver_by },
        ]);
      }
    } catch (_) { /* best-effort */ }

    audit(req, 'waive_fee', booking_reference, 'booking', { waiver_reason });
    return res.json({ success: true, message: 'Fee waived.' });
  } catch (err) { next(err); }
};

// ── POST /api/management/flag-member ─────────────────────────────────────────
const flagMember = async (req, res, next) => {
  try {
    const { membership_number } = req.body;
    if (!membership_number) {
      return res.status(422).json({ success: false, message: 'Please enter a membership number.' });
    }

    // Persist flag to MongoDB
    await Member.findOneAndUpdate(
      { membership_number },
      { is_flagged: true },
      { upsert: false }
    );

    // Sync to GHL (best-effort)
    try {
      const contacts = await ghlService.findContactsByMember(membership_number);
      if (contacts.length > 0) {
        await ghlService.addContactTags(contacts[0].id, ['management_flag']);
        await ghlService.addContactNote(contacts[0].id,
          `Flagged by management (${req.mgmt.displayName}) for repeated no-shows.`
        );
      }
    } catch (_) { /* best-effort */ }

    audit(req, 'flag_member', membership_number, 'member');
    return res.json({ success: true, message: 'Member flagged.' });
  } catch (err) { next(err); }
};

// ── PUT /api/management/adjust-quota ─────────────────────────────────────────
const adjustQuota = async (req, res, next) => {
  try {
    const { membership_number, new_quota } = req.body;
    if (!membership_number || new_quota === undefined) {
      return res.status(422).json({ success: false, message: 'Please enter a membership number and a new quota.' });
    }

    try {
      const contacts = await ghlService.findContactsByMember(membership_number);
      if (contacts.length > 0) {
        await ghlService.updateContactCustomFields(contacts[0].id, [
          { id: 'guest_quota_override', field_value: String(new_quota) },
        ]);
        await ghlService.addContactNote(contacts[0].id,
          `Guest quota adjusted to ${new_quota} by management (${req.mgmt.displayName}).`
        );
      }
    } catch (_) { /* best-effort */ }

    audit(req, 'adjust_quota', membership_number, 'member', { new_quota });
    return res.json({ success: true, message: `Quota adjusted to ${new_quota}.` });
  } catch (err) { next(err); }
};

// ── GET /api/management/contact/:booking_reference ───────────────────────────
// Full GHL contact record for the "View Full Record" modal
const getFullRecord = async (req, res, next) => {
  try {
    const { booking_reference } = req.params;

    // First get from MongoDB for quick response
    const booking = await bookingStore.getByReference(booking_reference);

    // Try to get full GHL record
    let ghlContact = null;
    try {
      const contact = await ghlService.findContactByReference(booking_reference);
      if (contact) {
        ghlContact = await ghlService.getContactById(contact.id);
      }
    } catch (_) { /* best-effort */ }

    return res.json({ success: true, booking, ghlContact });
  } catch (err) { next(err); }
};

// ── Periodic: auto-notify members when blocks finish naturally ───────────────
const processExpiredBlocks = async () => {
  try {
    const now     = new Date();
    const nowDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    const nowTime = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false });

    const expired = await bookingStore.getExpiredBlocks(nowDate, nowTime);
    for (const b of expired) {
      const label = facilityOrVenue(b.facility_or_venue);
      const displayDate = (b.slot_date_to || b.slot_date)
        ? new Date((b.slot_date_to || b.slot_date) + 'T00:00:00+08:00').toLocaleDateString('en-SG', {
            timeZone: 'Asia/Singapore', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })
        : '';

      await Notification.create({
        type:         'notice',
        title:        `${label} Block Ended: ${b.facility_or_venue}`,
        message:      `The block on ${b.facility_or_venue} for ${displayDate} (${b.slot_start_time || ''} – ${b.slot_end_time || ''}) has ended. The ${label.toLowerCase()} is now available for booking.`,
        reference_id: b.booking_reference,
        category:     'facility',
        created_by:   'Management',
      });

      await bookingStore.markBlockExpired(b.booking_reference);
    }
    if (expired.length) console.log(`[Block Expiry] Notified members for ${expired.length} expired block(s).`);
  } catch (err) {
    console.error('[Block Expiry] Error processing expired blocks:', err.message);
  }
};

// ── GET /api/management/audit ────────────────────────────────────────────────
const getAuditLog = async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const logs   = await AuditLog.find()
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();
    return res.json({ success: true, count: logs.length, logs });
  } catch (err) { next(err); }
};

module.exports = {
  getDashboard, getSchedule, getOccupancy, getAnalytics, getNoShows, getGuests,
  getFees, getBlocks, createBlock, updateBlock, removeBlock, overrideStatus, addNote,
  markPaid, waiveFee, flagMember, adjustQuota, getFullRecord, processExpiredBlocks,
  getAuditLog,
};
