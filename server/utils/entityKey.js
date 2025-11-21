const { encodeId } = require("./hashId");

/**
 * Canonical entityKey generation.
 *
 * - Users:        hash(userId)
 * - FamilyMember: hash(userId + "::" + familyMemberId)
 *
 * IMPORTANT:
 *   - userId and familyMemberId should be the REAL MongoDB ObjectIds
 *   - Do not call this from the client
 */
function getUserEntityKey(userId) {
  if (!userId) return null;
  return encodeId(String(userId));
}

function getFamilyMemberEntityKey(userId, familyMemberId) {
  if (!userId || !familyMemberId) return null;
  return encodeId(`${userId}::${familyMemberId}`);
}

/**
 * Convenience wrapper for places that only have a generic “entity” object.
 */
function generateEntityKey({ userId, familyMemberId } = {}) {
  if (familyMemberId) {
    return getFamilyMemberEntityKey(userId, familyMemberId);
  }
  return getUserEntityKey(userId);
}

module.exports = {
  getUserEntityKey,
  getFamilyMemberEntityKey,
  generateEntityKey,
};
