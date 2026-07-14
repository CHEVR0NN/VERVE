// models/referenceGenerator.js
// Generates booking_reference and pre-computes timestamps for portal bookings

const generateBookingReference = (slotDate) => {
  // Format: BK-YYYYMMDD-XXX (random 3-digit suffix)
  const datePart = slotDate.replace(/-/g, '');
  const suffix = Math.floor(100 + Math.random() * 900);
  return `BK-${datePart}-${suffix}`;
};

const computeTimestamps = (slotStartTime, slotEndTime) => {
  const start = new Date(slotStartTime);
  const end   = new Date(slotEndTime);

  const cancellation_deadline = new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const overdue_check_at      = new Date(start.getTime() + 15 * 60 * 1000).toISOString();
  const no_show_check_at      = new Date(start.getTime() + 30 * 60 * 1000).toISOString();
  const feedback_send_at      = new Date(end.getTime()   +  2 * 60 * 60 * 1000).toISOString();

  return {
    cancellation_deadline,
    overdue_check_at,
    no_show_check_at,
    feedback_send_at,
  };
};

module.exports = { generateBookingReference, computeTimestamps };
