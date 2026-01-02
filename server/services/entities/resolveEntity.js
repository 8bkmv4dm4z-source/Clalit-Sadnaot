const mongoose = require("mongoose");
const User = require("../../models/User");
const { hashId } = require("../../utils/hashId");

function ensureEntityKeys(userDoc, memberDoc = null) {
  if (userDoc && !userDoc.entityKey && userDoc._id) {
    const hashed = hashId("user", userDoc._id.toString());
    userDoc.entityKey = hashed;
  }
  if (memberDoc && !memberDoc.entityKey && memberDoc._id) {
    const hashed = hashId("family", memberDoc._id.toString());
    memberDoc.entityKey = hashed;
  }
}

/**
 * resolveEntityByKey
 * -------------------------------------------------------------
 * Safely resolve an opaque entityKey to either a user document or a
 * family member subdocument and its parent. Nothing about Mongo _id is
 * exposed to callers; downstream controllers are responsible for ACL
 * checks before returning data to clients.
 *
 * @param {string} entityKey
 * @returns {Promise<null|{type: 'user', userDoc: object}|{type: 'familyMember', userDoc: object, memberDoc: object}>}
 */
async function resolveEntityByKey(entityKey) {
  if (!entityKey) return null;

  const normalizedKey = String(entityKey);

  // 1) direct user
  let userDoc = await User.findOne({ entityKey: normalizedKey });
  if (userDoc) {
    ensureEntityKeys(userDoc);
    return { type: "user", userDoc };
  }

  // 2) family member
  userDoc = await User.findOne({ "familyMembers.entityKey": normalizedKey });
  if (!userDoc) return null;

  const memberDoc = (userDoc.familyMembers || []).find(
    (m) => String(m.entityKey) === normalizedKey
  );
  if (!memberDoc) return null;

  ensureEntityKeys(userDoc, memberDoc);

  return { type: "familyMember", userDoc, memberDoc };
}

/**
 * resolveEntity
 * -------------------------------------------------------------
 * Extended resolver that accepts either an opaque entityKey or a raw
 * MongoDB ObjectId string. Family-member lookups are delegated to
 * resolveEntityByKey, and can be disabled via allowFamily.
 *
 * @param {string} entityKeyOrId
 * @param {{ allowFamily?: boolean }} options
 * @returns {Promise<null|{type: 'user', userDoc: object}|{type: 'familyMember', userDoc: object, memberDoc: object}>}
 */
async function resolveEntity(entityKeyOrId, { allowFamily = true } = {}) {
  if (!entityKeyOrId) return null;

  const normalized = String(entityKeyOrId);

  // Fast path: direct Mongo ObjectId lookup
  if (mongoose.Types.ObjectId.isValid(normalized)) {
    const userDoc = await User.findById(normalized);
    if (userDoc) {
      ensureEntityKeys(userDoc);
      return { type: "user", userDoc };
    }
  }

  const resolved = await resolveEntityByKey(normalized);
  if (!resolved) return null;

  if (resolved.type === "familyMember" && !allowFamily) return null;
  return resolved;
}

module.exports = { resolveEntityByKey, resolveEntity };
