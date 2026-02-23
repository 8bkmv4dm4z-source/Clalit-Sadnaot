const { validateActions } = require("./RiskActionRegistry");

const toNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const PATTERN_THRESHOLDS = {
  repeatedAuthFailures: 3,
  rateLimitAbuse: 2,
  highSeveritySpike: 2,
  rapidRegistrations: 5,
  adminActionBurst: 3,
};

const buildSubjectProfile = (subjectHistory = []) => {
  const eventCounts = {};
  const severityCounts = {};

  for (const entry of subjectHistory) {
    const et = String(entry?.eventType || "unknown");
    eventCounts[et] = (eventCounts[et] || 0) + 1;
    const sev = String(entry?.severity || "info");
    severityCounts[sev] = (severityCounts[sev] || 0) + 1;
  }

  const authFailures = Object.entries(eventCounts)
    .filter(([k]) => k.includes("auth.failure"))
    .reduce((sum, [, v]) => sum + v, 0);
  const rateLimitEvents = Object.entries(eventCounts)
    .filter(([k]) => k.includes("rate.limit"))
    .reduce((sum, [, v]) => sum + v, 0);
  const registrationEvents = Object.entries(eventCounts)
    .filter(([k]) => k.includes("workshop.registration"))
    .reduce((sum, [, v]) => sum + v, 0);
  const adminEvents = Object.entries(eventCounts)
    .filter(([k]) => k.startsWith("admin."))
    .reduce((sum, [, v]) => sum + v, 0);

  return {
    totalEvents: subjectHistory.length,
    eventCounts,
    severityCounts,
    recentWindow: "72h",
    patterns: {
      repeatedAuthFailures: authFailures >= PATTERN_THRESHOLDS.repeatedAuthFailures,
      rateLimitAbuse: rateLimitEvents >= PATTERN_THRESHOLDS.rateLimitAbuse,
      highSeveritySpike: (severityCounts.critical || 0) >= PATTERN_THRESHOLDS.highSeveritySpike,
      rapidRegistrations: registrationEvents >= PATTERN_THRESHOLDS.rapidRegistrations,
      adminActionBurst: adminEvents >= PATTERN_THRESHOLDS.adminActionBurst,
    },
  };
};

const getTopContributor = (deterministic) => {
  const contributions = deterministic?.contributions || [];
  if (!contributions.length) return null;
  return contributions.reduce((best, c) => (c.score > (best?.score || 0) ? c : best), contributions[0]);
};

const buildContextSummary = (auditLog = {}, deterministic = {}, subjectProfile = {}) => {
  const eventType = String(auditLog?.eventType || "unknown");
  const severity = String(auditLog?.severity || "info");
  const subjectType = String(auditLog?.subjectType || "system");
  const score = deterministic.score || 0;
  const riskLevel = deterministic.riskLevel || "low";
  const totalEvents = subjectProfile.totalEvents || 0;
  const topContrib = getTopContributor(deterministic);
  const topContribText = topContrib ? `${topContrib.label || topContrib.ruleId} (${topContrib.score}pts)` : "none";
  const patternFlags = Object.entries(subjectProfile.patterns || {})
    .filter(([, v]) => v)
    .map(([k]) => k);
  const patternText = patternFlags.length ? ` Detected patterns: ${patternFlags.join(", ")}.` : "";

  if (eventType.includes("auth.failure")) {
    const authCount = Object.entries(subjectProfile.eventCounts || {})
      .filter(([k]) => k.includes("auth.failure"))
      .reduce((sum, [, v]) => sum + v, 0);
    return `Failed login attempt detected (severity: ${severity}). This subject has had ${authCount} auth failures in the last 72h${subjectProfile.patterns?.repeatedAuthFailures ? " — pattern indicates possible credential stuffing" : ""}. Score ${score}/100 driven primarily by ${topContribText}.${patternText}`;
  }

  if (eventType.includes("workshop.maxed") || eventType.includes("capacity")) {
    const regCount = Object.entries(subjectProfile.eventCounts || {})
      .filter(([k]) => k.includes("workshop.registration"))
      .reduce((sum, [, v]) => sum + v, 0);
    return `Workshop hit maximum capacity. ${regCount} registrations from this subject in 72h${regCount >= PATTERN_THRESHOLDS.rapidRegistrations ? " suggests high activity" : ""}. Score ${score}/100 — moderate capacity pressure.${patternText}`;
  }

  if (eventType.startsWith("admin.")) {
    const adminCount = Object.entries(subjectProfile.eventCounts || {})
      .filter(([k]) => k.startsWith("admin."))
      .reduce((sum, [, v]) => sum + v, 0);
    const isDestructive = eventType.includes("delete") || eventType.includes("remove");
    return `Admin ${isDestructive ? "destructive" : ""} action: ${eventType}. This is the ${adminCount > 0 ? adminCount : 1}${adminCount === 1 ? "st" : adminCount === 2 ? "nd" : adminCount === 3 ? "rd" : "th"} admin action from this subject in 72h. Score ${score}/100 — ${score >= 70 ? "elevated due to admin route signal" : "within normal range"}.${patternText}`;
  }

  return `Event '${eventType}' (severity: ${severity}) for subject type '${subjectType}'. ${totalEvents} total events in 72h. Score ${score}/100 (${riskLevel}) — top contributor: ${topContribText}.${patternText}`;
};

const buildCandidateActions = ({ score, category, riskLevel, eventContext, subjectProfile }) => {
  const actions = [];
  const eventType = eventContext?.eventType || "";
  const patterns = subjectProfile?.patterns || {};
  const eventCounts = subjectProfile?.eventCounts || {};

  if (eventType.includes("auth.failure") && patterns.repeatedAuthFailures) {
    const authCount = Object.entries(eventCounts)
      .filter(([k]) => k.includes("auth.failure"))
      .reduce((sum, [, v]) => sum + v, 0);
    actions.push({
      actionId: "flag_subject",
      reason: `${authCount} authentication failures in 72h from this subject — consistent with brute-force pattern.`,
      implication: "If left unchecked, attacker may eventually guess credentials or trigger account lockout for legitimate user.",
      fix: "Review subject's login history and IP origins. Consider temporary account lock or forced password reset.",
      confidence: 0.8,
    });
  }

  if (eventType.includes("rate.limit") && patterns.rateLimitAbuse) {
    const rlCount = Object.entries(eventCounts)
      .filter(([k]) => k.includes("rate.limit"))
      .reduce((sum, [, v]) => sum + v, 0);
    actions.push({
      actionId: "notify_admin",
      reason: `${rlCount} rate limit violations in 72h — sustained abuse pattern.`,
      implication: "Continued rate limit abuse can degrade service for other users and may indicate automated scraping.",
      fix: "Check if the source IP should be blocked. Review rate limit thresholds for this endpoint.",
      confidence: 0.75,
    });
  }

  if (eventType.includes("response.guard")) {
    actions.push({
      actionId: "queue_manual_review",
      reason: "Response guard intercepted forbidden fields in API response.",
      implication: "A code path is attempting to expose sensitive data (PII, internal IDs, or auth fields) to the client.",
      fix: "Identify the API route from sourceMetadata. Fix the controller to exclude forbidden fields before response.",
      confidence: 0.8,
    });
  }

  if (eventType.includes("workshop.maxed") || eventType.includes("capacity")) {
    actions.push({
      actionId: "request_additional_context",
      reason: "Workshop reached capacity limit.",
      implication: "Users will be unable to register until spots open or capacity increases.",
      fix: "Consider increasing max participants or scheduling an additional workshop session.",
      confidence: 0.6,
    });
  }

  if (actions.length) return actions;

  const patternFlags = Object.entries(patterns)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const patternSuffix = patternFlags.length ? ` Detected patterns: ${patternFlags.join(", ")}.` : "";

  if (score >= 80 || riskLevel === "immediate") {
    actions.push({
      actionId: "notify_admin",
      reason: `High deterministic score (${score}) requires immediate human visibility.${patternSuffix}`,
      implication: "Unreviewed high-risk events may allow security incidents to escalate.",
      fix: "Admin should review this event and the subject's recent activity within 24 hours.",
      confidence: 0.8,
    });
    actions.push({
      actionId: "flag_subject",
      reason: `High score with repeated high-severity traits.${patternSuffix}`,
      implication: "Subject may be involved in ongoing malicious or anomalous behavior.",
      fix: "Investigate subject's full activity history and consider restricting access if warranted.",
      confidence: 0.75,
    });
  }

  if (score >= 50) {
    actions.push({
      actionId: "queue_manual_review",
      reason: `Medium-or-above risk (score ${score}) should be reviewed by an admin.${patternSuffix}`,
      implication: "Moderate risk events left unreviewed may accumulate into larger incidents.",
      fix: "Schedule admin review within 48 hours. Check for related events from this subject.",
      confidence: 0.7,
    });
  }

  if (category !== "SECURITY" || score < 70) {
    actions.push({
      actionId: "request_additional_context",
      reason: `Collect additional context before escalation.${patternSuffix}`,
      implication: "Insufficient context may lead to false escalation or missed signals.",
      fix: "Gather related audit logs and source metadata to form a complete picture.",
      confidence: 0.6,
    });
  }

  return actions;
};

const isOverlayEnabled = () => {
  if (process.env.RISK_AI_OVERLAY_ENABLED === "false") return false;
  return true;
};

const buildAIReasoningOverlay = ({ deterministic, category, auditLog = {}, subjectHistory = [] }) => {
  const enabled = isOverlayEnabled();
  if (!enabled) {
    return {
      enabled: false,
      summary: "AI advisory overlay disabled by configuration.",
      confidence: 0,
      advisoryScore: deterministic.score,
      divergenceScore: 0,
      suggestedActions: [],
      blockedActions: [],
      guardrails: {
        confidenceGateBlocked: false,
        divergenceExceeded: false,
        shadowMode: false,
      },
    };
  }

  const confidenceFloor = toNumber(process.env.RISK_CONFIDENCE_THRESHOLD, 0.6);
  const divergenceThreshold = toNumber(process.env.RISK_DIVERGENCE_THRESHOLD, 25);
  const shadowMode = process.env.RISK_SHADOW_MODE === "true";

  const subjectProfile = buildSubjectProfile(subjectHistory);

  const richness = clamp((deterministic.contributions?.length || 0) / 8, 0, 1);
  const historyBoost = clamp(subjectProfile.totalEvents / 20, 0, 0.15);
  const confidence = clamp(0.45 + richness * 0.45 + historyBoost, 0, 0.95);

  const advisoryShift = deterministic.riskLevel === "immediate" ? 0 : (category === "SECURITY" ? 4 : -3);
  const advisoryScore = clamp(Math.round(deterministic.score + advisoryShift), 0, 100);
  const divergenceScore = clamp(Math.abs(advisoryScore - deterministic.score), 0, 100);

  const summary = buildContextSummary(auditLog, deterministic, subjectProfile);

  const eventContext = {
    eventType: String(auditLog?.eventType || ""),
    severity: String(auditLog?.severity || "info"),
    subjectType: String(auditLog?.subjectType || "system"),
    route: String(auditLog?.metadata?.route || ""),
    reason: String(auditLog?.metadata?.reason || ""),
  };

  const candidateActions = buildCandidateActions({
    score: deterministic.score,
    category,
    riskLevel: deterministic.riskLevel,
    eventContext,
    subjectProfile,
  });
  const { allowed, blocked } = validateActions(candidateActions, {
    score: deterministic.score,
    confidence,
  });

  const confidenceGateBlocked = confidence < confidenceFloor;
  const divergenceExceeded = divergenceScore > divergenceThreshold;
  const blockAllSuggestions = confidenceGateBlocked || divergenceExceeded;

  return {
    enabled: true,
    summary,
    confidence,
    advisoryScore,
    divergenceScore,
    suggestedActions: blockAllSuggestions ? [] : allowed,
    blockedActions: blockAllSuggestions
      ? [
          ...blocked,
          ...allowed.map((item) => ({
            ...item,
            blocked: true,
            blockedReason: confidenceGateBlocked
              ? "confidence_below_threshold"
              : "divergence_exceeded",
          })),
        ]
      : blocked,
    guardrails: {
      confidenceGateBlocked,
      divergenceExceeded,
      shadowMode,
    },
  };
};

module.exports = {
  buildAIReasoningOverlay,
};
