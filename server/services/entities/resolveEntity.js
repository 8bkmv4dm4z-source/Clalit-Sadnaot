const mongoose = require("mongoose");
const User = require("../../models/User");
const { decodeId } = require("../../utils/hashId");

const resolveOpaqueId = (value) => {
  if (!value) return null;
  if (mongoose.isValidObjectId(value)) return value;
  const decoded = decodeId(String(value));
  if (decoded && mongoose.isValidObjectId(decoded)) return decoded;
  return null;
};

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
  const resolvedObjectId = resolveOpaqueId(normalizedKey);

  // 1) direct user
  let userDoc = await User.findOne({
    $or: [
      { entityKey: normalizedKey },
      ...(resolvedObjectId ? [{ _id: resolvedObjectId }] : []),
    ],
  });
  if (userDoc) {
    return { type: "user", userDoc };
  }

  // 2) family member
  const familyMatchQuery = {
    $or: [{ "familyMembers.entityKey": normalizedKey }],
  };
  if (resolvedObjectId) {
    familyMatchQuery.$or.push({ "familyMembers._id": resolvedObjectId });
  }

  userDoc = await User.findOne(familyMatchQuery);
  if (!userDoc) return null;

  const memberDoc = (userDoc.familyMembers || []).find(
    (m) =>
      String(m.entityKey) === normalizedKey ||
      (resolvedObjectId && String(m._id) === String(resolvedObjectId))
  );
  if (!memberDoc) return null;

  return { type: "familyMember", userDoc, memberDoc };
}

module.exports = { resolveEntityByKey };
