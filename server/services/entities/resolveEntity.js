const mongoose = require("mongoose");
const User = require("../../models/User");
const { hashId } = require("../../utils/hashId");

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
    if (!userDoc.entityKey && userDoc._id) {
      const hashed = hashId("user", userDoc._id.toString());
      userDoc.entityKey = hashed;
    }
    return { type: "user", userDoc };
  }

  // 2) family member
  userDoc = await User.findOne({ "familyMembers.entityKey": normalizedKey });
  if (!userDoc) return null;

  const memberDoc = (userDoc.familyMembers || []).find(
    (m) => String(m.entityKey) === normalizedKey
  );
  if (!memberDoc) return null;

  if (!userDoc.entityKey && userDoc._id) {
    const hashed = hashId("user", userDoc._id.toString());
    userDoc.entityKey = hashed;
  }
  if (!memberDoc.entityKey && memberDoc._id) {
    const hashed = hashId("family", memberDoc._id.toString());
    memberDoc.entityKey = hashed;
  }

  return { type: "familyMember", userDoc, memberDoc };
}



module.exports = {resolveEntityByKey,};
