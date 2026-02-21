const { validateActions } = require("./RiskActionRegistry");

const toNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const buildCandidateActions = ({ score, category, riskLevel }) => {
  const actions = [];

  if (score >= 80 || riskLevel === "immediate") {
    actions.push({
      actionId: "notify_admin",
      reason: "High deterministic score requires immediate human visibility.",
      confidence: 0.8,
    });
    actions.push({
      actionId: "flag_subject",
      reason: "High score with repeated high-severity traits.",
      confidence: 0.75,
    });
  }

  if (score >= 50) {
    actions.push({
      actionId: "queue_manual_review",
      reason: "Medium-or-above risk should be reviewed by an admin.",
      confidence: 0.7,
    });
  }

  if (category !== "SECURITY" || score < 70) {
    actions.push({
      actionId: "request_additional_context",
      reason: "Collect additional context before escalation.",
      confidence: 0.6,
    });
  }

  return actions;
};

const isOverlayEnabled = () => {
  if (process.env.RISK_AI_OVERLAY_ENABLED === "false") return false;
  return true;
};

const buildAIReasoningOverlay = ({ deterministic, category }) => {
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

  const richness = clamp((deterministic.contributions?.length || 0) / 8, 0, 1);
  const confidence = clamp(0.45 + richness * 0.45, 0, 0.95);

  const advisoryShift = deterministic.riskLevel === "immediate" ? 0 : (category === "SECURITY" ? 4 : -3);
  const advisoryScore = clamp(Math.round(deterministic.score + advisoryShift), 0, 100);
  const divergenceScore = clamp(Math.abs(advisoryScore - deterministic.score), 0, 100);

  const candidateActions = buildCandidateActions({
    score: deterministic.score,
    category,
    riskLevel: deterministic.riskLevel,
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
    summary: `Advisory review confidence=${confidence.toFixed(2)} divergence=${divergenceScore}.`,
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
