// controllers/walkinController.js
// Handles walk-in logging from staff (Webhook #4 → STAFF-01)

const { validationResult } = require('express-validator');
const ghlService            = require('../models/ghlService');
const bookingStore          = require('../models/bookingStore');

const logWalkin = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }

    const { name, phone, facility, pax, staff_id } = req.body;

    const now        = new Date();
    const slot_date  = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    const slot_start_time = now.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const booking_reference = `WK-${Date.now()}`;

    // Save to MongoDB so walk-ins appear on staff schedule and management occupancy
    await bookingStore.save({
      booking_reference,
      membership_number: staff_id || 'STAFF',
      name,
      email: '',
      facility_or_venue: facility,
      booking_type:      'walkin',
      booking_status:    'Walkin',
      slot_date,
      slot_start_time,
      outlet_pax:        pax || '1',
      notes:             phone ? `Phone: ${phone}` : '',
      source:            'walkin',
      created_by:        req.staff?.username || staff_id || null,
    });

    // Sync to GHL (best-effort)
    try {
      await ghlService.sendWalkin({
        name, phone, facility, pax, staff_id,
        booking_reference, slot_date, slot_start_time,
      });
    } catch (_) { /* GHL sync is best-effort */ }

    return res.status(200).json({
      success: true,
      message: 'Walk-in logged successfully.',
      booking_reference,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { logWalkin };
