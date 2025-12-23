const AuditCategories = Object.freeze({
  SECURITY: "SECURITY",
  REGISTRATION: "REGISTRATION",
  WORKSHOP: "WORKSHOP",
  CAPACITY: "CAPACITY",
  HYGIENE: "HYGIENE",
});

const AuditEventTypes = Object.freeze({
  USER_REGISTERED: "user.registered",
  WORKSHOP_REGISTRATION: "workshop.registration",
  WORKSHOP_WAITLIST_ADD: "workshop.waitlist.add",
  WORKSHOP_WAITLIST_PROMOTED: "workshop.waitlist.promoted",
  WORKSHOP_UNREGISTER: "workshop.unregister",
  WORKSHOP_MAXED: "workshop.maxed",
  SECURITY: "security",
  USER_STALE_DETECTED: "user.stale.detected",
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
  [AuditEventTypes.USER_STALE_DETECTED]: {
    eventType: AuditEventTypes.USER_STALE_DETECTED,
    category: AuditCategories.HYGIENE,
  },
  [AuditEventTypes.SECURITY]: {
    eventType: AuditEventTypes.SECURITY,
    category: AuditCategories.SECURITY,
  },
});

const allowedEventTypes = Object.freeze(Object.keys(AuditEventRegistry));

const getAuditEventDefinition = (eventType) => AuditEventRegistry[eventType] || null;

module.exports = {
  AuditCategories,
  AuditEventTypes,
  AuditEventRegistry,
  allowedEventTypes,
  getAuditEventDefinition,
};
