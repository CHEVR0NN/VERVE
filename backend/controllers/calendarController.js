// controllers/calendarController.js
// Returns available time slots from a GHL calendar

const ghlService = require('../models/ghlService');

const getSlots = async (req, res, next) => {
  try {
    const { calendarId } = req.params;

    // Default window: today → 30 days ahead
    const today  = new Date().toISOString().split('T')[0];
    const in30   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const startDate = req.query.startDate || today;
    const endDate   = req.query.endDate   || in30;

    const slots = await ghlService.getCalendarFreeSlots(calendarId, startDate, endDate);

    return res.status(200).json({
      success:    true,
      calendarId,
      slots,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSlots };
