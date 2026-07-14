// controllers/chatbotController.js
// Proxy endpoint for GHL Live Chat / Conversation AI
// The frontend opens a Live Chat session via this controller

const axios = require('axios');
const ghlConfig = require('../config/ghl');

// ── Get Live Chat widget token / session info ─────────────────────────────────
const getChatSession = async (req, res, next) => {
  try {
    // GHL Live Chat is embedded via a widget script on the frontend.
    // This endpoint returns the config needed to initialize the widget.
    return res.status(200).json({
      success:    true,
      locationId: ghlConfig.api.locationId,
      widgetConfig: {
        // The frontend uses these to load the GHL chat widget
        type:       'live_chat',
        locationId: ghlConfig.api.locationId,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── Send a message to GHL Live Chat conversation ──────────────────────────────
const sendMessage = async (req, res, next) => {
  try {
    const { conversationId, message, contactId } = req.body;

    if (!conversationId || !message) {
      return res.status(400).json({
        success: false,
        message: 'conversationId and message are required.',
      });
    }

    const response = await axios.post(
      `${ghlConfig.api.baseUrl}/conversations/${conversationId}/messages`,
      {
        type:    'Live_Chat',
        message: message,
        contactId,
      },
      {
        headers: {
          Authorization: `Bearer ${ghlConfig.api.key}`,
          'Content-Type': 'application/json',
          Version: '2021-07-28',
        },
      }
    );

    return res.status(200).json({
      success: true,
      data:    response.data,
    });
  } catch (err) {
    next(err);
  }
};

// ── Get conversation messages ─────────────────────────────────────────────────
const getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: 'conversationId is required.',
      });
    }

    const response = await axios.get(
      `${ghlConfig.api.baseUrl}/conversations/${conversationId}/messages`,
      {
        headers: {
          Authorization: `Bearer ${ghlConfig.api.key}`,
          'Content-Type': 'application/json',
          Version: '2021-07-28',
        },
      }
    );

    return res.status(200).json({
      success: true,
      data:    response.data,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getChatSession, sendMessage, getMessages };
