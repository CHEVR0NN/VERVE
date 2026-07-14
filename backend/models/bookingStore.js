// models/bookingStore.js
// MongoDB-backed booking store.
// Provides the same interface as the previous JSON file store.

const Booking = require('./Booking');

async function save(booking) {
  await Booking.findOneAndUpdate(
    { booking_reference: booking.booking_reference },
    booking,
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
}

async function getByMember(membership_number) {
  return Booking.find({ membership_number }).sort({ slot_date: 1 }).lean();
}

async function updateStatus(booking_reference, booking_status) {
  const result = await Booking.findOneAndUpdate(
    { booking_reference },
    { booking_status }
  );
  return !!result;
}

async function updateBooking(booking_reference, updates) {
  const allowed = ['slot_date', 'slot_start_time', 'slot_end_time', 'outlet_pax', 'notes'];
  const filtered = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  }
  const result = await Booking.findOneAndUpdate(
    { booking_reference },
    filtered,
    { returnDocument: 'after' }
  );
  return result;
}

async function getByDate(slot_date) {
  return Booking.find({ slot_date }).sort({ slot_start_time: 1 }).lean();
}

async function getByDateAndVenues(slot_date, venues) {
  return Booking.find({ slot_date, facility_or_venue: { $in: venues } })
    .sort({ slot_start_time: 1 })
    .lean();
}

async function getLateCancellations() {
  return Booking.find({ late_cancellation: true, fee_waived: { $ne: true } })
    .sort({ createdAt: -1 })
    .lean();
}

async function flagLateCancellation(booking_reference) {
  return Booking.findOneAndUpdate(
    { booking_reference },
    { late_cancellation: true, booking_status: 'Cancelled' }
  );
}

async function waiveFee(booking_reference, waiver_reason, waiver_by) {
  return Booking.findOneAndUpdate(
    { booking_reference },
    { fee_waived: true, waiver_reason, waiver_by }
  );
}

async function getByReference(booking_reference) {
  return Booking.findOne({ booking_reference }).lean();
}

// ── Management-specific queries ──────────────────────────────────────────────

async function getAllBookings(filter = {}) {
  return Booking.find(filter).sort({ slot_date: -1, slot_start_time: 1 }).lean();
}

async function getNoShows() {
  return Booking.find({ booking_status: { $regex: /^no.?show$/i } }).sort({ updatedAt: -1 }).lean();
}

async function getMonthlyGuestCountByMember(membership_number, monthStart, monthEnd) {
  return Booking.countDocuments({
    membership_number,
    booking_type:   { $in: ['guest_pass', 'guest'] },
    booking_status: { $not: /^cancelled$/i },
    slot_date:      { $gte: monthStart, $lte: monthEnd },
  });
}

async function getGuestPasses(monthStart, monthEnd) {
  // Returns every guest pass for the month except cancellations. Audit needs
  // to see registered guests too, not only those who already checked in.
  return Booking.find({
    booking_type:   { $in: ['guest_pass', 'guest'] },
    booking_status: { $not: /^cancelled$/i },
    slot_date:      { $gte: monthStart, $lte: monthEnd },
  }).sort({ slot_date: -1 }).lean();
}

async function getBlocks() {
  return Booking.find({
    booking_type: 'block',
    booking_status: { $regex: /^confirmed$/i },
  }).sort({ slot_date: 1, slot_start_time: 1 }).lean();
}

const PAX_VENUES = ['Gym', 'Le Mansion', 'Barkerslounge', 'Oasis'];

// Only bookings in these statuses occupy a slot. Mirrors the active-status
// filter in managementController.getOccupancy so the capacity check and the
// live occupancy display agree.
const ACTIVE_BOOKING_STATUS = /^(confirmed|checked.?in|walkin|overdue)$/i;

async function getVenueCount(facility_or_venue, slot_date, booking_shift) {
  const query = {
    facility_or_venue,
    slot_date,
    booking_type: { $nin: ['block'] },
    booking_status: { $regex: ACTIVE_BOOKING_STATUS },
  };
  if (booking_shift) query.booking_shift = booking_shift;
  const bookings = await Booking.find(query).lean();
  if (PAX_VENUES.includes(facility_or_venue)) {
    return bookings.reduce((sum, b) => sum + (parseInt(b.outlet_pax) || 1), 0);
  }
  return bookings.length;
}

// Returns every active booking for a venue on a given date. Used by the
// availability endpoint to compute per-time-slot usage without making a
// separate DB call for each slot.
async function getActiveDayBookings(facility_or_venue, slot_date) {
  return Booking.find({
    facility_or_venue,
    slot_date,
    booking_type:   { $nin: ['block'] },
    booking_status: { $regex: ACTIVE_BOOKING_STATUS },
  }).lean();
}

// Counts bookings whose time range overlaps the requested [start, end].
// Two bookings overlap when existing.start < new.end AND existing.end > new.start
// (back-to-back bookings don't overlap). Used to enforce per-time-slot
// capacity — e.g. 4 Tennis courts at 7-8 PM is OK, the 5th must wait.
async function getOverlappingCount(facility_or_venue, slot_date, slot_start_time, slot_end_time, booking_shift) {
  const query = {
    facility_or_venue,
    slot_date,
    booking_type: { $nin: ['block'] },
    booking_status: { $regex: ACTIVE_BOOKING_STATUS },
    slot_start_time: { $lt: slot_end_time },
    slot_end_time:   { $gt: slot_start_time },
  };
  if (booking_shift) query.booking_shift = booking_shift;
  const bookings = await Booking.find(query).lean();
  if (PAX_VENUES.includes(facility_or_venue)) {
    return bookings.reduce((sum, b) => sum + (parseInt(b.outlet_pax) || 1), 0);
  }
  return bookings.length;
}

async function isBlocked(facility_or_venue, slot_date) {
  const block = await Booking.findOne({
    booking_type: 'block',
    facility_or_venue,
    booking_status: { $not: /^cancelled$/i },
    $or: [
      // Range block: start date <= requested date <= end date
      { slot_date: { $lte: slot_date }, slot_date_to: { $gte: slot_date } },
      // Single-day block (no end date stored): only blocks on its exact start date
      { slot_date: slot_date, $or: [{ slot_date_to: null }, { slot_date_to: { $exists: false } }] },
    ],
  }).lean();
  return !!block;
}

async function getExpiredBlocks(nowDate, nowTime) {
  return Booking.find({
    booking_type:    'block',
    booking_status:  { $regex: /^confirmed$/i },
    expiry_notified: { $ne: true },
    $or: [
      { slot_date_to: { $lt: nowDate } },
      { slot_date_to: nowDate, slot_end_time: { $lte: nowTime } },
    ],
  }).lean();
}

async function markBlockExpired(booking_reference) {
  return Booking.findOneAndUpdate(
    { booking_reference },
    { expiry_notified: true }
  );
}

async function updateBlock(booking_reference, updates) {
  const allowed = ['facility_or_venue', 'slot_date', 'slot_date_to', 'slot_start_time', 'slot_end_time', 'notes'];
  const filtered = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  }
  // Keep the name field in sync with reason
  if (filtered.notes) filtered.name = `BLOCK: ${filtered.notes}`;
  return Booking.findOneAndUpdate(
    { booking_reference, booking_type: 'block' },
    filtered,
    { returnDocument: 'after' }
  ).lean();
}

async function getAllLateCancellations() {
  return Booking.find({ late_cancellation: true }).sort({ updatedAt: -1 }).lean();
}

async function markFeePaid(booking_reference, actioned_by) {
  return Booking.findOneAndUpdate(
    { booking_reference },
    { booking_status: 'late_fee_paid', waiver_by: actioned_by },
    { returnDocument: 'after' }
  );
}

// ── Auto-expire past active bookings → "Completed" ─────────────────────────
// Transitions both Confirmed and Checked In bookings to Completed once their
// end time has passed. A Confirmed booking that ends without a check-in still
// gets marked Completed here, but SHARED-04 (No-Show) will already have
// flipped it to "No Show" 30 min after start — so this only catches the case
// where No-Show didn't fire (e.g., booking time was less than 30 min after
// start, or the workflow was paused).
async function markPastConfirmedCompleted(nowDate, nowTime) {
  // ONLY Checked In → Completed. A booking that was never checked in must
  // not auto-complete — it should have been marked No Show first by either
  // the 15-min sweep below or the GHL SHARED-04 workflow.
  const candidates = await Booking.find({
    booking_status: { $regex: /^checked.?in$/i },
    booking_type:   { $nin: ['block'] },
    $or: [
      { slot_date: { $lt: nowDate } },
      { slot_date: nowDate, slot_end_time: { $ne: null, $lte: nowTime } },
    ],
  }).lean();

  if (!candidates.length) return { count: 0, references: [] };

  await Booking.updateMany(
    { booking_reference: { $in: candidates.map(b => b.booking_reference) } },
    { booking_status: 'Completed' },
  );
  return { count: candidates.length, references: candidates.map(b => b.booking_reference) };
}

// ── Mark Confirmed bookings as No Show 15 min after their start time ──────
// If the member never checked in within 15 minutes of their booking start,
// the booking is marked No Show. Backend safety net for the GHL SHARED-04
// workflow — whichever fires first wins; the other becomes a no-op.
async function markStaleConfirmedAsNoShow(nowDate, nowTime) {
  // Cutoff time = nowTime - 15 minutes. Bookings whose start time is at or
  // before that cutoff (and still Confirmed) have missed their grace window.
  const [h, m] = nowTime.split(':').map(Number);
  const cutoffTotal = h * 60 + m - 15;
  const cutoffTimeToday = cutoffTotal >= 0
    ? `${String(Math.floor(cutoffTotal / 60)).padStart(2, '0')}:${String(cutoffTotal % 60).padStart(2, '0')}`
    : null;

  const candidates = await Booking.find({
    booking_status: { $regex: /^confirmed$/i },
    booking_type:   { $nin: ['block', 'walkin'] },
    $or: [
      // Any past date that's still confirmed missed the window already
      { slot_date: { $lt: nowDate } },
      // Today: must be 15+ min after start time
      ...(cutoffTimeToday
        ? [{ slot_date: nowDate, slot_start_time: { $ne: null, $lte: cutoffTimeToday } }]
        : []),
    ],
  }).lean();

  if (!candidates.length) return { count: 0, references: [] };

  await Booking.updateMany(
    { booking_reference: { $in: candidates.map(b => b.booking_reference) } },
    { booking_status: 'No Show' },
  );
  return { count: candidates.length, references: candidates.map(b => b.booking_reference) };
}

module.exports = {
  save, getByMember, updateStatus, updateBooking, getByDate, getByDateAndVenues,
  getLateCancellations, flagLateCancellation, waiveFee, getByReference,
  getAllBookings, getNoShows, getGuestPasses, getMonthlyGuestCountByMember,
  getBlocks, getVenueCount, getOverlappingCount, getActiveDayBookings, isBlocked, getExpiredBlocks, markBlockExpired, updateBlock, getAllLateCancellations, markFeePaid,
  markPastConfirmedCompleted, markStaleConfirmedAsNoShow,
};
