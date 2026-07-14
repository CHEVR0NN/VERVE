// routes/auth.js
const express = require('express');
const router  = express.Router();
const { body } = require('express-validator');
const { login }       = require('../controllers/authController');
const { staffLogin }        = require('../controllers/staffAuthController');
const { managementLogin }   = require('../controllers/managementAuthController');
const { loginLimiter }      = require('../middleware/rateLimiter');

// Member login (membership number + email)
router.post(
  '/login',
  loginLimiter,
  [
    body('membership_number').notEmpty().withMessage('membership_number is required'),
    body('email').isEmail().withMessage('Valid email is required'),
  ],
  login
);

// Staff login (username + password)
router.post('/staff/login', loginLimiter, staffLogin);

// Management login (username + password)
router.post('/management/login', loginLimiter, managementLogin);

module.exports = router;
