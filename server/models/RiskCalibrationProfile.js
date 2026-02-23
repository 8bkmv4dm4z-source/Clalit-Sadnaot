const mongoose = require("mongoose");

const CalibrationChangeSchema = new mongoose.Schema(
  {
    ruleId: { type: String, required: true },
    from: { type: Number, required: true },
    to: { type: Number, required: true },
    reason: { type: String, required: true },
    feedbackType: { type: String, required: true },
  },
  { _id: false }
);

const CalibrationHistorySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    actorKeyHash: { type: String, default: "" },
    feedbackId: { type: String, default: "" },
    changes: { type: [CalibrationChangeSchema], default: [] },
  },
  { _id: false }
);

const RiskCalibrationProfileSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, unique: true },
    active: { type: Boolean, default: true },
    version: { type: Number, default: 1 },
    ruleWeights: { type: Object, default: {} },
    driftScore: { type: Number, default: 0 },
    history: { type: [CalibrationHistorySchema], default: [] },
  },
  { timestamps: true }
);

RiskCalibrationProfileSchema.index({ updatedAt: -1 });

module.exports =
  mongoose.models.RiskCalibrationProfile ||
  mongoose.model("RiskCalibrationProfile", RiskCalibrationProfileSchema, "riskCalibrationProfiles");

