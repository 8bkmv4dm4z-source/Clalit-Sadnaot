const toPlain = (doc) =>
  doc && typeof doc.toObject === "function" ? doc.toObject({ getters: false }) : doc || {};

const hasValue = (value) => !(value === undefined || value === null || value === "");

const hydrateParentFields = (parentDoc = {}) => {
  const parent = toPlain(parentDoc);
  return {
    entityKey: parent.entityKey || null,
    name: parent.name ?? "",
    email: parent.email ?? "",
    phone: parent.phone ?? "",
    city: parent.city ?? "",
    canCharge: typeof parent.canCharge === "boolean" ? parent.canCharge : false,
  };
};

const hydrateUser = (userDoc = {}) => {
  const base = hydrateParentFields(userDoc);
  return { ...base };
};

const hydrateFamilyMember = (memberDoc = {}, parentDoc = {}) => {
  const member = toPlain(memberDoc);
  const parent = hydrateParentFields(parentDoc);
  const merged = { ...member };

  const inheritableFields = ["email", "phone", "city"];
  for (const field of inheritableFields) {
    merged[field] = hasValue(member[field]) ? member[field] : parent[field];
  }

  merged.entityKey = member.entityKey || null;
  merged.parentKey = parent.entityKey || null;
  merged.parentName = parent.name;
  merged.parentEmail = parent.email;
  merged.parentPhone = parent.phone;
  merged.parentCity = parent.city;
  merged.parentCanCharge = parent.canCharge;
  merged.canCharge = hasValue(member.canCharge)
    ? Boolean(member.canCharge)
    : Boolean(parent.canCharge);

  return merged;
};

module.exports = {
  hydrateUser,
  hydrateFamilyMember,
  hydrateParentFields,
};
