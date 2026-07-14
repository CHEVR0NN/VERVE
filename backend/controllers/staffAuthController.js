// controllers/staffAuthController.js
// Verifies staff credentials against bcrypt-hashed records in MongoDB.

const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const Account = require('../models/Account');

const DUMMY_HASH = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8K7vQO5oS4r0v3xHy5xN8MfQqUe5kK';

const staffLogin = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(422).json({ success: false, message: 'Username and password are required.' });
    }

    const account = await Account.findOne({
      username: username.toLowerCase().trim(),
      type: 'staff',
    });

    const hashToCheck = account?.passwordHash || DUMMY_HASH;
    const passwordOk  = await bcrypt.compare(password, hashToCheck);

    if (!account || !account.active || !passwordOk) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    const token = jwt.sign(
      {
        username:    account.username,
        role:        account.role,
        displayName: account.displayName,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    return res.status(200).json({
      success: true,
      token,
      staff: {
        username:    account.username,
        role:        account.role,
        displayName: account.displayName,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { staffLogin };
