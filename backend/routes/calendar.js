// routes/calendar.js
const express  = require('express');
const router   = express.Router();
const { authenticate }  = require('../middleware/auth');
const { getSlots } = require('../controllers/calendarController');

// GET /api/calendars/:calendarId/slots
// Optional query: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/:calendarId/slots', authenticate, getSlots);

module.exports = router;
