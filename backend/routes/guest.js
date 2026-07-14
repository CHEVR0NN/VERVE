// routes/guest.js
const express    = require('express');
const router     = express.Router();
const { body }   = require('express-validator');
const { authenticate }  = require('../middleware/auth');
const { registerGuest } = require('../controllers/guestController');

router.post(
  '/',
  authenticate,
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('guest_name').notEmpty().withMessage('guest_name is required'),
    body('guest_email').isEmail().withMessage('Valid guest_email is required'),
    body('slot_date').notEmpty().withMessage('slot_date is required'),
    body('facility_or_venue').notEmpty().withMessage('facility_or_venue is required'),
    body('guest_phone').optional({ checkFalsy: true }).matches(/^\+?[\d\s\-(). ]{7,20}$/).withMessage('Invalid phone format for guest_phone.'),
  ],
  registerGuest
);

module.exports = router;
