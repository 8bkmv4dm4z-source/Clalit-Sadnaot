const { generateEntityKey } = require("../../utils/entityKey");

const toPlain = (doc) =>
  doc && typeof doc.toObject === "function" ? doc.toObject({ getters: false }) : doc || {};

const hasValue = (v) => !(v === undefined || v === null || v === "");

function hydrateParentFields(parentDoc = {}) {
  const parent = toPlain(parentDoc);

  // parent entityKey must already be canonical at the model level
  const entityKey = parent.entityKey || generateEntityKey({ userId: parent._id });

  return {
    ...parent,
    entityKey,
    parentKey: undefined,
    parentEntityKey: undefined,
  };
}

const hydrateUser = (userDoc = {}) => {
  const base = hydrateParentFields(userDoc);
  return { ...base };
};

function hydrateFamilyMember(memberDoc, parentDoc) {
  const member = toPlain(memberDoc);
  const parent = hydrateParentFields(parentDoc);

  const parentKey = parent.entityKey;
  const entityKey =
    member.entityKey ||
    generateEntityKey({
      userId: parent._id,
      familyMemberId: member._id,
    });

  const merged = { ...member };

  const inheritableFields = ["email", "phone", "city"];
  for (const field of inheritableFields) {
    merged[field] = hasValue(member[field]) ? member[field] : parent[field];
  }

  return {
    ...merged,
    parentKey,
    parentEntityKey: parentKey,
    entityKey,
    parentName: parent.name,
    parentEmail: parent.email,
    parentPhone: parent.phone,
    parentCity: parent.city,
    parentCanCharge: parent.canCharge,
    parentIdNumber: parent.idNumber,
    parentBirthDate: parent.birthDate,
    canCharge: hasValue(member.canCharge)
      ? Boolean(member.canCharge)
      : Boolean(parent.canCharge),
  };
}

module.exports = {
  hydrateUser,
  hydrateFamilyMember,
  hydrateParentFields,
};
