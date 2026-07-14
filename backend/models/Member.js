// models/Member.js
const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema(
  {
    membership_number: { type: String, required: true, unique: true },
    ghl_contact_id:    { type: String },
    name:              { type: String, required: true },
    email:             { type: String, required: true },
    phone:             { type: String, default: '' },
    is_flagged:        { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Member', memberSchema);
