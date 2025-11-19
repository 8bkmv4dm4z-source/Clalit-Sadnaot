const { hydrateUser, hydrateFamilyMember } = require("./hydration");
const { normalizeUser, normalizeFamilyMember } = require("./normalize");

const buildEntityFromUserDoc = (userDoc) => {
  if (!userDoc) return null;
  const hydrated = hydrateUser(userDoc);
  return normalizeUser(hydrated);
};

const buildEntityFromFamilyMemberDoc = (memberDoc, parentDoc) => {
  if (!memberDoc || !parentDoc) return null;
  const hydrated = hydrateFamilyMember(memberDoc, parentDoc);
  return normalizeFamilyMember(hydrated);
};

module.exports = {
  buildEntityFromUserDoc,
  buildEntityFromFamilyMemberDoc,
};
