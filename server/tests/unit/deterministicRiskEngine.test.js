const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { scoreAuditEvent, resolveRiskLevel } = require("../../services/risk/DeterministicRiskEngine");

describe("DeterministicRiskEngine", () => {
  describe("resolveRiskLevel boundary tests", () => {
    it("returns 'low' for score 0", () => {
      assert.equal(resolveRiskLevel(0), "low");
    });

    it("returns 'low' for score 24", () => {
      assert.equal(resolveRiskLevel(24), "low");
    });

    it("returns 'warn' for score 25 (boundary)", () => {
      assert.equal(resolveRiskLevel(25), "warn");
    });

    it("returns 'warn' for score 49", () => {
      assert.equal(resolveRiskLevel(49), "warn");
    });

    it("returns 'medium' for score 50 (boundary)", () => {
      assert.equal(resolveRiskLevel(50), "medium");
    });

    it("returns 'medium' for score 74", () => {
      assert.equal(resolveRiskLevel(74), "medium");
    });

    it("returns 'high' for score 75 (boundary)", () => {
      assert.equal(resolveRiskLevel(75), "high");
    });

    it("returns 'high' for score 89", () => {
      assert.equal(resolveRiskLevel(89), "high");
    });

    it("returns 'immediate' for score 90 (boundary)", () => {
      assert.equal(resolveRiskLevel(90), "immediate");
    });

    it("returns 'immediate' for score 100", () => {
      assert.equal(resolveRiskLevel(100), "immediate");
    });
  });

  describe("scoreAuditEvent clamp boundaries", () => {
    it("clamps final score to minimum 0", () => {
      const result = scoreAuditEvent(
        { severity: "info", category: "WORKSHOP", eventType: "unknown.event" },
        { calibrationProfile: { ruleWeights: { severity_base: -20, category_base: -20 } } }
      );
      assert.ok(result.score >= 0, `expected score >= 0, got ${result.score}`);
    });

    it("clamps final score to maximum 100", () => {
      const result = scoreAuditEvent(
        {
          severity: "critical",
          category: "CAPACITY",
          eventType: "security.response.guard",
          metadata: { route: "/admin/settings", reason: "auth_failure" },
        },
        { calibrationProfile: { ruleWeights: { severity_base: 20, category_base: 20, "event:security.response.guard": 20, metadata_admin_route: 20, metadata_auth_failure: 20 } } }
      );
      assert.ok(result.score <= 100, `expected score <= 100, got ${result.score}`);
    });
  });

  describe("readCalibrationOffset clamping", () => {
    it("clamps calibration offset to -20 floor", () => {
      const result = scoreAuditEvent(
        { severity: "info", category: "SECURITY", eventType: "security.auth.failure" },
        { calibrationProfile: { ruleWeights: { severity_base: -50 } } }
      );
      const severityContrib = result.contributions.find((c) => c.ruleId === "severity_base");
      assert.equal(severityContrib.calibrationOffset, -20);
    });

    it("clamps calibration offset to +20 ceiling", () => {
      const result = scoreAuditEvent(
        { severity: "info", category: "SECURITY", eventType: "security.auth.failure" },
        { calibrationProfile: { ruleWeights: { severity_base: 99 } } }
      );
      const severityContrib = result.contributions.find((c) => c.ruleId === "severity_base");
      assert.equal(severityContrib.calibrationOffset, 20);
    });
  });

  describe("scoreAuditEvent output shape", () => {
    it("returns canonical schema with all required fields", () => {
      const result = scoreAuditEvent({
        severity: "warn",
        category: "SECURITY",
        eventType: "security.auth.failure",
      });

      assert.equal(typeof result.score, "number");
      assert.ok(result.score >= 0 && result.score <= 100);
      assert.equal(typeof result.riskLevel, "string");
      assert.ok(["low", "warn", "medium", "high", "immediate"].includes(result.riskLevel));
      assert.equal(result.version, "1.0.0");
      assert.equal(typeof result.summary, "string");
      assert.ok(Array.isArray(result.contributions));

      for (const contrib of result.contributions) {
        assert.equal(typeof contrib.ruleId, "string");
        assert.equal(typeof contrib.label, "string");
        assert.equal(typeof contrib.category, "string");
        assert.equal(typeof contrib.baseScore, "number");
        assert.equal(typeof contrib.calibrationOffset, "number");
        assert.equal(typeof contrib.score, "number");
        assert.equal(typeof contrib.reason, "string");
      }
    });

    it("uses frozen constants — Object.freeze prevents mutation", () => {
      const result1 = scoreAuditEvent({ severity: "critical", category: "SECURITY", eventType: "security.csrf.failure" });
      const result2 = scoreAuditEvent({ severity: "critical", category: "SECURITY", eventType: "security.csrf.failure" });
      assert.equal(result1.score, result2.score);
      assert.equal(result1.riskLevel, result2.riskLevel);
    });
  });
});
