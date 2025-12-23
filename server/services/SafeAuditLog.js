const { recordEvent } = require("./AuditLogService");
const { getAuditEventDefinition } = require("./AuditEventRegistry");

const safeAuditLog = async (payload = {}) => {
  try {
    if (!payload.eventType || !payload.subjectType || !payload.subjectKey) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[AUDIT] missing required fields", {
          eventType: payload?.eventType,
          subjectType: payload?.subjectType,
          subjectKey: payload?.subjectKey,
        });
      }
      return;
    }

    const def = getAuditEventDefinition(payload.eventType);
    if (!def) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[AUDIT] unknown event type", payload.eventType);
      }
      return;
    }

    await recordEvent({ ...payload, category: def.category });
  } catch (err) {
    console.warn("[AUDIT] skipped", err?.message || err);
  }
};

module.exports = { safeAuditLog };
