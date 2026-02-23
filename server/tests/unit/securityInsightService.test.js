const test = require("node:test");
const assert = require("node:assert/strict");

const servicePath = require.resolve("../../services/SecurityInsightService");
const adminAuditLogPath = require.resolve("../../models/AdminAuditLog");
const securityInsightModelPath = require.resolve("../../models/SecurityInsight");
const observabilityPath = require.resolve("../../services/ObservabilityMetricsService");

const loadService = ({ hourlyDoc, dailyDoc } = {}) => {
  delete require.cache[servicePath];
  delete require.cache[adminAuditLogPath];
  delete require.cache[securityInsightModelPath];
  delete require.cache[observabilityPath];

  require.cache[adminAuditLogPath] = {
    id: adminAuditLogPath,
    filename: adminAuditLogPath,
    loaded: true,
    exports: {
      aggregate: async () => [],
    },
  };

  require.cache[securityInsightModelPath] = {
    id: securityInsightModelPath,
    filename: securityInsightModelPath,
    loaded: true,
    exports: {
      findOne: (filters) => ({
        sort() {
          return this;
        },
        lean: async () => (filters?.periodType === "hourly" ? hourlyDoc : dailyDoc),
      }),
      create: async (doc) => doc,
    },
  };

  require.cache[observabilityPath] = {
    id: observabilityPath,
    filename: observabilityPath,
    loaded: true,
    exports: {
      recordSecurityInsightSnapshot: () => {},
    },
  };

  return require("../../services/SecurityInsightService");
};

test("getLatestInsights strips document and nested warning ids", async () => {
  const service = loadService({
    hourlyDoc: {
      _id: "hourly-doc",
      __v: 0,
      periodType: "hourly",
      warnings: [
        {
          _id: "warn-hourly",
          __v: 0,
          code: "HIGH_AUTH_FAILURES",
          message: "example",
          severity: "critical",
          value: 10,
          threshold: 5,
        },
      ],
    },
    dailyDoc: {
      _id: "daily-doc",
      __v: 0,
      periodType: "daily",
      warnings: [
        {
          _id: "warn-daily",
          code: "CRITICAL_EVENTS_DETECTED",
          message: "example",
          severity: "critical",
          value: 2,
          threshold: 1,
        },
      ],
    },
  });

  const result = await service.getLatestInsights();

  assert.equal(result.hourly._id, undefined);
  assert.equal(result.hourly.__v, undefined);
  assert.equal(result.hourly.warnings[0]._id, undefined);
  assert.equal(result.hourly.warnings[0].__v, undefined);

  assert.equal(result.daily._id, undefined);
  assert.equal(result.daily.__v, undefined);
  assert.equal(result.daily.warnings[0]._id, undefined);

  assert.equal(result.warnings.length, 2);
  assert.equal(result.warnings[0]._id, undefined);
  assert.equal(result.warnings[1]._id, undefined);
});
