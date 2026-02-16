const cloneDeep = (value) => {
  if (Array.isArray(value)) return value.map((v) => cloneDeep(v));
  if (value && typeof value === "object") {
    const copy = {};
    for (const [k, v] of Object.entries(value)) {
      copy[k] = cloneDeep(v);
    }
    return copy;
  }
  return value;
};

const { AuditCategories, AuditSeverityLevels, AuditEventSeverityDefaults, getAuditEventDefinition } = require("./AuditEventRegistry");
const { hmacEntityKey } = require("../utils/hmacUtil");
const DefaultAuditLogModel = require("../models/AdminAuditLog");

let AuditLogModel = DefaultAuditLogModel;

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "tokenhash",
  "refreshtoken",
  "otp",
  "otpcode",
  "otpexpires",
  "email",
  "phone",
  "idnumber",
  "id_number",
  "_id",
  "id",
]);

const isSensitiveKey = (key = "") => SENSITIVE_KEYS.has(key.toLowerCase());

const sanitizeMetadata = (metadata = {}) => {
  if (!metadata || typeof metadata !== "object") return {};

  const recurse = (value) => {
    if (Array.isArray(value)) return value.map((item) => recurse(item));
    if (value && typeof value === "object") {
      const clean = {};
      for (const [k, v] of Object.entries(value)) {
        if (isSensitiveKey(k)) continue;
        clean[k] = recurse(v);
      }
      return clean;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 500 ? trimmed.slice(0, 500) : trimmed;
    }
    return value;
  };

  return recurse(cloneDeep(metadata));
};

const normalizePagination = (page = 1, limit = 50) => {
  const safePage = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const rawLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 50;
  const safeLimit = Math.min(rawLimit, 200);
  const skip = (safePage - 1) * safeLimit;
  return { skip, limit: safeLimit };
};

const VALID_SEVERITIES = new Set(Object.values(AuditSeverityLevels));

const publicView = (doc) => {
  if (!doc) return doc;
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  const cleaned = { ...plain };
  delete cleaned._id;
  delete cleaned.__v;
  delete cleaned.subjectKeyHash;
  if (!cleaned.category) {
    const def = getAuditEventDefinition(cleaned.eventType);
    cleaned.category = def?.category || AuditCategories.SECURITY;
  }
  if (cleaned.metadata) {
    cleaned.metadata = sanitizeMetadata(cleaned.metadata);
  }
  return cleaned;
};

const recordEvent = async ({ eventType, subjectType, subjectKey, actorKey, severity, metadata }) => {
  const def = getAuditEventDefinition(eventType);
  if (!def || !subjectType || !subjectKey) {
    throw new Error("eventType, subjectType, and subjectKey are required");
  }

  const resolvedSeverity =
    (severity && VALID_SEVERITIES.has(severity) ? severity : null) ||
    AuditEventSeverityDefaults[eventType] ||
    AuditSeverityLevels.INFO;

  const payload = {
    eventType: def.eventType,
    category: def.category,
    severity: resolvedSeverity,
    subjectType,
    subjectKey,
    subjectKeyHash: hmacEntityKey(subjectKey),
    actorKey: actorKey === undefined ? undefined : actorKey,
    metadata: sanitizeMetadata(metadata),
    createdAt: new Date(),
  };

  const saved = await AuditLogModel.create(payload);
  return publicView(saved);
};

const queryLogs = async ({
  eventType,
  subjectType,
  subjectKey,
  severity,
  from,
  to,
  page = 1,
  limit = 50,
  sort = -1,
} = {}) => {
  const filters = {};
  if (eventType) filters.eventType = eventType;
  if (subjectType) filters.subjectType = subjectType;
  if (subjectKey) filters.subjectKeyHash = hmacEntityKey(subjectKey);
  if (severity && VALID_SEVERITIES.has(severity)) filters.severity = severity;
  if (from || to) {
    filters.createdAt = {};
    if (from) filters.createdAt.$gte = new Date(from);
    if (to) filters.createdAt.$lte = new Date(to);
  }

  const sortDirection = sort === "asc" ? 1 : -1;
  const { skip, limit: safeLimit } = normalizePagination(page, limit);

  const docs = await AuditLogModel.find(filters)
    .sort({ createdAt: sortDirection })
    .skip(skip)
    .limit(safeLimit)
    .select("-_id -__v -subjectKeyHash")
    .lean();

  return docs.map((doc) => publicView(doc));
};

const useAuditLogModel = (model) => {
  AuditLogModel = model || DefaultAuditLogModel;
};

module.exports = {
  recordEvent,
  queryLogs,
  sanitizeMetadata,
  useAuditLogModel,
};
