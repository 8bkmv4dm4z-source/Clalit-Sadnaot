const test = require("node:test");
const assert = require("node:assert/strict");

const controllerPath = require.resolve("../../controllers/adminHubController");
const observabilityPath = require.resolve("../../services/ObservabilityMetricsService");
const auditLogServicePath = require.resolve("../../services/AuditLogService");
const auditRegistryPath = require.resolve("../../services/AuditEventRegistry");
const adminHubServicePath = require.resolve("../../services/AdminHubService");
const securityInsightPath = require.resolve("../../services/SecurityInsightService");
const riskAssessmentPath = require.resolve("../../models/RiskAssessment");
const riskCalibrationPath = require.resolve("../../services/risk/RiskCalibrationService");
const riskReviewerPath = require.resolve("../../services/risk/RiskReviewerService");

const loadController = ({ renderPrometheusMetrics }) => {
  delete require.cache[controllerPath];
  delete require.cache[observabilityPath];
  delete require.cache[auditLogServicePath];
  delete require.cache[auditRegistryPath];
  delete require.cache[adminHubServicePath];
  delete require.cache[securityInsightPath];
  delete require.cache[riskAssessmentPath];
  delete require.cache[riskCalibrationPath];
  delete require.cache[riskReviewerPath];

  require.cache[observabilityPath] = {
    id: observabilityPath,
    filename: observabilityPath,
    loaded: true,
    exports: { renderPrometheusMetrics },
  };
  require.cache[auditLogServicePath] = {
    id: auditLogServicePath,
    filename: auditLogServicePath,
    loaded: true,
    exports: {
      queryLogs: async () => [],
      sanitizeMetadata: (value) => value,
    },
  };
  require.cache[auditRegistryPath] = {
    id: auditRegistryPath,
    filename: auditRegistryPath,
    loaded: true,
    exports: {
      allowedEventTypes: [],
      AuditSeverityLevels: { LOW: "low", MEDIUM: "medium", HIGH: "high", CRITICAL: "critical" },
      getAuditEventDefinition: () => null,
    },
  };
  require.cache[adminHubServicePath] = {
    id: adminHubServicePath,
    filename: adminHubServicePath,
    loaded: true,
    exports: {
      getMaxedWorkshops: async () => [],
      getStaleUsers: async () => [],
    },
  };
  require.cache[securityInsightPath] = {
    id: securityInsightPath,
    filename: securityInsightPath,
    loaded: true,
    exports: {
      getLatestInsights: async () => ({ hourly: null, daily: null, warnings: [] }),
    },
  };
  require.cache[riskAssessmentPath] = {
    id: riskAssessmentPath,
    filename: riskAssessmentPath,
    loaded: true,
    exports: {
      find: () => ({
        sort() {
          return this;
        },
        skip() {
          return this;
        },
        limit() {
          return this;
        },
        lean: async () => [],
      }),
    },
  };
  require.cache[riskCalibrationPath] = {
    id: riskCalibrationPath,
    filename: riskCalibrationPath,
    loaded: true,
    exports: {
      recordRiskFeedback: async () => ({ feedbackId: "f1", profileVersion: 1, organizationId: "global" }),
    },
  };
  require.cache[riskReviewerPath] = {
    id: riskReviewerPath,
    filename: riskReviewerPath,
    loaded: true,
    exports: {
      retryRiskAssessment: async () => ({}),
      scheduleRiskBackfillFromAuditLogs: () => false,
    },
  };

  return require("../../controllers/adminHubController");
};

test("getMetrics returns Prometheus text payload", async () => {
  const controller = loadController({
    renderPrometheusMetrics: () => "# HELP ws3_api_requests_total sample\n",
  });

  const headers = {};
  const res = {
    statusCode: 0,
    body: null,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  await controller.getMetrics({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(
    headers["content-type"],
    "text/plain; version=0.0.4; charset=utf-8"
  );
  assert.match(String(res.body), /ws3_api_requests_total/);
});

test("getMetrics returns 500 JSON on exporter failure", async () => {
  const controller = loadController({
    renderPrometheusMetrics: () => {
      throw new Error("boom");
    },
  });

  const res = {
    statusCode: 0,
    body: null,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  await controller.getMetrics({}, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Failed to export metrics" });
});
