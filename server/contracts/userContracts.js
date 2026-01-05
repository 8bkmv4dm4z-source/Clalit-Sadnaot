const { hashId } = require("../utils/hashId");
const { sanitizeUserForResponse } = require("../utils/sanitizeUser");
const {
  buildEntityFromUserDoc,
  buildEntityFromFamilyMemberDoc,
} = require("../services/entities/buildEntity");
const { normalizeEntity } = require("../services/entities/normalize");
const { enforceResponseContract } = require("./responseGuards");

const normalizeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const toPlain = (doc) =>
  doc && typeof doc.toObject === "function" ? doc.toObject({ depopulate: true }) : { ...(doc || {}) };

const resolveEntityKey = (doc, type = "user") => {
  if (!doc) return null;
  if (typeof doc === "string") return doc;
  if (doc.entityKey) return doc.entityKey;
  if (doc._id) return hashId(type, String(doc._id));
  return null;
};

const shapeOwnerFamilyMember = (member = {}, parent = {}) => ({
  entityKey: resolveEntityKey(member, "family"),
  name: member.name || "",
  relation: member.relation || "",
  birthDate: normalizeDate(member.birthDate),
  city: member.city || parent.city || "",
});

const shapeSelfEntityProfile = (entity = {}, parent = {}) =>
  enforceResponseContract(
    {
      entityKey: resolveEntityKey(entity, "family"),
      name: entity.name || "",
      email: entity.email || parent.email || "",
      phone: entity.phone || parent.phone || "",
      city: entity.city || parent.city || "",
      relation: entity.relation || "",
      birthDate: normalizeDate(entity.birthDate),
    },
    { context: "toSelfEntityProfile" }
  );

const shapeListEntity = (entity = {}, parent = {}) =>
  enforceResponseContract(
    {
      entityKey: resolveEntityKey(entity, "family"),
      name: entity.name || "",
      city: entity.city || parent.city || "",
      relation: entity.relation || "",
    },
    { context: "toListEntity" }
  );

function toPublicUser(userDoc) {
  const user = toPlain(userDoc);
  const payload = {
    entityKey: resolveEntityKey(user),
    name: user.name || "",
    city: user.city || "",
  };

  return enforceResponseContract(payload, { context: "toPublicUser" });
}

function toOwnerUser(userDoc) {
  const user = toPlain(userDoc);
  const entityKey = resolveEntityKey(user);
  const base = {
    entityKey,
    name: user.name || "",
    email: user.email || "",
    phone: user.phone || "",
    city: user.city || "",
    birthDate: normalizeDate(user.birthDate),
  };

  const familyMembers = Array.isArray(user.familyMembers)
    ? user.familyMembers.map((member) => shapeOwnerFamilyMember(member, base))
    : [];

  const payload = {
    ...base,
    familyMembers,
  };

  return enforceResponseContract(payload, { context: "toOwnerUser" });
}

function toAdminUser(userDoc) {
  const sanitized = sanitizeUserForResponse(
    userDoc,
    { authorities: { admin: true } },
    { includeFull: true }
  );
  const cleaned = { ...sanitized };

  // Remove any authority indicators or privileged flags.
  delete cleaned.canCharge;
  delete cleaned.roleFingerprint;
  delete cleaned.access;
  delete cleaned.entities;

  cleaned.familyMembers = Array.isArray(sanitized.familyMembers)
    ? sanitized.familyMembers.map((member) => {
        const safeMember = { ...member };
        delete safeMember.canCharge;
        delete safeMember.roleFingerprint;
        delete safeMember.access;
        delete safeMember.entities;
        return enforceResponseContract(safeMember, { context: "toAdminUser.familyMember" });
      })
    : [];

  // sanitizeUserForResponse already strips sensitive fields, but we enforce forbidden-field guard as defense-in-depth.
  return enforceResponseContract(cleaned, { context: "toAdminUser" });
}

function toPublicEntity(entityDoc, parentDoc = null) {
  const entity =
    entityDoc?.entityType === "familyMember" || entityDoc?.relation || parentDoc
      ? buildEntityFromFamilyMemberDoc(entityDoc, parentDoc || {})
      : buildEntityFromUserDoc(entityDoc);
  const normalized = normalizeEntity(entity || {});
  return shapeListEntity(
    {
      entityKey: normalized.entityKey || resolveEntityKey(entityDoc, "family"),
      name: normalized.name || "",
      city: normalized.city || "",
      relation: normalized.relation || "",
    },
    parentDoc || {}
  );
}

function toListEntity(entityDoc = {}, parentDoc = {}) {
  const entity =
    entityDoc?.entityType === "familyMember" || entityDoc?.relation || parentDoc
      ? buildEntityFromFamilyMemberDoc(entityDoc, parentDoc || {})
      : buildEntityFromUserDoc(entityDoc);
  const normalized = normalizeEntity(entity || {});
  return shapeListEntity(
    {
      entityKey: normalized.entityKey || resolveEntityKey(entityDoc, "family"),
      name: normalized.name || "",
      city: normalized.city || "",
      relation: normalized.relation || "",
    },
    parentDoc || {}
  );
}

function toSelfProfileEntity(entityDoc = {}, parentDoc = {}) {
  const entity =
    entityDoc?.entityType === "familyMember" || entityDoc?.relation || parentDoc
      ? buildEntityFromFamilyMemberDoc(entityDoc, parentDoc || {})
      : buildEntityFromUserDoc(entityDoc);
  const normalized = normalizeEntity(entity || {});
  return shapeSelfEntityProfile(
    {
      entityKey: normalized.entityKey || resolveEntityKey(entityDoc, "family"),
      name: normalized.name || "",
      email: normalized.email || parentDoc?.email || "",
      phone: normalized.phone || parentDoc?.phone || "",
      city: normalized.city || parentDoc?.city || "",
      relation: normalized.relation || "",
      birthDate: normalizeDate(normalized.birthDate),
    },
    parentDoc || {}
  );
}

module.exports = {
  toPublicUser,
  toOwnerUser,
  toAdminUser,
  toPublicEntity,
  toListEntity,
  toSelfProfileEntity,
};
