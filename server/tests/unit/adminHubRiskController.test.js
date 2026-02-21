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

const loadController = ({
  rows = [],
  queueSummaryRows = [],
  recordRiskFeedbackImpl,
  retryRiskAssessmentImpl,
  onFind,
  onAggregate,
} = {}) => {
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
    exports: { renderPrometheusMetrics: () => "" },
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
      find: (filters) => {
        if (typeof onFind === "function") onFind(filters);
        return {
        sort() {
          return this;
        },
        skip() {
          return this;
        },
        limit() {
          return this;
        },
        lean: async () => rows,
        };
      },
      aggregate: async (pipeline) => {
        if (typeof onAggregate === "function") onAggregate(pipeline);
        return queueSummaryRows;
      },
    },
  };
  require.cache[riskCalibrationPath] = {
    id: riskCalibrationPath,
    filename: riskCalibrationPath,
    loaded: true,
    exports: {
      recordRiskFeedback:
        recordRiskFeedbackImpl ||
        (async () => ({ feedbackId: "fb-1", profileVersion: 2, organizationId: "global" })),
    },
  };
  require.cache[riskReviewerPath] = {
    id: riskReviewerPath,
    filename: riskReviewerPath,
    loaded: true,
    exports: {
      retryRiskAssessment:
        retryRiskAssessmentImpl ||
        (async ({ assessmentId }) => ({
          _id: assessmentId,
          eventType: "security.auth.failure",
          category: "SECURITY",
          processing: { status: "pending" },
        })),
    },
  };

  return require("../../controllers/adminHubController");
};

const createRes = () => ({
  statusCode: 0,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
  send(payload) {
    this.body = payload;
    return this;
  },
});

test("getRiskAssessments returns sanitized rows with pagination and queue summary", async () => {
  const controller = loadController({
    rows: [
      {
        _id: "mongo-id",
        __v: 0,
        subjectKeyHash: "hash",
        eventType: "security.auth.failure",
        category: "SECURITY",
      },
    ],
    queueSummaryRows: [
      { _id: "pending", count: 2 },
      { _id: "processing", count: 1 },
      { _id: "completed", count: 3 },
    ],
  });
  const req = { query: { page: "2", limit: "10" } };
  const res = createRes();

  await controller.getRiskAssessments(req, res);

  assert.equal(res.statusCode, 0);
  assert.equal(res.body.page, 2);
  assert.equal(res.body.limit, 10);
  assert.equal(res.body.assessments.length, 1);
  assert.equal(res.body.assessments[0]._id, undefined);
  assert.equal(res.body.assessments[0].__v, undefined);
  assert.equal(res.body.assessments[0].subjectKeyHash, undefined);
  assert.deepEqual(res.body.queueSummary, {
    pending: 2,
    processing: 1,
    failed: 0,
    dead_letter: 0,
    completed: 3,
  });
});

test("getRiskAssessments applies status filter to rows and excludes it from queue summary scope", async () => {
  const findFilters = [];
  const aggregatePipelines = [];
  const controller = loadController({
    onFind: (filters) => findFilters.push(filters),
    onAggregate: (pipeline) => aggregatePipelines.push(pipeline),
  });
  const req = {
    query: {
      status: "processing",
      eventType: "security.auth.failure",
      category: "SECURITY",
    },
  };
  const res = createRes();

  await controller.getRiskAssessments(req, res);

  assert.deepEqual(findFilters[0], {
    "processing.status": "processing",
    eventType: "security.auth.failure",
    category: "SECURITY",
  });
  assert.deepEqual(aggregatePipelines[0], [
    { $match: { eventType: "security.auth.failure", category: "SECURITY" } },
    { $group: { _id: "$processing.status", count: { $sum: 1 } } },
  ]);
});

test("getRiskAssessments rejects invalid status filter", async () => {
  const controller = loadController();
  const req = { query: { status: "unknown_status" } };
  const res = createRes();

  await controller.getRiskAssessments(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: "Invalid status" });
});

test("submitRiskFeedback rejects missing required fields", async () => {
  const controller = loadController();
  const req = { params: { assessmentId: "" }, body: {}, user: { entityKey: "actor-1" } };
  const res = createRes();

  await controller.submitRiskFeedback(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: "assessmentId and feedbackType are required" });
});

test("submitRiskFeedback returns created result", async () => {
  let captured = null;
  const controller = loadController({
    recordRiskFeedbackImpl: async (payload) => {
      captured = payload;
      return { feedbackId: "fb-11", profileVersion: 3, organizationId: "org-a" };
    },
  });
  const req = {
    params: { assessmentId: "ra-1" },
    body: { feedbackType: "false_positive", notes: "noise", actionId: "queue_manual_review", organizationId: "org-a" },
    user: { entityKey: "actor-1" },
  };
  const res = createRes();

  await controller.submitRiskFeedback(req, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { feedbackId: "fb-11", profileVersion: 3, organizationId: "org-a" });
  assert.equal(captured.assessmentId, "ra-1");
  assert.equal(captured.feedbackType, "false_positive");
  assert.equal(captured.actorKey, "actor-1");
});

test("submitRiskFeedback returns 400 on organization mismatch", async () => {
  const controller = loadController({
    recordRiskFeedbackImpl: async () => {
      throw new Error("organizationId mismatch");
    },
  });
  const req = {
    params: { assessmentId: "ra-1" },
    body: { feedbackType: "false_positive", organizationId: "org-wrong" },
    user: { entityKey: "actor-1" },
  };
  const res = createRes();

  await controller.submitRiskFeedback(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: "organizationId does not match assessment" });
});

test("submitRiskFeedback returns 400 on invalid feedback type", async () => {
  const controller = loadController({
    recordRiskFeedbackImpl: async () => {
      throw new Error("invalid feedbackType");
    },
  });
  const req = {
    params: { assessmentId: "ra-1" },
    body: { feedbackType: "invalid_type" },
    user: { entityKey: "actor-1" },
  };
  const res = createRes();

  await controller.submitRiskFeedback(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: "Invalid feedbackType" });
});

test("getRiskAssessmentFailures returns only failures list", async () => {
  const controller = loadController({
    rows: [
      {
        _id: "mongo-1",
        __v: 0,
        subjectKeyHash: "hash",
        processing: { status: "failed" },
      },
    ],
  });
  const req = { query: { page: "1", limit: "5" } };
  const res = createRes();

  await controller.getRiskAssessmentFailures(req, res);

  assert.equal(res.body.page, 1);
  assert.equal(res.body.limit, 5);
  assert.equal(res.body.failures.length, 1);
  assert.equal(res.body.failures[0]._id, undefined);
  assert.equal(res.body.failures[0].subjectKeyHash, undefined);
});

test("retryAssessment returns retried assessment", async () => {
  const controller = loadController({
    retryRiskAssessmentImpl: async ({ assessmentId }) => ({
      _id: assessmentId,
      subjectKeyHash: "hash",
      eventType: "security.auth.failure",
      processing: { status: "pending" },
    }),
  });
  const req = { params: { assessmentId: "ra-1" }, user: { entityKey: "actor-9" } };
  const res = createRes();

  await controller.retryAssessment(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.assessment._id, undefined);
  assert.equal(res.body.assessment.subjectKeyHash, undefined);
  assert.equal(res.body.assessment.processing.status, "pending");
});

test("retryAssessment returns 409 for non-retryable status", async () => {
  const controller = loadController({
    retryRiskAssessmentImpl: async () => {
      throw new Error("retry_not_allowed");
    },
  });
  const req = { params: { assessmentId: "ra-1" }, user: { entityKey: "actor-1" } };
  const res = createRes();

  await controller.retryAssessment(req, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { message: "Assessment is not in retryable status" });
});
