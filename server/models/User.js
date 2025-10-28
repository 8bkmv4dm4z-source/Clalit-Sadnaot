const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * FamilyMemberSchema
 * ------------------------------------------------------------
 * Embedded sub-document for family members.
 * Each member gets an automatic ObjectId and basic details.
 */
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
  { _id: true } // unique ObjectId per family member
);

/**
 * UserSchema
 * ------------------------------------------------------------
 * Main user document.
 * Includes authentication fields, family members,
 * and optimized workshop mapping arrays for fast lookups.
 */
const UserSchema = new mongoose.Schema(
  {
    // 👤 Basic Info
    name: { type: String, default: "" },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, select: false },
    idNumber: { type: String, default: "" },
    birthDate: { type: String, default: "" },
    phone: { type: String, default: "" },
    city: { type: String, default: "" },
    canCharge: { type: Boolean, default: false },

    // 👨‍👩‍👧 Family Members
    familyMembers: { type: [FamilyMemberSchema], default: [] },

    // 🔑 Role & Access
    role: { type: String, enum: ["user", "admin"], default: "user" },

    // 🔒 OTP Authentication
    otpCode: { type: String, select: false },
    otpExpires: { type: Number, default: 0 },
    otpAttempts: { type: Number, default: 0, select: false },

    // 🔐 Password Flags
    hasPassword: { type: Boolean, default: false },
    temporaryPassword: { type: Boolean, default: false },

    // 🔁 Refresh Tokens
    refreshTokens: {
      type: [
        new mongoose.Schema(
          {
            token: { type: String, required: true },
            userAgent: { type: String, default: "" },
            createdAt: { type: Date, default: Date.now },
          },
          { _id: true }
        ),
      ],
      default: [],
    },

    // ⚡️ Optimized Workshop Mapping
    /**
     * Direct workshops the user is registered to.
     * Enables O(1) lookup for "my workshops".
     */
    userWorkshopMap: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Workshop",
      default: [],
    },

    /**
     * Family workshops per member.
     * Each entry holds a familyMemberId and an array of workshop IDs.
     */
    familyWorkshopMap: {
      type: [
        new mongoose.Schema(
          {
            familyMemberId: { type: mongoose.Schema.Types.ObjectId, required: true },
            workshops: [{ type: mongoose.Schema.Types.ObjectId, ref: "Workshop" }],
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

/* ============================================================
   🔒 Password Helpers
   ============================================================ */

/**
 * Sets and hashes the user's password.
 */
UserSchema.methods.setPassword = async function (plainPassword) {
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(plainPassword, salt);
  this.hasPassword = true;
  this.temporaryPassword = false;
};

/**
 * Validates a plain password against the stored hash.
 */
UserSchema.methods.validatePassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

/* ============================================================
   ⚙️ Index Definitions (Performance Layer)
   ============================================================ */

// Basic field indexes
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ phone: 1 });
UserSchema.index({ idNumber: 1 });
UserSchema.index({ city: 1 });
UserSchema.index({ role: 1 });

// Compound index for admin filters
UserSchema.index({ city: 1, role: 1, name: 1 });

// Family member lookup acceleration
UserSchema.index({ "familyMembers.name": 1 });
UserSchema.index({ "familyMembers.idNumber": 1 });
UserSchema.index({ "familyMembers.phone": 1 });
UserSchema.index({"familyMembers.email":1});
UserSchema.index({"familyMembers.city":1});

// Text index for flexible search (admin/global)
UserSchema.index(
  {
    name: "text",
    email: "text",
    phone: "text",
    idNumber: "text",
    city: "text",
    "familyMembers.name": "text",
    "familyMembers.idNumber": "text",
    "familyMembers.email":"text",
    "familyMembers.phone":"text",
    "familyMembers.city":"text",

  },
  {
    weights: {
      name: 5,
      email: 3,
      idNumber: 2,
      phone: 2,
      city: 1,
    },
  }
);

/* ============================================================
   ✅ Model Export
   ============================================================ */
module.exports = mongoose.model("User", UserSchema);
