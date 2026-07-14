// routes/member.js
const express  = require('express');
const router   = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { getBookingByReference, getMemberBookings, updateMemberBooking, updateMemberProfile, getGuestQuota } = require('../controllers/memberController');

// PUT /api/member/profile  — update logged-in member's profile
router.put(
  '/profile',
  authenticate,
  [
    body('email').isEmail().withMessage('Valid email is required.'),
    body('name').notEmpty().withMessage('Name is required.'),
  ],
  updateMemberProfile
);

// GET /api/member/bookings  — all bookings for the logged-in member
router.get('/bookings', authenticate, getMemberBookings);

// GET /api/member/guest-quota — current monthly guest-pass usage
router.get('/guest-quota', authenticate, getGuestQuota);

// PUT /api/member/bookings/:reference  — edit an upcoming booking
router.put(
  '/bookings/:reference',
  authenticate,
  [body('notes').optional().isLength({ max: 500 }).withMessage('Special request must not exceed 500 characters.')],
  updateMemberBooking
);

// GET /api/booking/:reference  — look up one booking by reference number
router.get('/:reference', authenticate, getBookingByReference);

module.exports = router;
