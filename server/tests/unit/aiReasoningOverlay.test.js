const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAIReasoningOverlay } = require("../../services/risk/AIReasoningOverlay");

test("buildAIReasoningOverlay blocks suggested actions when divergence exceeds threshold", () => {
  process.env.RISK_AI_OVERLAY_ENABLED = "true";
  process.env.RISK_DIVERGENCE_THRESHOLD = "1";
  process.env.RISK_CONFIDENCE_THRESHOLD = "0.1";

  const overlay = buildAIReasoningOverlay({
    deterministic: {
      score: 55,
      riskLevel: "medium",
      contributions: [{ ruleId: "r1" }, { ruleId: "r2" }],
    },
    category: "SECURITY",
  });

  assert.equal(overlay.guardrails.divergenceExceeded, true);
  assert.deepEqual(overlay.suggestedActions, []);
  assert.ok(
    overlay.blockedActions.some((item) => item.blockedReason === "divergence_exceeded")
  );
});
