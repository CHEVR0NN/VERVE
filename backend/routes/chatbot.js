// routes/chatbot.js
const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getChatSession,
  sendMessage,
  getMessages,
} = require('../controllers/chatbotController');

// Get chat widget config/session
router.get('/session', authenticate, getChatSession);

// Send a message to GHL Live Chat
router.post('/message', authenticate, sendMessage);

// Get messages from a conversation
router.get('/messages/:conversationId', authenticate, getMessages);

module.exports = router;
