const mongoose = require("mongoose");

const familyMemberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    relation: { type: String, default: "" },
    idNumber: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    city: { type: String, default: "" },
    birthDate: { type: String, default: "" },
  },
  { _id: true }
);

const RegistrationRequestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, index: true },
    phone: { type: String, default: "" },
    passwordHash: { type: String, select: true },
    idNumber: { type: String, default: "" },
    birthDate: { type: String, default: "" },
    city: { type: String, default: "" },
    canCharge: { type: Boolean, default: false },
    familyMembers: { type: [familyMemberSchema], default: [] },
    status: {
      type: String,
      enum: ["pending", "verified", "expired", "cancelled", "consumed"],
      default: "pending",
      index: true,
    },
    otpCode: { type: String, select: false },
    otpExpires: { type: Number, default: 0 },
    otpAttempts: { type: Number, default: 0, select: false },
    expiresAt: { type: Date },
    completedAt: { type: Date },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    meta: {
      ip: { type: String, default: "" },
      userAgent: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

RegistrationRequestSchema.index(
  { email: 1, status: 1 },
  { partialFilterExpression: { status: "pending" } }
);

module.exports = mongoose.model("RegistrationRequest", RegistrationRequestSchema);
