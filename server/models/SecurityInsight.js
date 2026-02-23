const mongoose = require("mongoose");

const toNumberOrDefault = (value, fallback) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
};

const retentionDays = toNumberOrDefault(process.env.SECURITY_INSIGHT_RETENTION_DAYS, 14);
const retentionSeconds = Math.round(retentionDays * 24 * 60 * 60);

const SecurityInsightSchema = new mongoose.Schema({
  periodType: {
    type: String,
    required: true,
    enum: ["hourly", "daily"],
  },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  metrics: {
    totalEvents: { type: Number, default: 0 },
    bySeverity: { type: Object, default: {} },
    byEventType: { type: Object, default: {} },
    topSubjectHashes: { type: [Object], default: [] },
  },
  warnings: {
    type: [
      {
        _id: false,
        code: { type: String, required: true },
        message: { type: String, required: true },
        severity: { type: String, required: true },
        value: { type: Number, required: true },
        threshold: { type: Number, required: true },
      },
    ],
    default: [],
  },
  createdAt: { type: Date, default: Date.now },
});

SecurityInsightSchema.index({ createdAt: 1 }, { expireAfterSeconds: retentionSeconds });
SecurityInsightSchema.index({ periodType: 1, periodStart: -1 });

module.exports =
  mongoose.models.SecurityInsight ||
  mongoose.model("SecurityInsight", SecurityInsightSchema, "securityInsights");
