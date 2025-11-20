const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const nodeCrypto = require("node:crypto");

/**
 * FamilyMemberSchema
 * ------------------------------------------------------------
 * Embedded sub-document for family members.
 * Each member gets an automatic ObjectId and basic details.
 */
const FamilyMemberSchema = new mongoose.Schema(
  {
    entityKey: {
      type: String,
      default: () => nodeCrypto.randomUUID(),
      index: true,
    },
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
    entityKey: {
      type: String,
      default: () => nodeCrypto.randomUUID(),
      index: true,
      unique: true,
    },
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

    /**
     * Integrity fingerprints for tamper detection
     * ------------------------------------------------------------
     * These hashes do NOT replace the plain fields (role/idNumber).
     * They simply allow us to verify that sensitive values were not
     * altered without going through application code.
     */
    roleIntegrityHash: { type: String, select: false },
    idNumberHash: { type: String, select: false },

    // 🔒 OTP Authentication
    otpCode: { type: String, select: false },
    otpExpires: { type: Number, default: 0 },
    otpAttempts: { type: Number, default: 0, select: false },

    // 🔁 Password reset tokens (hashed)
    passwordResetTokenHash: { type: String, select: false },
    passwordResetTokenExpires: { type: Number, default: 0 },
    passwordResetTokenIssuedAt: { type: Date },

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
   🧾 Integrity Hash Helpers
   ============================================================ */

const ROLE_HASH_SECRET =
  process.env.ROLE_HASH_SECRET || process.env.JWT_SECRET || "role-hash-fallback";

const hashValue = (value, salt = ROLE_HASH_SECRET) => {
  if (!value) return null;
  return nodeCrypto.createHash("sha256").update(`${salt}:${value}`).digest("hex");
};

const ensureEntityKeys = (userDoc) => {
  if (!userDoc.entityKey) {
    userDoc.entityKey = nodeCrypto.randomUUID();
  }
  if (Array.isArray(userDoc.familyMembers)) {
    userDoc.familyMembers.forEach((member) => {
      if (!member.entityKey) member.entityKey = nodeCrypto.randomUUID();
    });
  }
};

UserSchema.statics.computeRoleHash = function (userId, role) {
  if (!userId || !role) return null;
  return hashValue(`${userId}:${role}`);
};

UserSchema.statics.computeIdNumberHash = function (idNumber) {
  if (!idNumber) return null;
  return hashValue(String(idNumber));
};

UserSchema.methods.refreshIntegrityHashes = function () {
  this.roleIntegrityHash = this.constructor.computeRoleHash(this._id, this.role);
  this.idNumberHash = this.constructor.computeIdNumberHash(this.idNumber);
};

UserSchema.pre("validate", function (next) {
  ensureEntityKeys(this);
  next();
});

UserSchema.methods.isRoleIntegrityValid = function () {
  if (!this.role) return true; // no role to validate
  const expected = this.constructor.computeRoleHash(this._id, this.role);
  return !expected || this.roleIntegrityHash === expected;
};

UserSchema.methods.hasIdNumberIntegrity = function () {
  if (!this.idNumber) return true;
  const expected = this.constructor.computeIdNumberHash(this.idNumber);
  return !expected || this.idNumberHash === expected;
};

UserSchema.pre("save", function (next) {
  this.refreshIntegrityHashes();
  next();
});

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
