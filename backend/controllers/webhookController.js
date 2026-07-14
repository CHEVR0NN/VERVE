// controllers/webhookController.js
// Receives inbound webhook events FROM GHL (when automations fire back to us)

const crypto       = require('crypto');
const bookingStore = require('../models/bookingStore');

// Constant-time compare that never throws on length mismatch.
const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

const handleGhlEvent = async (req, res, next) => {
  try {
    // ── Header-only secret guard (timing-safe) ────────────────────────────────
    const secret   = process.env.GHL_WEBHOOK_SECRET;
    const provided = req.headers['x-ghl-secret'];
    if (!secret || !safeEqual(provided, secret)) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    const payload = req.body;

    // GHL sends the event type in different keys depending on the workflow config.
    // Common patterns: payload.event, payload.type, or a custom field you set.
    const eventType = payload.event || payload.type || 'unknown';

    console.log(`[GHL Inbound] Event: ${eventType}`, JSON.stringify(payload, null, 2));

    // ── Route to handler by event type ───────────────────────────────────────
    switch (eventType) {
      case 'no_show_confirmed':
        handleNoShow(payload);
        break;

      case 'feedback_sent':
        handleFeedbackSent(payload);
        break;

      case 'booking_status_update':
        handleStatusUpdate(payload);
        break;

      case 'late_cancellation_flagged':
        handleLateCancellation(payload);
        break;

      case 'chatbot_booking':
        await handleChatbotBooking(payload);
        break;

      case 'pipeline_stage_changed':
        await handlePipelineStageChange(payload);
        break;

      default:
        // Unknown event — still acknowledge so GHL doesn't retry
        console.log(`[GHL Inbound] Unhandled event type: "${eventType}"`);
    }

    // ── Always respond 200 immediately so GHL does not retry ─────────────────
    return res.status(200).json({ success: true, received: true, event: eventType });

  } catch (err) {
    next(err);
  }
};

// ─── Event handlers (extend these as your GHL workflows evolve) ──────────────

const handleNoShow = async (payload) => {
  // payload should contain: booking_reference, email, slot_date, facility_or_venue
  const { booking_reference } = payload;
  if (!booking_reference) return;
  await bookingStore.updateStatus(booking_reference, 'No Show');
  console.log(`[GHL Event] No-show confirmed for booking: ${booking_reference}`);
};

const handleFeedbackSent = (payload) => {
  // payload should contain: booking_reference, email
  console.log(`[GHL Event] Feedback sent for booking: ${payload.booking_reference}`);
};

const handleStatusUpdate = async (payload) => {
  // payload should contain: booking_reference, new_status
  const { booking_reference, new_status } = payload;
  if (!booking_reference || !new_status) return;
  await bookingStore.updateStatus(booking_reference, new_status);
  console.log(`[GHL Event] Status updated — ${booking_reference}: ${new_status}`);
};

const handleLateCancellation = async (payload) => {
  const { booking_reference } = payload;
  if (!booking_reference) return;
  await bookingStore.flagLateCancellation(booking_reference);
  console.log(`[GHL Event] Late cancellation flagged: ${booking_reference}`);
};

// Map GHL pipeline stage names → canonical booking_status used in Mongo.
// Keys are normalized (lowercased, non-alphanumerics stripped) for fuzzy matching.
const STAGE_TO_STATUS = {
  confirmed:       'Confirmed',
  checkedin:       'Checked In',
  completed:       'Completed',
  cancelled:       'Cancelled',
  noshow:          'No Show',
  latecancellation:'Late Cancellation',
  latefeepaid:     'late_fee_paid',
};

const handlePipelineStageChange = async (payload) => {
  // payload: opportunity_id, opportunity_name (prefixed with booking_reference),
  //          pipeline_id, old_stage, new_stage, contact_id
  const { opportunity_name, new_stage } = payload;
  if (!opportunity_name || !new_stage) {
    console.warn('[GHL Event] pipeline_stage_changed missing opportunity_name or new_stage', payload);
    return;
  }

  // Opportunity name is "{booking_reference} — {name} — {venue} — {date}".
  // Extract just the booking reference prefix (BK-... or WK-...).
  const match = String(opportunity_name).match(/^((?:BK|WK)-\S+)/i);
  if (!match) {
    console.warn(`[GHL Event] Opportunity "${opportunity_name}" does not start with a booking reference — skipping`);
    return;
  }
  const booking_reference = match[1];

  const key    = String(new_stage).toLowerCase().replace(/[^a-z0-9]/g, '');
  const status = STAGE_TO_STATUS[key];
  if (!status) {
    console.warn(`[GHL Event] No status mapping for stage "${new_stage}" — skipping`);
    return;
  }

  // Late Cancellation and Late Fee Paid both imply the late_cancellation flag
  // should be set so the Late Cancellation Fees list finds the booking.
  if (status === 'Late Cancellation') {
    await bookingStore.flagLateCancellation(booking_reference);
  } else if (status === 'late_fee_paid') {
    await bookingStore.flagLateCancellation(booking_reference);
    await bookingStore.markFeePaid(booking_reference, 'ghl_workflow');
  } else {
    await bookingStore.updateStatus(booking_reference, status);
  }
  console.log(`[GHL Event] ${booking_reference}: stage "${new_stage}" → status "${status}"`);
};

const handleChatbotBooking = async (payload) => {
  const {
    booking_reference,
    membership_number,
    email,
    name,
    facility_or_venue,
    slot_date,
    slot_start_time,
    slot_end_time,
    booking_shift,
    outlet_pax,
  } = payload;

  if (!booking_reference || !membership_number || !email) return;

  await bookingStore.save({
    booking_reference,
    membership_number,
    email,
    name:            name || '',
    facility_or_venue,
    booking_type:    'advance',
    booking_status:  'Confirmed',
    booking_shift:   booking_shift || '',
    slot_date,
    slot_start_time: slot_start_time || '',
    slot_end_time:   slot_end_time   || '',
    outlet_pax:      outlet_pax      || null,
    created_at:      new Date().toISOString(),
  });

  console.log(`[GHL Event] Chatbot booking saved to MongoDB: ${booking_reference}`);
};

module.exports = { handleGhlEvent };
