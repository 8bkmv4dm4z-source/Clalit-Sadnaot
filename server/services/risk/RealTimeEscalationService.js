const { recordEvent } = require("../AuditLogService");
const { AuditEventTypes } = require("../AuditEventRegistry");

const WINDOW_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

const ESCALATION_RULES = Object.freeze([
  {
    id: "brute_force_suspected",
    matchEventType: (et) => et === "security.auth.failure",
    threshold: 3,
  },
  {
    id: "admin_probe_detected",
    matchEventType: (et) => et === "security.admin.unauthorized",
    threshold: 2,
  },
  {
    id: "data_exfiltration_suspected",
    matchEventType: (et) => et === "security.response.guard",
    threshold: 2,
  },
  {
    id: "severity_escalation",
    matchFn: (entries) => {
      const criticals = entries.filter((e) => e.severity === "critical").length;
      const warns = entries.filter((e) => e.severity === "warn").length;
      return criticals >= 1 && warns >= 2;
    },
  },
]);

const subjectWindows = new Map();

let cleanupInterval = null;

const evictExpired = () => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, data] of subjectWindows) {
    data.entries = data.entries.filter((e) => e.timestamp > cutoff);
    if (!data.entries.length) {
      subjectWindows.delete(key);
    }
  }
};

const trackEvent = ({ subjectKeyHash, eventType, severity, auditLogId }) => {
  if (!subjectKeyHash) return;

  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let data = subjectWindows.get(subjectKeyHash);
  if (!data) {
    data = { entries: [], flagged: false };
    subjectWindows.set(subjectKeyHash, data);
  }

  data.entries = data.entries.filter((e) => e.timestamp > cutoff);
  data.entries.push({ eventType, severity, auditLogId, timestamp: now });

  if (data.flagged) return;

  for (const rule of ESCALATION_RULES) {
    let triggered = false;

    if (rule.matchFn) {
      triggered = rule.matchFn(data.entries);
    } else if (rule.matchEventType) {
      const matching = data.entries.filter((e) => rule.matchEventType(e.eventType));
      triggered = matching.length >= rule.threshold;
    }

    if (triggered) {
      data.flagged = true;
      try {
        recordEvent({
          eventType: AuditEventTypes.SECURITY_REALTIME_ESCALATION,
          subjectType: "system",
          subjectKey: subjectKeyHash,
          severity: "critical",
          metadata: {
            escalationRule: rule.id,
            eventCount: data.entries.length,
            windowMs: WINDOW_MS,
            triggerAuditLogId: auditLogId,
          },
        });
      } catch (err) {
        console.warn("[ESCALATION] failed to record escalation event", err?.message || err);
      }
      break;
    }
  }
};

const getHotSubjects = () => {
  const results = [];
  for (const [subjectKeyHash, data] of subjectWindows) {
    results.push({
      subjectKeyHash,
      eventCount: data.entries.length,
      flagged: data.flagged,
    });
  }
  return results;
};

const startEscalationCleanup = () => {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(evictExpired, CLEANUP_INTERVAL_MS);
  cleanupInterval.unref();
};

const stopEscalationCleanup = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
};

module.exports = {
  trackEvent,
  getHotSubjects,
  startEscalationCleanup,
  stopEscalationCleanup,
};
