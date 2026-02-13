const mongoose = require("mongoose");

const IdempotencyKeySchema = new mongoose.Schema(
  {
    keyHash: { type: String, required: true },
    actorKey: { type: String, required: true },
    scope: { type: String, required: true },
    method: { type: String, required: true },
    status: {
      type: String,
      enum: ["in_progress", "completed"],
      default: "in_progress",
    },
    responseStatus: { type: Number },
    responseBody: { type: mongoose.Schema.Types.Mixed },
    completedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

IdempotencyKeySchema.index(
  { keyHash: 1, actorKey: 1, scope: 1, method: 1 },
  { unique: true }
);
IdempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("IdempotencyKey", IdempotencyKeySchema);
