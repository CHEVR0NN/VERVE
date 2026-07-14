// routes/webhook.js
// Receives inbound webhook calls FROM GHL automations
// No JWT auth — GHL uses a shared secret in the x-ghl-secret header.

const express  = require('express');
const router   = express.Router();
const { handleGhlEvent } = require('../controllers/webhookController');

// POST /api/webhooks/ghl
router.post('/ghl', handleGhlEvent);

module.exports = router;
