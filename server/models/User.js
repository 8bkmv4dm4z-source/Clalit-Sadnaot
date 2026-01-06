const mongoose = require("mongoose");
const nodeCrypto = require("node:crypto");
const { hashPassword, verifyPassword } = require("../utils/passwordHasher");

// ✅ HASHED ID UTILS (WORKSHOPS + USERS + FAMILY SHARE SAME SYSTEM)
const { hashId } = require("../utils/hashId");

/**
 * FamilyMemberSchema
 * ------------------------------------------------------------
 * Embedded sub-document for family members.
 * Each member gets an automatic ObjectId and a HASHED entityKey
 * derived from _id so it can be matched by controllers without
 * exposing raw ObjectId values.
 */
const FamilyMemberSchema = new mongoose.Schema(
  {
    entityKey: {
      type: String,
      default: function () {
        if (this._id) {
          return hashId("family", this._id.toString());
        }
        return undefined;
      },
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
      default: function () {
        if (this._id) {
          return hashId("user", this._id.toString());
        }
        return undefined;
      },
      index: true,
      unique: true,
    },
    hashedId: {
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
    authorities: {
      type: new mongoose.Schema(
        {
          admin: { type: Boolean, default: false },
        },
        { _id: false, strict: true }
      ),
      default: {},
      select: false,
    },

    // Integrity hashes
    roleIntegrityHash: { type: String, select: false },
    idNumberHash: { type: String, select: false },

    // 🔐 OTP
    otpCode: { type: String, select: false },
    otpExpires: { type: Number, default: 0 },
    otpAttempts: { type: Number, default: 0, select: false },
    otpLastSent: { type: Number, default: 0, select: false },
    otpLockUntil: { type: Number, default: 0, select: false },

    // 🔁 Reset tokens
    passwordResetTokenHash: { type: String, select: false },
    passwordResetTokenExpires: { type: Number, default: 0 },
    passwordResetTokenIssuedAt: { type: Date },

    hasPassword: { type: Boolean, default: false },
    temporaryPassword: { type: Boolean, default: false },
    passwordChangedAt: { type: Date },

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
 * Ensures entityKey exists for both user and family members.
 * For family: entityKey = hashId(_id)
 */
const ensureEntityKeys = (userDoc) => {
  // user entityKey
  if (!userDoc.entityKey && userDoc._id) {
    const hashed = hashId("user", userDoc._id.toString());
    userDoc.entityKey = hashed;
    userDoc.hashedId = hashed;
  }

  if (!userDoc.hashedId && userDoc._id) {
    userDoc.hashedId = hashId("user", userDoc._id.toString());
  }

  // family members
  if (Array.isArray(userDoc.familyMembers)) {
    userDoc.familyMembers.forEach((member) => {
      if (!member.entityKey && member._id) {
        const hashed = hashId("family", member._id.toString());
        member.entityKey = hashed;
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

UserSchema.pre("validate", function (next) {
  ensureEntityKeys(this);
  next();
});

UserSchema.pre("save", function (next) {
  if (!this.hashedId && this._id) {
    this.hashedId = hashId("user", this._id.toString());
    if (!this.entityKey) this.entityKey = this.hashedId;
  }
  if (Array.isArray(this.familyMembers)) {
    this.familyMembers.forEach((member) => {
      if (member._id && !member.entityKey) {
        const hashed = hashId("family", member._id.toString());
        member.entityKey = hashed;
      }
    });
  }
  next();
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

/**
 * Resolve a user by entityKey/hashedId without ever querying by Mongo _id.
 * Accepts optional projection + lean to support identity-only lookups.
 */
UserSchema.statics.findByEntityKey = async function (
  entityKey,
  { projection = null, lean = false } = {}
) {
  if (!entityKey) return null;

  const query = { $or: [{ entityKey }, { hashedId: entityKey }] };

  let cursor = this.findOne(query);
  if (projection) cursor = cursor.select(projection);
  if (lean) cursor = cursor.lean();

  const doc = await cursor;
  if (doc) ensureEntityKeys(doc);

  return doc;
};

/* ============================================================
   Password Helpers
   ============================================================ */

UserSchema.methods.setPassword = async function (plainPassword) {
  this.passwordHash = await hashPassword(plainPassword);
  this.hasPassword = true;
  this.temporaryPassword = false;
  this.passwordChangedAt = new Date();
  this.refreshTokens = [];
};

UserSchema.methods.validatePassword = async function (plainPassword) {
  return verifyPassword(plainPassword, this.passwordHash);
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
