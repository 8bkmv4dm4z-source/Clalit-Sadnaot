const User = require("../models/User");
const { hashId } = require("./hashId");

/**
 * Normalize a Mongoose document or plain object into a plain object.
 */
function toPlain(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === "function") {
    return doc.toObject({ depopulate: true });
  }
  return { ...doc };
}

/**
 * Remove sensitive fields that should never be returned to clients.
 */
function stripSensitiveFields(user) {
  const clean = toPlain(user) || {};
  const redactions = [
    "passwordHash",
    "otpCode",
    "otpAttempts",
    "passwordResetTokenHash",
    "passwordResetTokenExpires",
    "passwordResetTokenIssuedAt",
  "refreshTokens",
  "roleIntegrityHash",
  "idNumberHash",
  "userWorkshopMap",
  "familyWorkshopMap",
  "otpExpires",
  "authorities",
];

  for (const key of redactions) delete clean[key];
  return clean;
}

const toStringOrNull = (value) => {
  if (value === undefined || value === null) return null;
  return String(value);
};

const normalizeEntityShape = (entity = {}) => {
  const normalized = { ...entity };
  if (normalized._id !== undefined) normalized._id = toStringOrNull(normalized._id);
  if (normalized.entityKey !== undefined)
    normalized.entityKey = toStringOrNull(normalized.entityKey);

  const hashedKey = normalized.entityKey;
  if (hashedKey) {
    normalized.entityKey = hashedKey;
    normalized._id = hashedKey;
  }
  if (normalized.parentKey !== undefined)
    normalized.parentKey = toStringOrNull(normalized.parentKey);
  return normalized;
};

const withEntityFlags = (entity = {}, { isFamily = false, parent = null } = {}) => {
  const flagged = normalizeEntityShape(entity);

  // Explicit entity flags for client-side renderers
  flagged.entityType = isFamily ? "familyMember" : "user";
  flagged.isFamily = isFamily;

  if (isFamily && parent) {
    flagged.parentKey = flagged.parentKey || parent.entityKey || null;
    flagged.parentName = flagged.parentName || parent.name || null;
    flagged.parentEmail = flagged.parentEmail || parent.email || null;
    flagged.parentPhone = flagged.parentPhone || parent.phone || null;
    flagged.parentCity = flagged.parentCity || parent.city || null;
  }

  return flagged;
};

const ALLOWED_USER_FIELDS = ["_id", "entityKey", "name", "email", "phone", "city"];
const ALLOWED_FAMILY_FIELDS = [
  "_id",
  "entityKey",
  "name",
  "relation",
  "email",
  "phone",
  "city",
  "parentKey",
  "parentName",
  "parentEmail",
  "parentPhone",
];
const ALLOWED_FAMILY_FIELDS_ADMIN = [...ALLOWED_FAMILY_FIELDS, "birthDate", "idNumber", "canCharge"];

// Scope-specific, minimum profile payload (no role string)
const PROFILE_USER_FIELDS = [
  "_id",
  "entityKey",
  "name",
  "email",
  "phone",
  "city",
  "birthDate",
  "idNumber",
  "canCharge",
];

const PROFILE_FAMILY_FIELDS = [
  "_id",
  "entityKey",
  "name",
  "relation",
  "email",
  "phone",
  "city",
  "birthDate",
  "idNumber",
  "parentKey",
  "parentName",
  "parentEmail",
  "parentPhone",
];

const pickAllowed = (source = {}, allowed = []) => {
  const out = {};
  for (const key of allowed) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
};

/**
 * Returns a user object safe for network transport.
 * - Adds a salted fingerprint of the role so the raw role value is hidden
 *   from non-admin consumers while remaining verifiable internally.
 * - Exposes a boolean `isAdmin` flag for client feature toggles without
 *   leaking the underlying role string.
 * - Removes all sensitive fields (passwords, OTP, integrity hashes, tokens).
 */
function sanitizeUserForResponse(user, requester, { includeFull = false, scope = "default" } = {}) {
  if (!user) return null;
  const raw = toPlain(user);
  const rawAuthorities = raw?.authorities || {};
  const clean = stripSensitiveFields(raw);

  clean.entityKey =
    clean.entityKey || (clean._id ? hashId("user", String(clean._id)) : undefined);

  const requesterHasAdminAuthority = !!requester?.authorities?.admin;
  const requesterIsAdmin = requesterHasAdminAuthority;
  const hasAdminAuthority = !!rawAuthorities?.admin;

  const buildScopedPayload = (allowedUserFields, allowedFamilyFields, { stripRole = false } = {}) => {
    const safeUser = withEntityFlags(
      pickAllowed(clean, allowedUserFields),
      { isFamily: false }
    );

    // Ensure entityKey is always available for transport + flattening
    safeUser.entityKey = safeUser.entityKey || hashId("user", String(clean._id));

    const safeFamilyMembers = Array.isArray(clean.familyMembers)
      ? clean.familyMembers.map((member) =>
          withEntityFlags(
            pickAllowed(
              {
                parentKey: safeUser.entityKey,
                parentName: safeUser.name,
                parentEmail: safeUser.email,
                parentPhone: safeUser.phone,
                ...member,
                entityKey:
                  member.entityKey ||
                  (member._id ? hashId("family", String(member._id)) : undefined),
              },
              allowedFamilyFields
            ),
            { isFamily: true, parent: safeUser }
          )
        )
      : [];

    const roleFingerprint = User.computeRoleHash(safeUser.entityKey, clean.role);

    safeUser.isAdmin = hasAdminAuthority;
    safeUser.roleFingerprint = roleFingerprint;
    safeUser.familyMembers = safeFamilyMembers;

    const safeSelf = { ...safeUser };
    delete safeSelf.entities;
    safeUser.entities = [safeSelf, ...safeFamilyMembers];

    delete safeUser.role;

    return safeUser;
  };

  // 🔐 Scoped minimal payload for /profile and /users/me
  if (scope === "profile") {
    return buildScopedPayload(PROFILE_USER_FIELDS, PROFILE_FAMILY_FIELDS, { stripRole: true });
  }

  // 📦 Full profile payload (for /me and admin views)
  if (includeFull) {
    const normalizedUser = normalizeEntityShape(clean);
    const base = {
      ...withEntityFlags(normalizedUser, { isFamily: false }),
      isAdmin: hasAdminAuthority,
      roleFingerprint: User.computeRoleHash(clean.entityKey, clean.role),
    };
    delete base.role;

    base.familyMembers = Array.isArray(clean.familyMembers)
      ? clean.familyMembers.map((member) => {
          const mergedSource = {
            parentKey: normalizedUser.entityKey,
            parentName: normalizedUser.name,
            parentEmail: normalizedUser.email,
            parentPhone: normalizedUser.phone,
            parentCity: normalizedUser.city,
            ...member,
          };

          mergedSource.entityKey =
            mergedSource.entityKey ||
            (mergedSource._id
              ? hashId("family", String(mergedSource._id))
              : undefined);

          const merged = normalizeEntityShape(mergedSource);

          // Ensure inherited contact fields are present even if missing in member doc
          merged.email = merged.email ?? normalizedUser.email ?? "";
          merged.phone = merged.phone ?? normalizedUser.phone ?? "";
          merged.city = merged.city ?? normalizedUser.city ?? "";

          return withEntityFlags(merged, { isFamily: true, parent: normalizedUser });
        })
      : [];

    const selfEntity = { ...base };
    delete selfEntity.entities;
    const entities = [selfEntity, ...base.familyMembers];

    base.entities = entities;

    return base;
  }

  // 🔒 Minimal payload (legacy clients)
  const safeUser = withEntityFlags(
    pickAllowed(clean, ALLOWED_USER_FIELDS),
    { isFamily: false }
  );
  const allowedFamilyFields = requesterIsAdmin
    ? ALLOWED_FAMILY_FIELDS_ADMIN
    : ALLOWED_FAMILY_FIELDS;
  const safeFamilyMembers = Array.isArray(clean.familyMembers)
    ? clean.familyMembers.map((member) =>
        withEntityFlags(
          pickAllowed(
            {
              parentKey: safeUser.entityKey,
              parentName: safeUser.name,
              parentEmail: safeUser.email,
              parentPhone: safeUser.phone,
              ...member,
              entityKey:
                member.entityKey ||
                (member._id ? hashId("family", String(member._id)) : undefined),
            },
            allowedFamilyFields
          ),
          { isFamily: true, parent: safeUser }
        )
      )
    : [];

  const roleFingerprint = User.computeRoleHash(safeUser.entityKey, clean.role);

  safeUser.isAdmin = hasAdminAuthority;
  safeUser.roleFingerprint = roleFingerprint;
  safeUser.familyMembers = safeFamilyMembers;

  const safeSelf = { ...safeUser };
  delete safeSelf.entities;
  const safeEntities = [safeSelf, ...safeFamilyMembers];

  safeUser.entities = safeEntities;

  delete safeUser.role;

  return safeUser;
}

module.exports = { sanitizeUserForResponse };
