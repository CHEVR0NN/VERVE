// models/Reply.js
const mongoose = require('mongoose');

const replySchema = new mongoose.Schema(
  {
    notification_id:   { type: String, required: true, index: true },
    sender_type:       { type: String, required: true, enum: ['member', 'management'] },
    sender_name:       { type: String, required: true },
    membership_number: { type: String, default: '' },
    message:           { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Reply', replySchema);
