// controllers/guestController.js
// Handles guest registration from portal (Webhook #3 → FORM-03)

const { validationResult }          = require('express-validator');
const ghlService                    = require('../models/ghlService');
const bookingStore                  = require('../models/bookingStore');
const { generateBookingReference }  = require('../models/referenceGenerator');
const VENUE_CAPACITY                = require('../config/venueCapacity');

const registerGuest = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }

    const {
      email,
      guest_name,
      guest_email,
      guest_phone,
      slot_date,
      facility_or_venue,
      booking_shift,
    } = req.body;

    const inviting_member_id = req.user.membership_number;

    // Monthly guest quota — Mongo is source of truth (instant, no GHL lag).
    // Counts guest-pass bookings for this member within the current SGT month.
    // Cancelled passes do not count against the quota.
    const MONTHLY_QUOTA = 4;
    const todaySG = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    const monthStart = todaySG.slice(0, 7) + '-01';
    const lastDay = new Date(
      new Date(todaySG).getUTCFullYear(),
      new Date(todaySG).getUTCMonth() + 1,
      0,
    ).getUTCDate();
    const monthEnd = `${todaySG.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
    const usedThisMonth = await bookingStore.getMonthlyGuestCountByMember(
      inviting_member_id, monthStart, monthEnd,
    );
    if (usedThisMonth >= MONTHLY_QUOTA) {
      return res.status(429).json({
        success: false,
        message: `You have reached your monthly guest limit of ${MONTHLY_QUOTA}. You've already registered ${usedThisMonth} guest(s) this month. Your quota resets on the 1st of next month.`,
      });
    }

    // Reject if facility/venue is blocked on this date
    const blocked = await bookingStore.isBlocked(facility_or_venue, slot_date);
    if (blocked) {
      return res.status(409).json({
        success: false,
        message: `${facility_or_venue} is not available on ${slot_date} due to a scheduled maintenance block.`,
      });
    }

    // Reject if facility is at capacity for the requested time slot. Guests
    // share the same per-time-slot capacity as members.
    const vcap = VENUE_CAPACITY[facility_or_venue];
    if (vcap) {
      const shift = booking_shift || null;
      // Guest passes inherit the visit date but not a specific time range here.
      // Treat as a full-day reservation for capacity purposes (use same shift).
      const overlappingCount = await bookingStore.getVenueCount(
        facility_or_venue, slot_date, shift,
      );
      if (overlappingCount + 1 > vcap.cap) {
        const shiftLabel = shift ? ` (${shift})` : '';
        return res.status(409).json({
          success: false,
          message: `${facility_or_venue}${shiftLabel} is fully booked for ${slot_date}. Please choose a different date.`,
        });
      }
    }

    const booking_reference = generateBookingReference(slot_date);

    await ghlService.sendGuestRegistration({
      email,
      guest_name,
      guest_email,
      guest_phone:        guest_phone || '',
      inviting_member_id,
      slot_date,
      facility_or_venue,
      booking_shift:      booking_shift || '',
      booking_reference,
    });

    await bookingStore.save({
      booking_reference,
      membership_number: inviting_member_id,
      email,                          // inviting member's email
      name:              guest_name,  // guest's name
      guest_email,                    // guest's email (separate from member's)
      guest_phone:       guest_phone || '',
      facility_or_venue,
      booking_type:      'guest_pass',
      booking_status:    'Confirmed',
      booking_shift:     booking_shift || '',
      slot_date,
      source:            'guest_pass',
      created_by:        inviting_member_id,
    });

    return res.status(200).json({
      success:           true,
      message:           'Guest registered successfully. A confirmation has been sent to the member\'s email.',
      booking_reference,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { registerGuest };
