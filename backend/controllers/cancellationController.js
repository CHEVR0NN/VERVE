// controllers/cancellationController.js
// Handles cancellations from portal (Webhook #2 → FORM-02)

const { validationResult } = require('express-validator');
const ghlService            = require('../models/ghlService');
const bookingStore          = require('../models/bookingStore');

const cancelBooking = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }

    const { email, booking_reference } = req.body;

    // Determine whether this cancellation is late before touching the record.
    // A booking is "in progress" (and therefore a late cancel) if its start
    // time has already passed in SGT.
    const booking = await bookingStore.getByReference(booking_reference);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    // Ownership check — a member may only cancel a booking that belongs to
    // their own membership. Return 404 (not 403) so this endpoint can't be
    // used to probe which references exist for other members.
    const callerMembership = req.user?.membership_number;
    if (!callerMembership || booking.membership_number !== callerMembership) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    // Only Confirmed bookings can be cancelled by the member. Any other state
    // (already cancelled, checked in, completed, no-show, etc.) is terminal
    // from the member's perspective.
    const currentStatus = (booking.booking_status || '').toLowerCase().replace(/[\s_-]+/g, '');
    if (currentStatus === 'cancelled' || currentStatus === 'latecancellation') {
      return res.status(409).json({ success: false, message: 'This booking has already been cancelled.' });
    }
    if (currentStatus === 'checkedin') {
      return res.status(409).json({ success: false, message: 'You have already checked in for this booking. Please speak to a staff member if you need to leave early.' });
    }
    if (currentStatus === 'completed' || currentStatus === 'latefeepaid') {
      return res.status(409).json({ success: false, message: 'This booking has already been completed and can no longer be cancelled.' });
    }
    if (currentStatus === 'noshow') {
      return res.status(409).json({ success: false, message: 'This booking was marked as a no-show and can no longer be cancelled.' });
    }

    // Club policy: cancellations within 24h of the appointment start time
    // count as late and incur a fee. Build the absolute slot start time in
    // Singapore time, derive the cancellation deadline (start − 24h), and
    // check whether we're past it.
    const slotDate  = booking.slot_date  || '';
    const slotStart = booking.slot_start_time || '';
    const slotDateTime = slotDate && slotStart
      ? new Date(`${slotDate}T${slotStart}:00+08:00`)
      : null;
    const cancellationDeadline = slotDateTime
      ? new Date(slotDateTime.getTime() - 24 * 60 * 60 * 1000)
      : null;
    const isLate = cancellationDeadline
      ? Date.now() > cancellationDeadline.getTime()
      : false;

    if (isLate) {
      await bookingStore.flagLateCancellation(booking_reference);
    } else {
      await bookingStore.updateStatus(booking_reference, 'Cancelled');
    }

    await ghlService.sendCancellation({
      email,
      booking_reference,
      is_late_cancellation: isLate,
    });

    return res.status(200).json({
      success: true,
      message: isLate
        ? 'Booking cancelled. Because this is within 24 hours of the appointment, it is recorded as a late cancellation and a fee may apply.'
        : 'Booking cancelled successfully. A confirmation has been sent to your email.',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { cancelBooking };
