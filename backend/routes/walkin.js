// routes/walkin.js
// Walk-in logging is a staff-only action — it inserts a "Walkin" booking
// row. Previously gated by member `authenticate`, which let any logged-in
// member fabricate walk-in rows.
const express    = require('express');
const router     = express.Router();
const { body }   = require('express-validator');
const { staffAuthenticate } = require('../middleware/staffAuth');
const { logWalkin }         = require('../controllers/walkinController');

router.post(
  '/',
  staffAuthenticate,
  [
    body('name').notEmpty().withMessage('name is required'),
    body('facility').notEmpty().withMessage('facility is required'),
    body('pax').notEmpty().withMessage('pax is required'),
    body('staff_id').notEmpty().withMessage('staff_id is required'),
  ],
  logWalkin
);

module.exports = router;
