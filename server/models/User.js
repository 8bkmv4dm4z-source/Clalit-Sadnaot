const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// 🧩 Sub-schema for family members
const FamilyMemberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    relation: { type: String, default: "" },
    idNumber: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    city: { type: String, default: "" },
    birthDate: { type: String, default: "" },
  },
  { _id: true } // מאפשר ObjectId ייחודי לכל בן משפחה
);

// 🧩 Main user schema
const UserSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, select: false },

    idNumber: { type: String, default: "" },
    birthDate: { type: String, default: "" },
    phone: { type: String, default: "" },
    city: { type: String, default: "" },
    canCharge: { type: Boolean, default: false },

    familyMembers: { type: [FamilyMemberSchema], default: [] },

    role: { type: String, enum: ["user", "admin"], default: "user" },

    otpCode: { type: String, select: false },
    otpExpires: { type: Number, default: 0 },
    otpAttempts: { type: Number, default: 0, select: false },

    hasPassword: { type: Boolean, default: false },
    temporaryPassword: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// 🔒 Password helpers
UserSchema.methods.setPassword = async function (plainPassword) {
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(plainPassword, salt);
  this.hasPassword = true;
  this.temporaryPassword = false;
};

UserSchema.methods.validatePassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

module.exports = mongoose.model("User", UserSchema);
