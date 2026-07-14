// controllers/staffController.js

const ghlService   = require('../models/ghlService');
const bookingStore = require('../models/bookingStore');

// ── Helper: today's date in Singapore timezone (YYYY-MM-DD) ──────────────────
const todaySGT = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });

// ── Dev-only member accounts (mirrors authController.js DEV_MEMBERS) ─────────
const DEV_MEMBERS = [
  { id: 'dev-001', membership_number: 'VRV-0001', email: 'alice.tan@vrv.com',     firstName: 'Alice', lastName: 'Tan',  membership_tier: 'Full Member' },
  { id: 'dev-002', membership_number: 'VRV-0002', email: 'bob.lim@vrv.com',       firstName: 'Bob',   lastName: 'Lim',  membership_tier: 'Full Member' },
  { id: 'dev-003', membership_number: 'VRV-0003', email: 'carol.ng@vrv.com',      firstName: 'Carol', lastName: 'Ng',   membership_tier: 'Full Member' },
  { id: 'dev-004', membership_number: 'VRV-0004', email: 'brixdodd07@gmail.com',  firstName: 'David', lastName: 'Chen', membership_tier: 'Full Member' },
];

// ── GET /api/staff/schedule ───────────────────────────────────────────────────
const getSchedule = async (req, res, next) => {
  try {
    const date  = todaySGT();
    let bookings = await bookingStore.getByDate(date);

    bookings = bookings.filter((b) => b.booking_type !== 'block');

    const { type, venue } = req.query;
    if (type)  bookings = bookings.filter((b) => b.booking_type  === type);
    if (venue) bookings = bookings.filter((b) => b.facility_or_venue === venue);

    return res.status(200).json({ success: true, date, count: bookings.length, bookings });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/staff/fnb ────────────────────────────────────────────────────────
const getFnbBookings = async (req, res, next) => {
  try {
    const date      = todaySGT();
    const FNB_VENUES = ['Le Mansion', 'Barkerslounge', 'Oasis', "Barker's Lounge"];
    let bookings     = await bookingStore.getByDateAndVenues(date, FNB_VENUES);

    const { venue, shift } = req.query;
    if (venue) bookings = bookings.filter((b) => b.facility_or_venue === venue);
    if (shift) bookings = bookings.filter((b) => b.booking_shift    === shift);

    return res.status(200).json({ success: true, date, count: bookings.length, bookings });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/staff/member/:membership_number ──────────────────────────────────
// GHL's GET search only queries standard fields (name, email, phone) — NOT
// custom fields.  membership_number lives in a custom field, so we need
// multiple lookup strategies.
const searchMember = async (req, res, next) => {
  try {
    const { membership_number } = req.params;
    let contact = null;

    // ── Strategy 1: GHL query search (works if GHL indexes custom fields) ──
    try {
      const ghlResults = await ghlService.findContactsByMember(membership_number);
      if (ghlResults.length > 0) contact = ghlResults[0];
    } catch (_) { /* non-fatal — fall through to next strategy */ }

    // ── Strategy 2: email lookup via past bookings in MongoDB ───────────────
    // If the member ever booked before, their email is in MongoDB.
    // Email IS a standard GHL field, so searching by it always works.
    if (!contact) {
      try {
        const pastBookings = await bookingStore.getByMember(membership_number);
        const email = pastBookings.find((b) => b.email)?.email;
        if (email) {
          const ghlContact = await ghlService.findContactByEmail(email);
          if (ghlContact) {
            // Verify the custom field actually matches to avoid false positives
            const field = ghlContact.customFields?.find(
              (f) => f.fieldKey === 'contact.membership_number'
            );
            if (field && field.value === String(membership_number)) {
              contact = ghlContact;
            }
          }
        }
      } catch (_) { /* non-fatal — fall through to next strategy */ }
    }

    // ── Strategy 3: built-in member fallback (test / seed accounts) ──────────
    if (!contact) {
      const dev = DEV_MEMBERS.find((m) => m.membership_number === membership_number);
      if (dev) {
        contact = {
          id:           dev.id,
          name:         `${dev.firstName} ${dev.lastName}`.trim(),
          firstName:    dev.firstName,
          lastName:     dev.lastName,
          email:        dev.email,
          phone:        '',
          customFields: [
            { fieldKey: 'contact.membership_number', value: dev.membership_number },
            { fieldKey: 'contact.membership_tier',   value: dev.membership_tier   },
          ],
        };
      }
    }

    if (!contact) {
      return res.status(404).json({ success: false, message: 'Member not found.' });
    }

    const getField = (key) =>
      contact.customFields?.find((f) => f.fieldKey === `contact.${key}`)?.value || null;

    const date           = todaySGT();
    const allToday       = await bookingStore.getByDate(date);
    const todaysBookings = allToday.filter((b) => b.membership_number === membership_number);

    return res.status(200).json({
      success: true,
      contact: {
        id:                contact.id,
        name:              contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        membership_number,
        membership_tier:   getField('membership_tier'),
        email:             contact.email,
        phone:             contact.phone,
      },
      todays_bookings: todaysBookings,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/staff/late-cancellations ─────────────────────────────────────────
const getLateCancellations = async (req, res, next) => {
  try {
    const bookings = await bookingStore.getLateCancellations();
    return res.status(200).json({ success: true, count: bookings.length, bookings });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/staff/waive-fee ─────────────────────────────────────────────────
const waiveFee = async (req, res, next) => {
  try {
    const { booking_reference, waiver_reason } = req.body;
    if (!booking_reference || !waiver_reason) {
      return res.status(422).json({ success: false, message: 'Please select a booking and enter a reason for the waiver.' });
    }

    const waiver_by = req.staff.username;
    await bookingStore.waiveFee(booking_reference, waiver_reason, waiver_by);

    // Update GHL contact fields
    const contact = await ghlService.findContactByReference(booking_reference);
    if (contact) {
      await ghlService.updateContactCustomFields(contact.id, [
        { id: 'N1P00iQI8CNFUfh2BzUN', field_value: 'true'          },
        { id: 'SsjDZhq4Fe9gcaAnVEpo', field_value: waiver_reason    },
        { id: 'Q2YmvIjxUJliP9Yah51r', field_value: waiver_by        },
      ]);
    }

    return res.status(200).json({ success: true, message: 'Fee waived.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSchedule, getFnbBookings, searchMember, getLateCancellations, waiveFee };
