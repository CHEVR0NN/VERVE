// routes/cancellation.js
const express    = require('express');
const router     = express.Router();
const { body }   = require('express-validator');
const { authenticate }  = require('../middleware/auth');
const { cancelBooking } = require('../controllers/cancellationController');

router.post(
  '/',
  authenticate,
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('booking_reference').notEmpty().withMessage('booking_reference is required'),
  ],
  cancelBooking
);

module.exports = router;
