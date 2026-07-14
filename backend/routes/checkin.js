// routes/checkin.js
// Check-in is a staff-only action — it flips a booking to "Checked In" and
// triggers the GHL workflow. Previously gated by member `authenticate`, which
// let any logged-in member check anyone in (or themselves on a wrong date,
// once status validation was bypassed elsewhere).
const express    = require('express');
const router     = express.Router();
const { body }   = require('express-validator');
const { staffAuthenticate }  = require('../middleware/staffAuth');
const { validateAndCheckin } = require('../controllers/checkinController');

router.post(
  '/',
  staffAuthenticate,
  [
    body('booking_reference').notEmpty().withMessage('booking_reference is required'),
    body('checked_in_by').notEmpty().withMessage('checked_in_by is required'),
  ],
  validateAndCheckin
);

module.exports = router;
