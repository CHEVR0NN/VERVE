// Shared venue capacity limits — used by bookingController, guestController, and managementController.
// type: 'slot' = count bookings; type: 'pax' = sum outlet_pax
const VENUE_CAPACITY = {
  'Tennis':        { cap: 4,  type: 'slot' },
  'Squash':        { cap: 4,  type: 'slot' },
  'Gym':           { cap: 20, type: 'pax'  },
  'Le Mansion':    { cap: 15, type: 'pax'  },  // per shift (Lunch / Dinner)
  'Barkerslounge': { cap: 10, type: 'pax'  },
  'Oasis':         { cap: 12, type: 'pax'  },
};

module.exports = VENUE_CAPACITY;
