const mongoose = require("mongoose");

const RiskFeedbackSchema = new mongoose.Schema(
  {
    assessmentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    organizationId: { type: String, default: "global", index: true },
    feedbackType: {
      type: String,
      required: true,
      enum: [
        "false_positive",
        "true_positive",
        "escalate",
        "downgrade",
        "accepted_action",
        "rejected_action",
      ],
    },
    actionId: { type: String, default: "" },
    actorKeyHash: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

RiskFeedbackSchema.index({ feedbackType: 1, createdAt: -1 });
RiskFeedbackSchema.index({ organizationId: 1, createdAt: -1 });

module.exports =
  mongoose.models.RiskFeedback ||
  mongoose.model("RiskFeedback", RiskFeedbackSchema, "riskFeedback");

