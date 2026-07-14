// models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    type:              { type: String, required: true },           // 'event', 'notice', 'general'
    title:             { type: String, required: true },
    message:           { type: String, required: true },
    reference_id:      { type: String, default: '' },             // links to event _id or other entity
    category:          { type: String, default: 'events' },       // 'facility', 'events', 'general'
    read_by:           [{ type: String }],                        // membership_numbers that have read it
    created_by:        { type: String, default: 'Management' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
