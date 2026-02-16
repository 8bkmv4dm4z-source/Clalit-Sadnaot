const { safeAuditLog } = require("./SafeAuditLog");
const { AuditEventTypes, AuditEventSeverityDefaults } = require("./AuditEventRegistry");
const { hmacEntityKey } = require("../utils/hmacUtil");

const hashIp = (ip) => {
  if (!ip || typeof ip !== "string") return "unknown";
  try {
    return hmacEntityKey(`ip:${ip}`);
  } catch {
    return "unknown";
  }
};

const extractRequestContext = (req) => {
  if (!req) return {};
  return {
    route: req.originalUrl || req.url || "unknown",
    method: req.method || "unknown",
    ipHash: hashIp(req.ip),
    userAgent: (req.headers?.["user-agent"] || "").slice(0, 200),
  };
};

const logSecurityEvent = async ({ eventType, req, subjectKey, severity, metadata = {} }) => {
  const resolvedSeverity = severity || AuditEventSeverityDefaults[eventType] || "info";
  const requestContext = extractRequestContext(req);

  await safeAuditLog({
    eventType,
    subjectType: "system",
    subjectKey: subjectKey || requestContext.ipHash || "system",
    metadata: {
      ...requestContext,
      ...metadata,
      severity: resolvedSeverity,
    },
  });
};

const logAuthFailure = (req, metadata = {}) =>
  logSecurityEvent({
    eventType: AuditEventTypes.SECURITY_AUTH_FAILURE,
    req,
    metadata: { ...metadata, reason: metadata.reason || "auth_failure" },
  });

const logTokenExpired = (req, metadata = {}) =>
  logSecurityEvent({
    eventType: AuditEventTypes.SECURITY_TOKEN_EXPIRED,
    req,
    metadata,
  });

const logTokenMalformed = (req, metadata = {}) =>
  logSecurityEvent({
    eventType: AuditEventTypes.SECURITY_TOKEN_MALFORMED,
    req,
    metadata,
  });

const logRoleIntegrityFailure = (req, metadata = {}) =>
  logSecurityEvent({
    eventType: AuditEventTypes.SECURITY_ROLE_INTEGRITY,
    req,
    subjectKey: metadata.subjectKey,
    metadata,
  });

const logRateLimit = (req, metadata = {}) =>
  logSecurityEvent({
    eventType: AuditEventTypes.SECURITY_RATE_LIMIT,
    req,
    metadata,
  });

const logCsrfFailure = (req, metadata = {}) =>
  logSecurityEvent({
    eventType: AuditEventTypes.SECURITY_CSRF_FAILURE,
    req,
    metadata,
  });

const logAdminPasswordFailure = (req, metadata = {}) =>
  logSecurityEvent({
    eventType: AuditEventTypes.SECURITY_ADMIN_PASSWORD_FAILURE,
    req,
    metadata,
  });

const logInputSanitized = (req, metadata = {}) =>
  logSecurityEvent({
    eventType: AuditEventTypes.SECURITY_INPUT_SANITIZED,
    req,
    metadata,
  });

const logMongoSanitized = (req, metadata = {}) =>
  logSecurityEvent({
    eventType: AuditEventTypes.SECURITY_MONGO_SANITIZED,
    req,
    metadata,
  });

const logIntegrityMismatch = (metadata = {}) =>
  logSecurityEvent({
    eventType: AuditEventTypes.SECURITY_INTEGRITY_MISMATCH,
    metadata,
  });

const logResponseGuardViolation = (req, metadata = {}) =>
  logSecurityEvent({
    eventType: AuditEventTypes.SECURITY_RESPONSE_GUARD,
    req,
    metadata,
  });

const logOtpLockout = (req, { subjectKey, ...metadata } = {}) =>
  logSecurityEvent({
    eventType: AuditEventTypes.SECURITY_OTP_LOCKOUT,
    req,
    subjectKey,
    metadata,
  });

module.exports = {
  logSecurityEvent,
  logAuthFailure,
  logTokenExpired,
  logTokenMalformed,
  logRoleIntegrityFailure,
  logRateLimit,
  logCsrfFailure,
  logAdminPasswordFailure,
  logInputSanitized,
  logMongoSanitized,
  logIntegrityMismatch,
  logResponseGuardViolation,
  logOtpLockout,
};
