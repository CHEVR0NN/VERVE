// config/ghlFields.js
// GHL custom field IDs — override via environment variables if they ever change.
// Defaults are the current production values so the app works without any env changes.

module.exports = {
  // Booking fields
  FACILITY_VENUE_FIELD_ID:  process.env.GHL_FIELD_FACILITY_VENUE   || 'Bq7GyXHl7R1CkTTMsgrQ',
  SLOT_DATE_FIELD_ID:       process.env.GHL_FIELD_SLOT_DATE         || '8F0oLk8zIWl8yiCUGXLU',
  SLOT_START_TIME_FIELD_ID: process.env.GHL_FIELD_SLOT_START_TIME   || 'kxwtxq6k8SSFfCtzpNuE',
  PAX_FIELD_ID:             process.env.GHL_FIELD_PAX               || 'xlQ10Z5Sslipo9Gt5pME',
  SPECIAL_REQUEST_FIELD_ID: process.env.GHL_FIELD_SPECIAL_REQUEST   || 'uX31vc3MUdjyFVq7vQaB',
  BOOKING_SHIFT_FIELD_ID:   process.env.GHL_FIELD_BOOKING_SHIFT     || 'oiy68P9Gw75biepxirp0',

  // Event fields
  EVENT_NAME_FIELD_ID:        process.env.GHL_FIELD_EVENT_NAME        || 'HiKm62g7u0DPqw9Bp2m5',
  EVENT_DESCRIPTION_FIELD_ID: process.env.GHL_FIELD_EVENT_DESCRIPTION || 'sEteuTMvOTtVpXJ1R4j6',
  EVENT_DATE_FIELD_ID:        process.env.GHL_FIELD_EVENT_DATE        || 'VrOhqSZmsREZngeDpDv6',
  EVENT_DURATION_FIELD_ID:    process.env.GHL_FIELD_EVENT_DURATION    || 'rrbayrZl52WbRHRRDcJg',
};
