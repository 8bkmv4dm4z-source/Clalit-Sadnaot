const mongoose = require("mongoose");

const RiskContributionSchema = new mongoose.Schema(
  {
    ruleId: { type: String, required: true },
    label: { type: String, required: true },
    category: { type: String, required: true },
    baseScore: { type: Number, required: true },
    calibrationOffset: { type: Number, default: 0 },
    score: { type: Number, required: true },
    reason: { type: String, required: true },
  },
  { _id: false }
);

const SuggestedActionSchema = new mongoose.Schema(
  {
    actionId: { type: String, required: true },
    reason: { type: String, required: true },
    confidence: { type: Number, required: true },
    blocked: { type: Boolean, default: false },
    blockedReason: { type: String },
  },
  { _id: false }
);

const RiskAssessmentSchema = new mongoose.Schema(
  {
    auditLogId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    organizationId: { type: String, default: "global", index: true },

    eventType: { type: String, required: true },
    category: { type: String, required: true },
    severity: { type: String, required: true },
    subjectType: { type: String, required: true },
    subjectKey: { type: String, required: true },
    subjectKeyHash: { type: String, required: true },

    deterministic: {
      score: { type: Number, required: true, min: 0, max: 100 },
      riskLevel: { type: String, required: true },
      version: { type: String, required: true },
      contributions: { type: [RiskContributionSchema], default: [] },
      summary: { type: String, required: true },
    },

    aiOverlay: {
      enabled: { type: Boolean, default: false },
      summary: { type: String, default: "" },
      confidence: { type: Number, default: 0, min: 0, max: 1 },
      advisoryScore: { type: Number, default: 0, min: 0, max: 100 },
      divergenceScore: { type: Number, default: 0, min: 0, max: 100 },
      suggestedActions: { type: [SuggestedActionSchema], default: [] },
      blockedActions: { type: [SuggestedActionSchema], default: [] },
      guardrails: {
        confidenceGateBlocked: { type: Boolean, default: false },
        divergenceExceeded: { type: Boolean, default: false },
        shadowMode: { type: Boolean, default: false },
      },
    },

    final: {
      score: { type: Number, required: true, min: 0, max: 100 },
      riskLevel: { type: String, required: true },
      requiresManualReview: { type: Boolean, default: false },
      sourceOfTruth: { type: String, default: "deterministic" },
    },

    calibration: {
      profileVersion: { type: Number, default: 1 },
      appliedRuleWeights: { type: Object, default: {} },
    },

    processing: {
      status: {
        type: String,
        enum: ["pending", "processing", "completed", "failed"],
        default: "pending",
      },
      attempts: { type: Number, default: 0 },
      lastError: { type: String, default: "" },
      lastAttemptAt: { type: Date },
      processedAt: { type: Date },
    },
  },
  { timestamps: true }
);

RiskAssessmentSchema.index({ createdAt: -1 });
RiskAssessmentSchema.index({ eventType: 1, createdAt: -1 });
RiskAssessmentSchema.index({ category: 1, "final.riskLevel": 1, createdAt: -1 });
RiskAssessmentSchema.index({ "processing.status": 1, createdAt: -1 });
RiskAssessmentSchema.index({ organizationId: 1, createdAt: -1 });

module.exports =
  mongoose.models.RiskAssessment ||
  mongoose.model("RiskAssessment", RiskAssessmentSchema, "riskAssessments");

