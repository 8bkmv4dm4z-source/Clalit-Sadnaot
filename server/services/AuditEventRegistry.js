const AuditCategories = Object.freeze({
  SECURITY: "SECURITY",
  REGISTRATION: "REGISTRATION",
  WORKSHOP: "WORKSHOP",
  CAPACITY: "CAPACITY",
  HYGIENE: "HYGIENE",
});

const AuditSeverityLevels = Object.freeze({
  INFO: "info",
  WARN: "warn",
  CRITICAL: "critical",
});

const AuditEventTypes = Object.freeze({
  USER_REGISTERED: "user.registered",
  WORKSHOP_REGISTRATION: "workshop.registration",
  WORKSHOP_WAITLIST_ADD: "workshop.waitlist.add",
  WORKSHOP_WAITLIST_PROMOTED: "workshop.waitlist.promoted",
  WORKSHOP_UNREGISTER: "workshop.unregister",
  WORKSHOP_MAXED: "workshop.maxed",
  WORKSHOP_VISIBILITY_TOGGLE: "workshop.visibility.toggle",
  SECURITY: "security",
  ADMIN_WORKSHOP_CREATE: "admin.workshop.create",
  ADMIN_WORKSHOP_UPDATE: "admin.workshop.update",
  ADMIN_WORKSHOP_DELETE: "admin.workshop.delete",
  ADMIN_USER_CREATE: "admin.user.create",
  ADMIN_USER_DELETE: "admin.user.delete",
  USER_STALE_DETECTED: "user.stale.detected",
  // Security event types
  SECURITY_AUTH_FAILURE: "security.auth.failure",
  SECURITY_TOKEN_EXPIRED: "security.token.expired",
  SECURITY_TOKEN_MALFORMED: "security.token.malformed",
  SECURITY_ROLE_INTEGRITY: "security.role.integrity",
  SECURITY_RATE_LIMIT: "security.rate.limit",
  SECURITY_CSRF_FAILURE: "security.csrf.failure",
  SECURITY_ADMIN_PASSWORD_FAILURE: "security.admin.password.failure",
  SECURITY_INPUT_SANITIZED: "security.input.sanitized",
  SECURITY_MONGO_SANITIZED: "security.mongo.sanitized",
  SECURITY_INTEGRITY_MISMATCH: "security.integrity.mismatch",
  SECURITY_RESPONSE_GUARD: "security.response.guard",
  SECURITY_OTP_LOCKOUT: "security.otp.lockout",
});

const AuditEventRegistry = Object.freeze({
  [AuditEventTypes.USER_REGISTERED]: {
    eventType: AuditEventTypes.USER_REGISTERED,
    category: AuditCategories.REGISTRATION,
  },
  [AuditEventTypes.WORKSHOP_REGISTRATION]: {
    eventType: AuditEventTypes.WORKSHOP_REGISTRATION,
    category: AuditCategories.WORKSHOP,
  },
  [AuditEventTypes.WORKSHOP_UNREGISTER]: {
    eventType: AuditEventTypes.WORKSHOP_UNREGISTER,
    category: AuditCategories.WORKSHOP,
  },
  [AuditEventTypes.WORKSHOP_WAITLIST_ADD]: {
    eventType: AuditEventTypes.WORKSHOP_WAITLIST_ADD,
    category: AuditCategories.WORKSHOP,
  },
  [AuditEventTypes.WORKSHOP_WAITLIST_PROMOTED]: {
    eventType: AuditEventTypes.WORKSHOP_WAITLIST_PROMOTED,
    category: AuditCategories.CAPACITY,
  },
  [AuditEventTypes.WORKSHOP_MAXED]: {
    eventType: AuditEventTypes.WORKSHOP_MAXED,
    category: AuditCategories.CAPACITY,
  },
  [AuditEventTypes.WORKSHOP_VISIBILITY_TOGGLE]: {
    eventType: AuditEventTypes.WORKSHOP_VISIBILITY_TOGGLE,
    category: AuditCategories.WORKSHOP,
  },
  [AuditEventTypes.ADMIN_WORKSHOP_CREATE]: {
    eventType: AuditEventTypes.ADMIN_WORKSHOP_CREATE,
    category: AuditCategories.SECURITY,
  },
  [AuditEventTypes.ADMIN_WORKSHOP_UPDATE]: {
    eventType: AuditEventTypes.ADMIN_WORKSHOP_UPDATE,
    category: AuditCategories.SECURITY,
  },
  [AuditEventTypes.ADMIN_WORKSHOP_DELETE]: {
    eventType: AuditEventTypes.ADMIN_WORKSHOP_DELETE,
    category: AuditCategories.SECURITY,
  },
  [AuditEventTypes.ADMIN_USER_CREATE]: {
    eventType: AuditEventTypes.ADMIN_USER_CREATE,
    category: AuditCategories.SECURITY,
  },
  [AuditEventTypes.ADMIN_USER_DELETE]: {
    eventType: AuditEventTypes.ADMIN_USER_DELETE,
    category: AuditCategories.SECURITY,
  },
  [AuditEventTypes.USER_STALE_DETECTED]: {
    eventType: AuditEventTypes.USER_STALE_DETECTED,
    category: AuditCategories.HYGIENE,
  },
  [AuditEventTypes.SECURITY]: {
    eventType: AuditEventTypes.SECURITY,
    category: AuditCategories.SECURITY,
  },
  [AuditEventTypes.SECURITY_AUTH_FAILURE]: {
    eventType: AuditEventTypes.SECURITY_AUTH_FAILURE,
    category: AuditCategories.SECURITY,
  },
  [AuditEventTypes.SECURITY_TOKEN_EXPIRED]: {
    eventType: AuditEventTypes.SECURITY_TOKEN_EXPIRED,
    category: AuditCategories.SECURITY,
  },
  [AuditEventTypes.SECURITY_TOKEN_MALFORMED]: {
    eventType: AuditEventTypes.SECURITY_TOKEN_MALFORMED,
    category: AuditCategories.SECURITY,
  },
  [AuditEventTypes.SECURITY_ROLE_INTEGRITY]: {
    eventType: AuditEventTypes.SECURITY_ROLE_INTEGRITY,
    category: AuditCategories.SECURITY,
  },
  [AuditEventTypes.SECURITY_RATE_LIMIT]: {
    eventType: AuditEventTypes.SECURITY_RATE_LIMIT,
    category: AuditCategories.SECURITY,
  },
  [AuditEventTypes.SECURITY_CSRF_FAILURE]: {
    eventType: AuditEventTypes.SECURITY_CSRF_FAILURE,
    category: AuditCategories.SECURITY,
  },
  [AuditEventTypes.SECURITY_ADMIN_PASSWORD_FAILURE]: {
    eventType: AuditEventTypes.SECURITY_ADMIN_PASSWORD_FAILURE,
    category: AuditCategories.SECURITY,
  },
  [AuditEventTypes.SECURITY_INPUT_SANITIZED]: {
    eventType: AuditEventTypes.SECURITY_INPUT_SANITIZED,
    category: AuditCategories.SECURITY,
  },
  [AuditEventTypes.SECURITY_MONGO_SANITIZED]: {
    eventType: AuditEventTypes.SECURITY_MONGO_SANITIZED,
    category: AuditCategories.SECURITY,
  },
  [AuditEventTypes.SECURITY_INTEGRITY_MISMATCH]: {
    eventType: AuditEventTypes.SECURITY_INTEGRITY_MISMATCH,
    category: AuditCategories.SECURITY,
  },
  [AuditEventTypes.SECURITY_RESPONSE_GUARD]: {
    eventType: AuditEventTypes.SECURITY_RESPONSE_GUARD,
    category: AuditCategories.SECURITY,
  },
  [AuditEventTypes.SECURITY_OTP_LOCKOUT]: {
    eventType: AuditEventTypes.SECURITY_OTP_LOCKOUT,
    category: AuditCategories.SECURITY,
  },
});

const AuditEventSeverityDefaults = Object.freeze({
  [AuditEventTypes.SECURITY_AUTH_FAILURE]: AuditSeverityLevels.WARN,
  [AuditEventTypes.SECURITY_TOKEN_EXPIRED]: AuditSeverityLevels.INFO,
  [AuditEventTypes.SECURITY_TOKEN_MALFORMED]: AuditSeverityLevels.WARN,
  [AuditEventTypes.SECURITY_ROLE_INTEGRITY]: AuditSeverityLevels.CRITICAL,
  [AuditEventTypes.SECURITY_RATE_LIMIT]: AuditSeverityLevels.WARN,
  [AuditEventTypes.SECURITY_CSRF_FAILURE]: AuditSeverityLevels.CRITICAL,
  [AuditEventTypes.SECURITY_ADMIN_PASSWORD_FAILURE]: AuditSeverityLevels.CRITICAL,
  [AuditEventTypes.SECURITY_INPUT_SANITIZED]: AuditSeverityLevels.INFO,
  [AuditEventTypes.SECURITY_MONGO_SANITIZED]: AuditSeverityLevels.WARN,
  [AuditEventTypes.SECURITY_INTEGRITY_MISMATCH]: AuditSeverityLevels.WARN,
  [AuditEventTypes.SECURITY_RESPONSE_GUARD]: AuditSeverityLevels.CRITICAL,
  [AuditEventTypes.SECURITY_OTP_LOCKOUT]: AuditSeverityLevels.WARN,
});

const allowedEventTypes = Object.freeze(Object.keys(AuditEventRegistry));

const getAuditEventDefinition = (eventType) => AuditEventRegistry[eventType] || null;

module.exports = {
  AuditCategories,
  AuditSeverityLevels,
  AuditEventTypes,
  AuditEventRegistry,
  AuditEventSeverityDefaults,
  allowedEventTypes,
  getAuditEventDefinition,
};
