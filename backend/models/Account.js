// models/Account.js
// Hashed credentials for staff & management portal logins.
const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema(
  {
    username:     { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    type:         { type: String, required: true, enum: ['staff', 'management'] },
    role:         { type: String, required: true },
    displayName:  { type: String, required: true },
    active:       { type: Boolean, default: true },
  },
  { timestamps: true }
);

accountSchema.index({ username: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('Account', accountSchema);
