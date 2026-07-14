// middleware/rateLimiter.js
// Throttles authentication attempts to slow brute-force and credential-stuffing.

const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minute window
  max: 5,                    // 5 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
});

module.exports = { loginLimiter };
