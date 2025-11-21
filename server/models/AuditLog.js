const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },          // e.g. "ENTITY_KEY_MIGRATION"
    initiatedBy: { type: String, default: "system" }, // optional
    summary: { type: Object, default: {} },          // counts / stats
    details: { type: Object, default: {} },          // optional arrays
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditLog", AuditLogSchema);
