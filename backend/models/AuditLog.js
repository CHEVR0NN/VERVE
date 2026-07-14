// models/AuditLog.js
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actor:       { type: String, required: true },
    actor_name:  { type: String },
    action:      { type: String, required: true },
    target_id:   { type: String },
    target_type: { type: String },
    details:     { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
