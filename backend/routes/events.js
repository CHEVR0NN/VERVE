// routes/events.js
const express = require('express');
const router  = express.Router();
const { managementAuthenticate } = require('../middleware/managementAuth');
const { authenticate }           = require('../middleware/auth');
const eventCtrl = require('../controllers/eventController');

const largeJson = express.json({ limit: '10mb' });

// ── Management routes (require mgmt auth) ────────────────────────────────────
router.get('/management',        managementAuthenticate, eventCtrl.getEvents);
router.post('/management',       managementAuthenticate, largeJson, eventCtrl.createEvent);
router.get('/management/:id',    managementAuthenticate, eventCtrl.getEventById);
router.put('/management/:id',    managementAuthenticate, largeJson, eventCtrl.updateEvent);
router.delete('/management/:id', managementAuthenticate, eventCtrl.deleteEvent);

// ── Member-facing routes (require member auth) ───────────────────────────────
router.get('/active',        authenticate, eventCtrl.getActiveEvents);

// ── Notification routes (require member auth) ────────────────────────────────
router.get('/notifications/poll',     authenticate, eventCtrl.pollNotifications);
router.get('/notifications',          authenticate, eventCtrl.getNotifications);
router.put('/notifications/read-all', authenticate, eventCtrl.markAllNotificationsRead);
router.put('/notifications/:id/read', authenticate, eventCtrl.markNotificationRead);

// ── Reply routes (member auth) ──────────────────────────────────────────────
router.get('/notifications/:id/replies',  authenticate, eventCtrl.getReplies);
router.post('/notifications/:id/replies', authenticate, eventCtrl.createReply);

// ── Inbox routes (management auth) ──────────────────────────────────────────
router.get('/inbox',                           managementAuthenticate, eventCtrl.getInbox);
router.post('/inbox/:notification_id/reply',   managementAuthenticate, eventCtrl.createManagementReply);

module.exports = router;
