const toPlain = (doc) =>
  doc && typeof doc.toObject === "function" ? doc.toObject({ getters: false }) : doc || {};

const hasValue = (value) => !(value === undefined || value === null || value === "");

const hydrateParentFields = (parentDoc = {}) => {
  const parent = toPlain(parentDoc);
  return {
    _id: parent._id || null,
    name: parent.name ?? "",
    email: parent.email ?? "",
    phone: parent.phone ?? "",
    city: parent.city ?? "",
    idNumber: parent.idNumber ?? "",
    birthDate: parent.birthDate ?? "",
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

  const inheritableFields = ["email", "phone", "city", "idNumber", "birthDate"];
  for (const field of inheritableFields) {
    merged[field] = hasValue(member[field]) ? member[field] : parent[field];
  }

  merged.parentId = parent._id || null;
  merged.parentName = parent.name;
  merged.parentEmail = parent.email;
  merged.parentPhone = parent.phone;
  merged.parentCity = parent.city;
  merged.parentIdNumber = parent.idNumber;
  merged.parentBirthDate = parent.birthDate;
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
