// controllers/checkinController.js
// Handles check-in validation + sends Webhook #5 → SHARED-07
// Validation: GHL (by contact ID) as primary, MongoDB as fallback for status sync.

const { validationResult } = require('express-validator');
const ghlService            = require('../models/ghlService');
const bookingStore          = require('../models/bookingStore');

const validateAndCheckin = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }

    const { booking_reference, checked_in_by } = req.body;

    // ── Step 1: Find booking in MongoDB (to get the GHL contact ID) ───────────
    const booking = await bookingStore.getByReference(booking_reference);

    if (!booking) {
      return res.status(200).json({
        success: false,
        valid:   false,
        reason:  'INVALID_REFERENCE',
        message: 'Booking reference not found.',
      });
    }

    // ── Step 2: Validate via GHL (direct contact lookup by ID) ────────────────
    let ghlContact = null;

    if (booking.ghl_contact_id) {
      try {
        ghlContact = await ghlService.getContactById(booking.ghl_contact_id);
      } catch (ghlErr) {
        console.warn('[Checkin] GHL contact lookup failed, falling back to MongoDB:', ghlErr.message);
      }
    }

    // Decide which source to validate from
    let bookingStatus, slotDate, memberName, memberEmail, facilityOrVenue;

    if (ghlContact) {
      // GHL is authoritative
      const getField = (key) =>
        ghlContact.customFields?.find((f) => f.fieldKey === key)?.value || null;

      bookingStatus  = getField('contact.booking_status') || booking.booking_status;
      slotDate       = getField('contact.slot_date')       || booking.slot_date;
      facilityOrVenue = getField('contact.facility_or_venue') || booking.facility_or_venue;
      memberName     = `${ghlContact.firstName || ''} ${ghlContact.lastName || ''}`.trim() || booking.name;
      memberEmail    = ghlContact.email || booking.email;
    } else {
      // MongoDB fallback
      bookingStatus  = booking.booking_status;
      slotDate       = booking.slot_date;
      facilityOrVenue = booking.facility_or_venue;
      memberName     = booking.name;
      memberEmail    = booking.email;
    }

    // Already checked in?
    if (['Checked In', 'checked_in'].includes(bookingStatus)) {
      return res.status(200).json({
        success: false,
        valid:   false,
        reason:  'ALREADY_CHECKED_IN',
        message: 'Member has already checked in.',
      });
    }

    // Booking not in a valid state for check-in?
    if (!['Confirmed', 'confirmed'].includes(bookingStatus)) {
      return res.status(200).json({
        success: false,
        valid:   false,
        reason:  'INVALID_STATUS',
        message: `Booking status is ${bookingStatus}.`,
      });
    }

    // Date check — slot_date must be today (SGT)
    const today   = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    const slotDay = slotDate ? slotDate.split('T')[0] : null;

    if (slotDay !== today) {
      return res.status(200).json({
        success: false,
        valid:   false,
        reason:  'WRONG_DATE',
        message: `Booking is for ${slotDay}, not today (${today}).`,
      });
    }

    // Time-window check — check-in is only valid during the booking's
    // time slot. We allow a 15-minute grace window before the start so
    // arriving slightly early still scans cleanly. Past the end time
    // (or 15 min after start with no check-in) the booking is gone.
    const slotStart = booking.slot_start_time;   // HH:MM in 24h
    const slotEnd   = booking.slot_end_time;     // HH:MM in 24h
    const nowTime   = new Date().toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false,
    });

    const toMins = (t) => {
      if (!t) return null;
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const startMins = toMins(slotStart);
    const endMins   = toMins(slotEnd);
    const nowMins   = toMins(nowTime);
    const formatTime = (t) => {
      if (!t) return '—';
      const [h, m] = t.split(':').map(Number);
      const period = h < 12 ? 'AM' : 'PM';
      const h12    = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${h12}:${String(m).padStart(2, '0')} ${period}`;
    };

    if (startMins !== null && nowMins < startMins - 15) {
      return res.status(200).json({
        success: false,
        valid:   false,
        reason:  'TOO_EARLY',
        message: `Booking starts at ${formatTime(slotStart)}. Please come back closer to the start time.`,
      });
    }
    if (endMins !== null && nowMins > endMins) {
      return res.status(200).json({
        success: false,
        valid:   false,
        reason:  'TOO_LATE',
        message: `Booking ended at ${formatTime(slotEnd)}. Please make a new booking.`,
      });
    }

    // ── Step 3: Mark as checked in in MongoDB ─────────────────────────────────
    await bookingStore.updateStatus(booking_reference, 'Checked In');

    // ── Step 4: Send check-in webhook to GHL ──────────────────────────────────
    try {
      await ghlService.sendCheckin({
        email: memberEmail,
        booking_reference,
        checked_in_by,
      });
    } catch (ghlErr) {
      console.warn('[Checkin] GHL webhook failed (non-fatal):', ghlErr.message);
    }

    return res.status(200).json({
      success: true,
      valid:   true,
      message: 'Check-in confirmed.',
      contact: {
        name:              memberName,
        email:             memberEmail,
        booking_reference,
        facility_or_venue: facilityOrVenue,
        slot_date:         slotDate,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { validateAndCheckin };
