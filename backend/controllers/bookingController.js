// controllers/bookingController.js
// Handles new bookings from portal (Webhook #1 → FORM-01)

const { validationResult } = require('express-validator');
const ghlService            = require('../models/ghlService');
const { generateBookingReference, computeTimestamps } = require('../models/referenceGenerator');
const bookingStore          = require('../models/bookingStore');
const VENUE_CAPACITY        = require('../config/venueCapacity');

// ── Helper: convert "HH:MM" (24h) → "HH:MM AM/PM" (12h) ───────────────────
function to12Hour(time24) {
  const [h, m] = time24.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const h12    = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

const createBooking = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }

    const {
      email,
      phone,
      name,
      membership_number,
      facility_or_venue,
      calendar_id,
      booking_shift,
      slot_date,
      slot_start_time,
      slot_end_time,
      outlet_pax,
      booking_type,
      special_request,
    } = req.body;

    // Reject bookings on past dates
    const todaySG = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    if (slot_date < todaySG) {
      return res.status(422).json({ success: false, message: 'Cannot book on a past date.' });
    }

    // Reject bookings on blocked facility dates
    const blocked = await bookingStore.isBlocked(facility_or_venue, slot_date);
    if (blocked) {
      return res.status(409).json({ success: false, message: `${facility_or_venue} is not available on ${slot_date} due to a scheduled maintenance block.` });
    }

    // Reject bookings that span or end at midnight (validated again later, but
    // we need to know start/end up-front for the overlap check below).
    if (slot_end_time && slot_start_time && slot_end_time <= slot_start_time) {
      return res.status(422).json({
        success: false,
        message: 'Booking end time must be after start time and cannot span past midnight. Please select an earlier start time.',
      });
    }

    // Reject bookings when the requested TIME SLOT is at capacity. A booking
    // overlaps when existing.start < new.end AND existing.end > new.start.
    // For slot venues (Tennis, Squash, Gym), cap = courts/units available at
    // any moment. For pax venues, cap = total pax allowed at any moment.
    const vcap = VENUE_CAPACITY[facility_or_venue];
    if (vcap) {
      const shift = booking_shift || null;
      const overlappingCount = await bookingStore.getOverlappingCount(
        facility_or_venue, slot_date, slot_start_time, slot_end_time, shift,
      );
      const incoming = vcap.type === 'pax' ? (parseInt(outlet_pax) || 1) : 1;
      if (overlappingCount + incoming > vcap.cap) {
        const shiftLabel = shift ? ` (${shift})` : '';
        const startDisp = to12Hour(slot_start_time);
        const endDisp = to12Hour(slot_end_time);
        return res.status(409).json({
          success: false,
          message: `${facility_or_venue}${shiftLabel} is fully booked from ${startDisp} to ${endDisp} on ${slot_date}. Please choose a different time.`,
        });
      }
    }

    // Generate reference number
    const booking_reference = generateBookingReference(slot_date);

    // Preserve plain HH:MM time for the slot_start_time custom field
    const slotTime = slot_start_time;

    // Build GHL-compatible datetime strings for the Book Appointment workflow action.
    // GHL expects: "YYYY-MM-DD HH:MM AM" (12-hour with AM/PM, no T separator).
    const startDateTime = `${slot_date} ${to12Hour(slot_start_time)}`;
    const endDateTime   = `${slot_date} ${to12Hour(slot_end_time)}`;

    // Compute timestamps (these still need ISO format internally)
    const isoStart = `${slot_date}T${slot_start_time}:00`;
    const isoEnd   = `${slot_date}T${slot_end_time}:00`;
    const timestamps = computeTimestamps(isoStart, isoEnd);

    // Send to GHL webhook (contact creation, custom fields, workflow triggers)
    await ghlService.sendBooking({
      email,
      phone,
      name,
      membership_number,
      facility_or_venue,
      calendar_id:       calendar_id || '',
      booking_shift:     booking_shift || '',
      slot_date,
      slot_start_time:   startDateTime,  // "YYYY-MM-DD HH:MM AM/PM" for Book Appointment action
      slot_end_time:     endDateTime,
      slot_time:         slotTime,        // plain HH:MM for contact.slot_start_time field
      outlet_pax,
      booking_reference,
      booking_type:      booking_type || 'advance',
      special_request:   special_request || '',
      ...timestamps,
    });

    // Member JWT carries membership_number; staff JWT carries username/role.
    // Same endpoint is used by both portals — distinguishing here so analytics
    // can correctly attribute Source even when staff books on behalf of a member.
    const isStaffAuth = !!req.user?.username && !req.user?.membership_number;
    const source      = isStaffAuth ? 'staff' : 'member';
    const created_by  = req.user?.username || req.user?.membership_number || null;

    // Save to DB immediately — GHL workflows are async so the contact
    // custom fields won't be ready by the time the dashboard calls /api/member/bookings
    await bookingStore.save({
      booking_reference,
      membership_number,
      ghl_contact_id:  req.user?.id || null,
      email,
      name,
      facility_or_venue,
      booking_type:    booking_type  || 'advance',
      booking_status:  'Confirmed',
      booking_shift:   booking_shift || '',
      slot_date,
      slot_start_time: slotTime,   // plain HH:MM — what the dashboard formatDisplayTime expects
      slot_end_time:   slot_end_time,
      outlet_pax:      outlet_pax   || null,
      notes:           special_request || null,
      source,
      created_by,
      created_at:      new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: 'Booking confirmed. A confirmation has been sent to your email.',
      booking_reference,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/booking/availability ────────────────────────────────────────────
// Returns per-slot usage for the given facility/venue on the given date.
// Slots are 30-min increments from 6:30 AM to 11:30 PM with an assumed
// 1-hour booking duration (matches what the booking form submits).
// Frontend uses this to mark "Fully booked" times in the dropdown so members
// don't pick a slot they can't book.
const getAvailability = async (req, res, next) => {
  try {
    const { facility, date } = req.query;
    if (!facility || !date) {
      return res.status(422).json({ success: false, message: 'Please select a venue and date.' });
    }

    const vcap = VENUE_CAPACITY[facility];
    if (!vcap) {
      return res.json({ success: true, facility, date, slots: {}, cap: null, type: null });
    }

    // One query to get all relevant bookings for this venue+date — overlap
    // computed in memory for each 30-min start slot.
    const dayBookings = await bookingStore.getActiveDayBookings(facility, date);

    const slots = {};
    for (let h = 6; h < 24; h++) {
      const startMinutes = h === 6 ? [30] : [0, 30];
      for (const m of startMinutes) {
        const startTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const endH      = h + 1;
        if (endH > 24) continue;
        const endTime   = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

        const overlapping = dayBookings.filter(b =>
          b.slot_start_time < endTime && b.slot_end_time > startTime
        );
        const used = vcap.type === 'pax'
          ? overlapping.reduce((s, b) => s + (parseInt(b.outlet_pax) || 1), 0)
          : overlapping.length;

        slots[startTime] = {
          used,
          cap:    vcap.cap,
          isFull: used >= vcap.cap,
        };
      }
    }

    return res.json({
      success: true,
      facility,
      date,
      cap:     vcap.cap,
      type:    vcap.type,
      slots,
    });
  } catch (err) { next(err); }
};

module.exports = { createBooking, getAvailability };
