const mongoose = require("mongoose");

const toNumberOrDefault = (value, fallback) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
};

const retentionDays = toNumberOrDefault(process.env.AUDIT_RETENTION_DAYS, 3);
const retentionSeconds = Math.round(retentionDays * 24 * 60 * 60);

const { AuditCategories, AuditSeverityLevels, allowedEventTypes } = require("../services/AuditEventRegistry");

const AuditLogSchema = new mongoose.Schema({
  eventType: {
    type: String,
    required: true,
    enum: allowedEventTypes,
  },
  category: {
    type: String,
    required: true,
    enum: Object.values(AuditCategories),
  },
  severity: {
    type: String,
    enum: Object.values(AuditSeverityLevels),
    default: AuditSeverityLevels.INFO,
  },
  subjectType: {
    type: String,
    required: true,
    enum: ["user", "familyMember", "workshop", "system"],
  },
  subjectKey: { type: String, required: true },
  subjectKeyHash: { type: String, required: true },
  actorKey: { type: String },
  metadata: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
});

AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: retentionSeconds });
AuditLogSchema.index({ subjectKeyHash: 1, createdAt: -1 });
AuditLogSchema.index({ eventType: 1, createdAt: -1 });
AuditLogSchema.index({ severity: 1, createdAt: -1 });
AuditLogSchema.index({ category: 1, severity: 1, createdAt: -1 });

module.exports =
  mongoose.models.AdminAuditLog ||
  mongoose.model("AdminAuditLog", AuditLogSchema, "adminHubAuditLogs");
