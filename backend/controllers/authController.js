// controllers/authController.js
// Issues JWT tokens for authenticated members

const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const ghlService = require('../models/ghlService');
const Member = require('../models/Member');

// ── Dev-only member accounts (used when NODE_ENV=development) ─────────────────
// These let you test the API without needing real GHL contacts.
// Remove or ignore these in production — only GHL contacts will be used.
const DEV_MEMBERS = [
  {
    id:                'dev-001',
    membership_number: 'VRV-0001',
    email:             'alice.tan@vrv.com',
    firstName:         'Alice',
    lastName:          'Tan',
  },
  {
    id:                'dev-002',
    membership_number: 'VRV-0002',
    email:             'bob.lim@vrv.com',
    firstName:         'Bob',
    lastName:          'Lim',
  },
  {
    id:                'dev-003',
    membership_number: 'VRV-0003',
    email:             'carol.ng@vrv.com',
    firstName:         'Carol',
    lastName:          'Ng',
  },
  {
    id:                'dev-004',
    membership_number: 'VRV-0004',
    email:             'brixdodd07@gmail.com',
    firstName:         'David',
    lastName:          'Chen',
  },
];

const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }

    const { membership_number: _raw_id, email } = req.body;
    const membership_number = (_raw_id || '').trim().toUpperCase();
    let member = null;

    // ── Check MongoDB first (profile may have been updated via Edit Profile) ──
    const savedMember = await Member.findOne({ membership_number, email })
      .collation({ locale: 'en', strength: 2 });

    if (savedMember) {
      const nameParts = (savedMember.name || '').trim().split(/\s+/);
      member = {
        id:                savedMember.ghl_contact_id || membership_number,
        membership_number,
        email:             savedMember.email,
        firstName:         nameParts[0] || '',
        lastName:          nameParts.slice(1).join(' ') || '',
        phone:             savedMember.phone || '',
      };
    }

    // ── Dev mode: check local accounts ────────────────────────────────────────
    if (!member && process.env.NODE_ENV === 'development') {
      member = DEV_MEMBERS.find(
        (m) =>
          m.membership_number === membership_number &&
          m.email.toLowerCase() === email.toLowerCase()
      ) || null;
    }

    // ── Production (or dev fallback): look up in GHL ──────────────────────────
    if (!member) {
      const contacts = await ghlService.findContactsByMember(membership_number);
      const match = contacts.find(
        (c) => c.email && c.email.toLowerCase() === email.toLowerCase()
      );

      if (match) {
        member = {
          id:                match.id,
          membership_number: membership_number,
          email:             match.email,
          firstName:         match.firstName || '',
          lastName:          match.lastName  || '',
          phone:             match.phone     || '',
        };
      }
    }

    if (!member) {
      return res.status(401).json({
        success: false,
        message: 'Invalid membership number or email.',
      });
    }

    const fullName = `${member.firstName} ${member.lastName}`.trim();

    const token = jwt.sign(
      {
        id:                member.id,
        membership_number: member.membership_number,
        email:             member.email,
        name:              fullName,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    return res.status(200).json({
      success: true,
      token,
      member: {
        membership_number: member.membership_number,
        email:             member.email,
        name:              fullName,
        phone:             member.phone || '',
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { login };
