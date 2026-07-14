// routes/staff.js
const express = require('express');
const router  = express.Router();
const { staffAuthenticate } = require('../middleware/staffAuth');
const {
  getSchedule,
  getFnbBookings,
  searchMember,
  getLateCancellations,
  waiveFee,
} = require('../controllers/staffController');

router.get('/schedule',            staffAuthenticate, getSchedule);
router.get('/fnb',                 staffAuthenticate, getFnbBookings);
router.get('/member/:membership_number', staffAuthenticate, searchMember);
router.get('/late-cancellations',  staffAuthenticate, getLateCancellations);
router.post('/waive-fee',          staffAuthenticate, waiveFee);

module.exports = router;
