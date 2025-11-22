const collapseWhitespace = (value) =>
  String(value ?? "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\s]+/g, " ")
    .trim();

const normalizeString = (value) => collapseWhitespace(value);

const normalizeNullableString = (value) => {
  const str = collapseWhitespace(value);
  return str || "";
};

const normalizeDateValue = (value) => {
  const str = collapseWhitespace(value);
  return str || null;
};

const sanitizePhone = (value) => {
  if (value === undefined || value === null) return "";
  let str = String(value);
  str = str.replace(/[\u200E\u200F]/g, "").trim();
  const hasPlus = str.startsWith("+");
  const digits = str.replace(/[^\d]/g, "");
  if (!digits) return "";
  return hasPlus ? `+${digits}` : digits;
};

const normalizeEmail = (value) => {
  const str = collapseWhitespace(value);
  return str ? str.toLowerCase() : "";
};

const normalizeBaseEntity = (entity = {}) => ({
  _id: entity._id ? String(entity._id) : "",
  entityKey: entity.entityKey ? String(entity.entityKey) : "",
  name: normalizeString(entity.name),
  email: normalizeEmail(entity.email),
  phone: sanitizePhone(entity.phone),
  city: normalizeNullableString(entity.city),
  idNumber: normalizeNullableString(entity.idNumber),
  birthDate: normalizeDateValue(entity.birthDate),
  canCharge: Boolean(entity.canCharge),
  createdAt: entity.createdAt || null,
  updatedAt: entity.updatedAt || null,
});

const normalizeUser = (entity = {}) => {
  const base = normalizeBaseEntity(entity);
  return {
    ...base,
    entityType: "user",
    role: entity.role || "",
    isAdmin: entity.role === "admin",
    isFamily: false,
  };
};

const assignParentField = (target, key, value, options = {}) => {
  const { allowEmpty = false, asPhone = false, asDate = false } = options;
  if (value === undefined || value === null) return;
  let normalized;
  if (asPhone) normalized = sanitizePhone(value);
  else if (asDate) normalized = normalizeDateValue(value);
  else normalized = normalizeNullableString(value);
  if (!allowEmpty && (normalized === "" || normalized === null)) return;
  target[key] = normalized;
};

const normalizeFamilyMember = (entity = {}) => {
  const base = normalizeBaseEntity(entity);
  const normalized = {
    ...base,
    entityType: "familyMember",
    isFamily: true,
  };

  assignParentField(normalized, "parentKey", entity.parentKey, { allowEmpty: false });
  assignParentField(normalized, "parentName", entity.parentName);
  assignParentField(normalized, "parentEmail", entity.parentEmail);
  assignParentField(normalized, "parentPhone", entity.parentPhone, { asPhone: true, allowEmpty: true });
  assignParentField(normalized, "parentCity", entity.parentCity);
  assignParentField(normalized, "parentIdNumber", entity.parentIdNumber);
  assignParentField(normalized, "parentBirthDate", entity.parentBirthDate, { asDate: true, allowEmpty: true });
  if (entity.relation !== undefined)
    normalized.relation = normalizeNullableString(entity.relation);

  return normalized;
};

const normalizeSearchQuery = (q) => {
  let s = String(q ?? "");
  try {
    s = decodeURIComponent(s);
  } catch {
    /* ignore decode errors */
  }
  s = s.trim().toLowerCase();
  if (/[\d-]/.test(s)) s = s.replace(/[\u00A0\s-]+/g, "");
  s = s.replace(/[^\w@.\u0590-\u05FF\s]/g, "");
  return s;
};
const normalizeEntity = (entity = {}) => {
  if (entity.isFamily || entity.parentKey || entity.entityType === "familyMember") {
    return normalizeFamilyMember(entity);
  }
  return normalizeUser(entity);
};

module.exports = {
  normalizeUser,
  normalizeFamilyMember,
  normalizeSearchQuery,
  sanitizePhone,
  normalizeEntity, // correct place
};

