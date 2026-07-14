// config/ghl.js
// GHL Webhook URLs and API config

module.exports = {
  webhooks: {
    booking:           process.env.GHL_WEBHOOK_BOOKING,
    cancellation:      process.env.GHL_WEBHOOK_CANCELLATION,
    guestRegistration: process.env.GHL_WEBHOOK_GUEST_REGISTRATION,
    walkin:            process.env.GHL_WEBHOOK_WALKIN,
    checkin:           process.env.GHL_WEBHOOK_CHECKIN,
  },
  api: {
    key:        process.env.GHL_API_KEY,
    locationId: process.env.GHL_LOCATION_ID,
    baseUrl:    process.env.GHL_API_BASE_URL,
  },
};
