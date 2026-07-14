// controllers/eventController.js
// Handles event CRUD, GHL sync, and notification creation.

const Event        = require('../models/Event');
const Notification = require('../models/Notification');
const Reply        = require('../models/Reply');
const ghlService   = require('../models/ghlService');

// ── Upload validation ────────────────────────────────────────────────────────
const MAX_UPLOAD_B64_LEN = Math.ceil(500 * 1024 * 4 / 3); // 500 KB file → ~683 KB base64

function validateUpload(b64, type) {
  if (!b64 || b64 === '') return null;
  const data = b64.includes(',') ? b64.split(',')[1] : b64;
  if (!data) return `Invalid ${type} data.`;
  if (data.length > MAX_UPLOAD_B64_LEN) return `${type} must be 500 KB or smaller.`;
  if (type === 'image' && !data.startsWith('iVBOR') && !data.startsWith('/9j/')) {
    return 'Image must be PNG or JPG format.';
  }
  if (type === 'pdf' && !data.startsWith('JVBER')) {
    return 'File must be PDF format.';
  }
  return null;
}

// ── GHL custom field IDs for events ──────────────────────────────────────────
const {
  EVENT_NAME_FIELD_ID,
  EVENT_DESCRIPTION_FIELD_ID,
  EVENT_DATE_FIELD_ID,
  EVENT_DURATION_FIELD_ID,
} = require('../config/ghlFields');

// ── POST /api/management/events — Create a new event ─────────────────────────
const createEvent = async (req, res, next) => {
  try {
    const { event_name, event_description, event_date, event_duration, event_venue, image, pdf, pdf_filename } = req.body;

    if (!event_name || !event_description || !event_date || !event_duration || !event_venue) {
      return res.status(422).json({ success: false, message: 'All required fields must be provided.' });
    }

    if (image) {
      const imgErr = validateUpload(image, 'image');
      if (imgErr) return res.status(422).json({ success: false, message: imgErr });
    }
    if (pdf) {
      const pdfErr = validateUpload(pdf, 'pdf');
      if (pdfErr) return res.status(422).json({ success: false, message: pdfErr });
    }

    // Save event to MongoDB (image stored as base64 in MongoDB)
    const event = await Event.create({
      event_name,
      event_description,
      event_date,
      event_duration,
      event_venue,
      image_url:    image || '',
      pdf_url:      pdf || '',
      pdf_filename: pdf_filename || '',
      created_by:   req.mgmt.displayName || req.mgmt.username || 'Management',
      status:       'active',
    });

    // Sync event info to GHL — update location-level custom fields (best-effort)
    try {
      // Use GHL API to search for all contacts in the location and broadcast
      // We store the event data by creating a contact record tagged as an event
      const ghlPayload = {
        email:             `event+${Date.now()}@src.internal`,
        name:              `EVENT: ${event_name}`,
        customFields: [
          { id: EVENT_NAME_FIELD_ID,        field_value: event_name },
          { id: EVENT_DESCRIPTION_FIELD_ID, field_value: event_description },
          { id: EVENT_DATE_FIELD_ID,        field_value: event_date },
          { id: EVENT_DURATION_FIELD_ID,    field_value: event_duration },
        ],
      };
      await ghlService.ghlApiPost('/contacts/', {
        ...ghlPayload,
        locationId: require('../config/ghl').api.locationId,
      });
    } catch (_) { /* GHL sync is best-effort */ }

    // Create notification for all members
    await Notification.create({
      type:         'event',
      title:        `New Event: ${event_name}`,
      message:      event_description.length > 150 ? event_description.slice(0, 150) + '...' : event_description,
      reference_id: event._id.toString(),
      category:     'events',
      created_by:   req.mgmt.displayName || req.mgmt.username || 'Management',
    });

    return res.json({ success: true, message: 'Event created and notifications sent.', event });
  } catch (err) { next(err); }
};

// ── GET /api/management/events — List all events (admin) ─────────────────────
const getEvents = async (req, res, next) => {
  try {
    const events = await Event.find().sort({ event_date: -1 }).lean();
    return res.json({ success: true, count: events.length, events });
  } catch (err) { next(err); }
};

// ── GET /api/management/events/:id — Get single event (admin) ────────────────
const getEventById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const event = await Event.findById(id).lean();
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });
    return res.json({ success: true, event });
  } catch (err) { next(err); }
};

// ── PUT /api/management/events/:id — Update an event ─────────────────────────
const updateEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { event_name, event_description, event_date, event_duration, event_venue, image, pdf, pdf_filename } = req.body;

    if (!event_name || !event_description || !event_date || !event_duration || !event_venue) {
      return res.status(422).json({ success: false, message: 'All required fields must be provided.' });
    }

    if (image) {
      const imgErr = validateUpload(image, 'image');
      if (imgErr) return res.status(422).json({ success: false, message: imgErr });
    }
    if (pdf) {
      const pdfErr = validateUpload(pdf, 'pdf');
      if (pdfErr) return res.status(422).json({ success: false, message: pdfErr });
    }

    const updates = {
      event_name,
      event_description,
      event_date,
      event_duration,
      event_venue,
    };

    // Only update image/pdf if new ones are provided (non-empty)
    if (image !== undefined && image !== '') updates.image_url = image;
    if (pdf !== undefined && pdf !== '') { updates.pdf_url = pdf; updates.pdf_filename = pdf_filename || ''; }
    // Allow clearing pdf
    if (pdf === '') { updates.pdf_url = ''; updates.pdf_filename = ''; }

    const event = await Event.findByIdAndUpdate(id, updates, { returnDocument: 'after' }).lean();
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });

    // Sync update to GHL (best-effort)
    try {
      const ghlConfig = require('../config/ghl');
      // Search for the GHL contact associated with this event
      const searchResult = await ghlService.ghlApiGet('/contacts/search', {
        locationId: ghlConfig.api.locationId,
        query: `EVENT: ${event_name}`,
      });
      const contacts = searchResult.contacts || [];
      if (contacts.length > 0) {
        await ghlService.updateContactCustomFields(contacts[0].id, [
          { id: EVENT_NAME_FIELD_ID,        field_value: event_name },
          { id: EVENT_DESCRIPTION_FIELD_ID, field_value: event_description },
          { id: EVENT_DATE_FIELD_ID,        field_value: event_date },
          { id: EVENT_DURATION_FIELD_ID,    field_value: event_duration },
        ]);
      }
    } catch (_) { /* GHL sync is best-effort */ }

    // Create notification for event update so members are informed
    await Notification.create({
      type:         'notice',
      title:        `Event Updated: ${event_name}`,
      message:      event_description.length > 150 ? event_description.slice(0, 150) + '...' : event_description,
      reference_id: event._id.toString(),
      category:     'events',
      created_by:   req.mgmt.displayName || req.mgmt.username || 'Management',
    });

    return res.json({ success: true, message: 'Event updated and members notified.', event });
  } catch (err) { next(err); }
};

// ── DELETE /api/management/events/:id — Archive an event (soft delete) ───────
const deleteEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const event = await Event.findByIdAndUpdate(
      id,
      { status: 'archived' },
      { new: true }
    );
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });

    // Remove associated notifications so inbox stays clean
    await Notification.deleteMany({ reference_id: id });

    return res.json({ success: true, message: 'Event archived.' });
  } catch (err) { next(err); }
};

// ── GET /api/events — Public: list active events (member portal) ─────────────
const getActiveEvents = async (req, res, next) => {
  try {
    const events = await Event.find({ status: 'active' }).sort({ event_date: 1 }).lean();

    // Map to frontend-friendly format
    const mapped = events.map(ev => ({
      _id:   ev._id,
      title: ev.event_name,
      desc:  ev.event_description,
      date:  ev.event_date,
      duration: ev.event_duration,
      venue: ev.event_venue,
      img:   ev.image_url,
      pdf:   ev.pdf_url,
      pdf_filename: ev.pdf_filename,
      createdAt: ev.createdAt,
    }));

    return res.json({ success: true, count: mapped.length, events: mapped });
  } catch (err) { next(err); }
};

// ── GET /api/notifications/poll — Poll for unread notification count ────────
const pollNotifications = async (req, res, next) => {
  try {
    const membership_number = req.user?.membership_number || '';
    const unreadCount = await Notification.countDocuments({
      read_by: { $ne: membership_number },
    });
    return res.json({ success: true, unreadCount });
  } catch (err) { next(err); }
};

// ── GET /api/notifications — Member: get notifications ───────────────────────
const getNotifications = async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 50, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0,  0);
    const notifications = await Notification.find()
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();
    const membership_number = req.user?.membership_number || '';

    const mapped = notifications.map(n => ({
      _id:       n._id,
      type:      n.type,
      title:     n.title,
      message:   n.message,
      category:  n.category,
      reference_id: n.reference_id,
      created_by:   n.created_by,
      createdAt:    n.createdAt,
      is_read:   n.read_by.includes(membership_number),
    }));

    return res.json({ success: true, count: mapped.length, notifications: mapped });
  } catch (err) { next(err); }
};

// ── PUT /api/notifications/:id/read — Mark notification as read ──────────────
const markNotificationRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const membership_number = req.user?.membership_number || '';
    if (!membership_number) {
      return res.status(400).json({ success: false, message: 'Member not identified.' });
    }

    await Notification.findByIdAndUpdate(id, {
      $addToSet: { read_by: membership_number },
    });

    return res.json({ success: true, message: 'Marked as read.' });
  } catch (err) { next(err); }
};

// ── PUT /api/notifications/read-all — Mark all notifications as read ─────────
const markAllNotificationsRead = async (req, res, next) => {
  try {
    const membership_number = req.user?.membership_number || '';
    if (!membership_number) {
      return res.status(400).json({ success: false, message: 'Member not identified.' });
    }

    await Notification.updateMany(
      { read_by: { $ne: membership_number } },
      { $addToSet: { read_by: membership_number } }
    );

    return res.json({ success: true, message: 'All marked as read.' });
  } catch (err) { next(err); }
};

// ── POST /api/events/notifications/:id/replies — Member sends a reply ───────
const createReply = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const membership_number = req.user?.membership_number || '';
    const sender_name = req.user?.name || 'Member';

    if (!message || !message.trim()) {
      return res.status(422).json({ success: false, message: 'Message is required.' });
    }

    // Verify the notification exists and is a facility category (not events)
    const notification = await Notification.findById(id).lean();
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notice not found.' });
    }
    if (notification.category === 'events') {
      return res.status(403).json({ success: false, message: 'Replies are not allowed on event notices.' });
    }

    const reply = await Reply.create({
      notification_id:   id,
      sender_type:       'member',
      sender_name,
      membership_number,
      message:           message.trim(),
    });

    return res.json({ success: true, message: 'Reply sent.', reply });
  } catch (err) { next(err); }
};

// ── GET /api/events/notifications/:id/replies — Get replies for a notice ────
const getReplies = async (req, res, next) => {
  try {
    const { id } = req.params;
    const replies = await Reply.find({ notification_id: id }).sort({ createdAt: 1 }).lean();
    return res.json({ success: true, count: replies.length, replies });
  } catch (err) { next(err); }
};

// ── GET /api/events/inbox — Management: get all replies grouped by notice ───
const getInbox = async (req, res, next) => {
  try {
    // Get all notifications that have replies
    const replies = await Reply.find().sort({ createdAt: -1 }).lean();

    // Group by notification_id
    const grouped = {};
    for (const r of replies) {
      if (!grouped[r.notification_id]) {
        grouped[r.notification_id] = {
          notification_id: r.notification_id,
          replies: [],
          latest_at: r.createdAt,
        };
      }
      grouped[r.notification_id].replies.push(r);
    }

    // Fetch notification details for each group
    const threads = [];
    for (const nid of Object.keys(grouped)) {
      const notif = await Notification.findById(nid).lean();
      threads.push({
        notification: notif || { _id: nid, title: 'Unknown Notice', message: '' },
        replies: grouped[nid].replies.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
        latest_at: grouped[nid].latest_at,
      });
    }

    // Sort threads by latest reply
    threads.sort((a, b) => new Date(b.latest_at) - new Date(a.latest_at));

    return res.json({ success: true, count: threads.length, threads });
  } catch (err) { next(err); }
};

// ── POST /api/events/inbox/:notification_id/reply — Management replies ──────
const createManagementReply = async (req, res, next) => {
  try {
    const { notification_id } = req.params;
    const { message } = req.body;
    const sender_name = req.mgmt?.displayName || req.mgmt?.username || 'Management';

    if (!message || !message.trim()) {
      return res.status(422).json({ success: false, message: 'Message is required.' });
    }

    const reply = await Reply.create({
      notification_id,
      sender_type:       'management',
      sender_name,
      membership_number: 'MGMT',
      message:           message.trim(),
    });

    return res.json({ success: true, message: 'Reply sent.', reply });
  } catch (err) { next(err); }
};

module.exports = {
  createEvent, getEvents, getEventById, updateEvent, deleteEvent,
  getActiveEvents, pollNotifications, getNotifications, markNotificationRead, markAllNotificationsRead,
  createReply, getReplies, getInbox, createManagementReply,
};
