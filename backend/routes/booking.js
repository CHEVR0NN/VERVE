// routes/booking.js
const express    = require('express');
const router     = express.Router();
const { body }   = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { createBooking, getAvailability } = require('../controllers/bookingController');

// GET /api/booking/availability — usage per 30-min slot for a venue+date.
// Used by the booking form to show "Fully booked" indicators in the
// time-of-day dropdown so members don't pick an already-full slot.
router.get('/availability', authenticate, getAvailability);

router.post(
  '/',
  authenticate,
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('name').notEmpty().withMessage('name is required'),
    body('membership_number').notEmpty().withMessage('membership_number is required'),
    body('facility_or_venue').notEmpty().withMessage('facility_or_venue is required'),
    body('slot_date').notEmpty().withMessage('slot_date is required'),
    body('slot_start_time').notEmpty().withMessage('slot_start_time is required'),
    body('slot_end_time').notEmpty().withMessage('slot_end_time is required'),
    body('outlet_pax').notEmpty().withMessage('outlet_pax is required'),
    body('special_request').optional().isLength({ max: 500 }).withMessage('Special request must not exceed 500 characters.'),
  ],
  createBooking
);

module.exports = router;
