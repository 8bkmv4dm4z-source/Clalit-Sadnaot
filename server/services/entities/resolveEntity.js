const User = require("../../models/User");

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

  // 1) direct user
  let userDoc = await User.findOne({ entityKey });
  if (userDoc) {
    return { type: "user", userDoc };
  }

  // 2) family member
  userDoc = await User.findOne({ "familyMembers.entityKey": entityKey });
  if (!userDoc) return null;

  const memberDoc = (userDoc.familyMembers || []).find(
    (m) => String(m.entityKey) === String(entityKey)
  );
  if (!memberDoc) return null;

  return { type: "familyMember", userDoc, memberDoc };
}

module.exports = { resolveEntityByKey };
