const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const nodeCrypto = require("node:crypto");

// ✅ HASHED ID UTILS (WORKSHOPS + USERS + FAMILY SHARE SAME SYSTEM)
const {
  getUserEntityKey,
  getFamilyMemberEntityKey,
} = require("../utils/entityKey");

/**
 * FamilyMemberSchema
 * ------------------------------------------------------------
 * Embedded sub-document for family members.
 * Each member gets an automatic ObjectId and a HASHED entityKey
 * derived from _id so it can be REVERSIBLY matched by controllers.
 */
const FamilyMemberSchema = new mongoose.Schema(
  {
    parentUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    entityKey: {
      type: String,
      default: null, // will be set by ensureEntityKeys on parent user
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
  { _id: true }
);

/**
 * UserSchema
 * ------------------------------------------------------------
 */
const UserSchema = new mongoose.Schema(
  {
    // 👤 Main user entityKey (ALSO hashed)
    entityKey: {
      type: String,
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

    // 👨‍👩‍👧 Family Members (using schema above)
    familyMembers: { type: [FamilyMemberSchema], default: [] },

    // 🔑 Role & Access
    role: { type: String, enum: ["user", "admin"], default: "user" },

    // Integrity hashes
    roleIntegrityHash: { type: String, select: false },
    idNumberHash: { type: String, select: false },

    // 🔐 OTP
    otpCode: { type: String, select: false },
    otpExpires: { type: Number, default: 0 },
    otpAttempts: { type: Number, default: 0, select: false },

    // 🔁 Reset tokens
    passwordResetTokenHash: { type: String, select: false },
    passwordResetTokenExpires: { type: Number, default: 0 },
    passwordResetTokenIssuedAt: { type: Date },

    hasPassword: { type: Boolean, default: false },
    temporaryPassword: { type: Boolean, default: false },

    // 🔁 Refresh tokens
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

    // ⚡ O(1) Workshop Mapping
    userWorkshopMap: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Workshop",
      default: [],
    },

    familyWorkshopMap: {
      type: [
        new mongoose.Schema(
          {
            familyMemberId: {
              type: mongoose.Schema.Types.ObjectId,
              required: true,
            },
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
   Integrity Helpers
   ============================================================ */

const ROLE_HASH_SECRET =
  process.env.ROLE_HASH_SECRET || process.env.JWT_SECRET || "role-hash-fallback";

const hashValue = (value, salt = ROLE_HASH_SECRET) => {
  if (!value) return null;
  return nodeCrypto.createHash("sha256").update(`${salt}:${value}`).digest("hex");
};

/**
 * Ensure canonical entityKey on user + all family members.
 * This should be called:
 *  - before save
 *  - on init (optional, so hydrated docs have keys too)
 */
UserSchema.methods.ensureEntityKeys = function ensureEntityKeys() {
  // user key
  if (!this.entityKey && this._id) {
    this.entityKey = getUserEntityKey(this._id);
  }

  // family members keys
  if (Array.isArray(this.familyMembers)) {
    this.familyMembers.forEach((member) => {
      if (!member) return;

      if (!member.entityKey && member._id) {
        member.entityKey = getFamilyMemberEntityKey(this._id, member._id);
      }

      if (!member.parentUser && this._id) {
        member.parentUser = this._id;
      }
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

UserSchema.pre("save", function (next) {
  this.ensureEntityKeys?.();
  next();
});

// optional but nice: when you load a user, make sure entityKey exists
UserSchema.post("init", function () {
  this.ensureEntityKeys?.();
});

UserSchema.methods.isRoleIntegrityValid = function () {
  const expected = this.constructor.computeRoleHash(this._id, this.role);
  return !expected || this.roleIntegrityHash === expected;
};

UserSchema.methods.hasIdNumberIntegrity = function () {
  const expected = this.constructor.computeIdNumberHash(this.idNumber);
  return !expected || this.idNumberHash === expected;
};

UserSchema.pre("save", function (next) {
  this.refreshIntegrityHashes();
  next();
});

/* ============================================================
   Password Helpers
   ============================================================ */

UserSchema.methods.setPassword = async function (plainPassword) {
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(plainPassword, salt);
  this.hasPassword = true;
  this.temporaryPassword = false;
};

UserSchema.methods.validatePassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

/* ============================================================
   Indexes
   ============================================================ */

// Basic fields
UserSchema.index({ phone: 1 });
UserSchema.index({ idNumber: 1 });
UserSchema.index({ city: 1 });
UserSchema.index({ role: 1 });

// Family
UserSchema.index({ "familyMembers.name": 1 });
UserSchema.index({ "familyMembers.phone": 1 });
UserSchema.index({ "familyMembers.email": 1 });
UserSchema.index({ "familyMembers.city": 1 });

// Search
UserSchema.index(
  {
    name: "text",
    email: "text",
    phone: "text",
    idNumber: "text",
    city: "text",
    "familyMembers.name": "text",
    "familyMembers.idNumber": "text",
    "familyMembers.email": "text",
    "familyMembers.phone": "text",
    "familyMembers.city": "text",
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
   Export
   ============================================================ */

module.exports = mongoose.model("User", UserSchema);
