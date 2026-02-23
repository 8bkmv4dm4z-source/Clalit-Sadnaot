const ENGINE_VERSION = "1.0.0";

const SEVERITY_BASE = Object.freeze({
  info: 15,
  warn: 45,
  critical: 80,
});

const CATEGORY_BASE = Object.freeze({
  SECURITY: 12,
  REGISTRATION: 8,
  WORKSHOP: 5,
  CAPACITY: 18,
  HYGIENE: 10,
});

const EVENT_RULES = Object.freeze({
  "security.auth.failure": 8,
  "security.csrf.failure": 25,
  "security.admin.password.failure": 22,
  "security.role.integrity": 25,
  "security.response.guard": 30,
  "security.rate.limit": 10,
  "security.otp.lockout": 14,
  "workshop.maxed": 20,
  "user.stale.detected": 10,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const resolveRiskLevel = (score) => {
  if (score >= 90) return "immediate";
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  if (score >= 25) return "warn";
  return "low";
};

const readCalibrationOffset = (weights = {}, ruleId) => {
  const value = Number(weights[ruleId] || 0);
  return Number.isFinite(value) ? clamp(value, -20, 20) : 0;
};

const applyRule = ({ ruleId, label, category, baseScore, reason, weights }) => {
  const calibrationOffset = readCalibrationOffset(weights, ruleId);
  const score = clamp(Math.round(baseScore + calibrationOffset), 0, 100);
  return {
    ruleId,
    label,
    category,
    baseScore,
    calibrationOffset,
    score,
    reason,
  };
};

const deriveEventRuleScore = (eventType = "") => {
  if (EVENT_RULES[eventType] !== undefined) return EVENT_RULES[eventType];
  if (eventType.startsWith("security.")) return 10;
  if (eventType.startsWith("admin.")) return 14;
  return 0;
};

const scoreAuditEvent = (auditEvent = {}, options = {}) => {
  const weights = options?.calibrationProfile?.ruleWeights || {};
  const severity = String(auditEvent.severity || "info");
  const category = String(auditEvent.category || "SECURITY");
  const eventType = String(auditEvent.eventType || "security");
  const metadata = auditEvent.metadata || {};

  const contributions = [];

  contributions.push(
    applyRule({
      ruleId: "severity_base",
      label: "Severity baseline",
      category: "severity",
      baseScore: SEVERITY_BASE[severity] || 15,
      reason: `Mapped severity '${severity}' to baseline score.`,
      weights,
    })
  );

  contributions.push(
    applyRule({
      ruleId: "category_base",
      label: "Category baseline",
      category: "category",
      baseScore: CATEGORY_BASE[category] || 8,
      reason: `Mapped category '${category}' to baseline score.`,
      weights,
    })
  );

  const eventRuleScore = deriveEventRuleScore(eventType);
  if (eventRuleScore > 0) {
    contributions.push(
      applyRule({
        ruleId: `event:${eventType}`,
        label: "Event-specific signal",
        category: "event",
        baseScore: eventRuleScore,
        reason: `Applied event rule for '${eventType}'.`,
        weights,
      })
    );
  }

  if (metadata?.route && String(metadata.route).includes("/admin/")) {
    contributions.push(
      applyRule({
        ruleId: "metadata_admin_route",
        label: "Admin route signal",
        category: "metadata",
        baseScore: 8,
        reason: "Event occurred on admin route.",
        weights,
      })
    );
  }

  if (metadata?.reason === "auth_failure") {
    contributions.push(
      applyRule({
        ruleId: "metadata_auth_failure",
        label: "Auth failure context",
        category: "metadata",
        baseScore: 5,
        reason: "Auth failure reason was explicitly recorded.",
        weights,
      })
    );
  }

  const rawScore = contributions.reduce((sum, item) => sum + item.score, 0);
  const normalizedScore = clamp(Math.round(rawScore), 0, 100);
  const riskLevel = resolveRiskLevel(normalizedScore);
  const summary = `${eventType} scored ${normalizedScore}/100 (${riskLevel}).`;

  return {
    score: normalizedScore,
    riskLevel,
    version: ENGINE_VERSION,
    summary,
    contributions,
  };
};

module.exports = {
  scoreAuditEvent,
  resolveRiskLevel,
};

