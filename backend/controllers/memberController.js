// controllers/memberController.js
// Read-only data endpoints that the frontend calls to display booking info

const { validationResult } = require('express-validator');
const ghlService   = require('../models/ghlService');
const ghlConfig    = require('../config/ghl');
const bookingStore = require('../models/bookingStore');
const Member       = require('../models/Member');

// ── GET /api/member/bookings ──────────────────────────────────────────────────
// Reads from MongoDB (written at booking time) so the dashboard has data
// immediately — no dependency on GHL's async workflow delay.
const getMemberBookings = async (req, res, next) => {
  try {
    const { membership_number } = req.user;

    const bookings = await bookingStore.getByMember(membership_number);

    return res.status(200).json({
      success:  true,
      count:    bookings.length,
      bookings,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/member/:reference ────────────────────────────────────────────────
// Look up a single booking by its reference number (e.g. BK-20260325-412)
const getBookingByReference = async (req, res, next) => {
  try {
    const { reference } = req.params;

    const contact = await ghlService.findContactByReference(reference);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Booking reference not found.',
      });
    }

    const getField = (key) =>
      contact.customFields?.find((f) => f.fieldKey === `contact.${key}`)?.value || null;

    return res.status(200).json({
      success: true,
      booking: {
        booking_reference:     reference,
        name:                  `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        email:                 contact.email,
        phone:                 contact.phone,
        membership_number:     getField('membership_number'),
        facility_or_venue:     getField('facility_or_venue'),
        slot_date:             getField('slot_date'),
        slot_start_time:       getField('slot_start_time'),
        slot_end_time:         getField('slot_end_time'),
        outlet_pax:            getField('outlet_pax'),
        booking_status:        getField('booking_status'),
        booking_type:          getField('booking_type'),
        checked_in_at:         getField('checked_in_at'),
        cancellation_deadline: getField('cancellation_deadline'),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/member/bookings/:reference ───────────────────────────────────────
// Allows a member to update editable fields on their own upcoming booking.
const updateMemberBooking = async (req, res, next) => {
  try {
    const { reference } = req.params;
    const { membership_number } = req.user;

    // Verify the booking belongs to this member
    const existing = await bookingStore.getByReference(reference);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }
    if (existing.membership_number !== membership_number) {
      return res.status(403).json({ success: false, message: 'Not authorised to edit this booking.' });
    }

    const status = (existing.booking_status || '').toLowerCase().replace(/[\s_]+/g, '-');
    const lockedStatuses = ['cancelled', 'late-cancellation', 'checked-in', 'no-show', 'completed', 'done', 'late-fee-paid'];
    if (lockedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'This booking can no longer be edited.' });
    }

    // Reject updates to a past date
    if (req.body.slot_date) {
      const todaySG = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
      if (req.body.slot_date < todaySG) {
        return res.status(422).json({ success: false, message: 'Cannot reschedule to a past date.' });
      }
    }

    const { slot_date, slot_start_time, slot_end_time, outlet_pax, notes } = req.body;

    // Reject if end time is not after start time (treat midnight 00:00 as 24:00)
    if (slot_start_time && slot_end_time) {
      const norm = t => (t === '00:00' ? '24:00' : t);
      if (norm(slot_end_time) <= norm(slot_start_time)) {
        return res.status(422).json({ success: false, message: 'End time must be after start time.' });
      }
    }

    // Re-check time-slot capacity when the member moves their booking. We
    // exclude the booking being edited from the overlap count by comparing
    // booking_reference, otherwise the booking would "compete with itself".
    if (slot_date && slot_start_time && slot_end_time) {
      const VENUE_CAPACITY = require('../config/venueCapacity');
      const vcap = VENUE_CAPACITY[existing.facility_or_venue];
      if (vcap) {
        const shift = existing.booking_shift || null;
        const overlappingCount = await bookingStore.getOverlappingCount(
          existing.facility_or_venue, slot_date, slot_start_time, slot_end_time, shift,
        );
        // Subtract 1 if the current booking would itself match the window
        // (which it will, because we're re-saving the same booking_reference).
        const incoming = vcap.type === 'pax'
          ? (parseInt(outlet_pax || existing.outlet_pax) || 1)
          : 1;
        const effectiveCount = Math.max(0, overlappingCount - incoming);
        if (effectiveCount + incoming > vcap.cap) {
          return res.status(409).json({
            success: false,
            message: `${existing.facility_or_venue} is fully booked at that time. Please choose a different time.`,
          });
        }
      }
    }

    const updated = await bookingStore.updateBooking(reference, { slot_date, slot_start_time, slot_end_time, outlet_pax, notes });
    return res.status(200).json({ success: true, booking: updated });
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/member/profile ──────────────────────────────────────────────────
// Allows a member to update their own profile (name, email, phone).
// Persists changes to GHL so they survive logout/login.
const updateMemberProfile = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }

    const { id: contactId } = req.user;
    const { name, email, phone } = req.body;

    // Split full name into firstName / lastName for GHL
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName  = nameParts.slice(1).join(' ') || '';

    // Only call GHL for real contacts (skip dev accounts with fake IDs)
    const isDevAccount = contactId && contactId.startsWith('dev-');
    if (!isDevAccount) {
      const payload = { firstName, lastName, email, locationId: ghlConfig.api.locationId };
      if (phone !== undefined) payload.phone = phone;
      await ghlService.ghlApiPut(`/contacts/${contactId}`, payload);
    }

    // Persist to MongoDB so login can use updated data
    const fullName = `${firstName} ${lastName}`.trim();
    await Member.findOneAndUpdate(
      { membership_number: req.user.membership_number },
      { name: fullName, email, phone: phone || '', ghl_contact_id: contactId },
      { upsert: true, returnDocument: 'after' }
    );

    return res.status(200).json({
      success: true,
      member: {
        membership_number: req.user.membership_number,
        name:  fullName,
        email,
        phone: phone || '',
      },
    });
  } catch (err) {
    console.error('updateMemberProfile error:', {
      contactId: req.user?.id,
      status: err.response?.status,
      data: err.response?.data,
      message: err.message,
    });
    next(err);
  }
};

// ── GET /api/member/guest-quota ─────────────────────────────────────────────
// Returns the member's current monthly guest-pass usage so the frontend can
// gate the guest-registration form (cap the add-guest button, show remaining).
// Source of truth is MongoDB — counted from bookings of type guest_pass/guest
// for the current month. Cancelled passes don't count against quota.
const MONTHLY_GUEST_QUOTA = 4;

const getGuestQuota = async (req, res, next) => {
  try {
    const { membership_number } = req.user;
    const todaySG = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    const monthStart = todaySG.slice(0, 7) + '-01';
    const lastDay = new Date(
      new Date(todaySG).getUTCFullYear(),
      new Date(todaySG).getUTCMonth() + 1,
      0,
    ).getUTCDate();
    const monthEnd = `${todaySG.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;

    const used = await bookingStore.getMonthlyGuestCountByMember(
      membership_number, monthStart, monthEnd,
    );
    const remaining = Math.max(0, MONTHLY_GUEST_QUOTA - used);

    return res.status(200).json({
      success: true,
      used,
      max: MONTHLY_GUEST_QUOTA,
      remaining,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getBookingByReference, getMemberBookings, updateMemberBooking, updateMemberProfile, getGuestQuota };
