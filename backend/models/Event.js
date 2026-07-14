// models/Event.js
const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    event_name:        { type: String, required: true },
    event_description: { type: String, required: true },
    event_date:        { type: String, required: true },          // YYYY-MM-DD
    event_duration:    { type: String, required: true },          // e.g. "3 hours", "7:00pm - 10:00pm"
    event_venue:       { type: String, default: '' },             // e.g. "Le Mansion", "Lounge 1962"
    image_url:         { type: String, default: '' },             // base64 or path stored in MongoDB
    pdf_url:           { type: String, default: '' },             // base64 data URI for PDF
    pdf_filename:      { type: String, default: '' },
    created_by:        { type: String, default: 'Management' },   // admin username
    status:            { type: String, default: 'active' },       // active | archived
  },
  { timestamps: true }
);

module.exports = mongoose.model('Event', eventSchema);
