const test = require("node:test");
const assert = require("node:assert/strict");

const servicePath = require.resolve("../../services/risk/RiskCalibrationService");
const profilePath = require.resolve("../../models/RiskCalibrationProfile");
const feedbackPath = require.resolve("../../models/RiskFeedback");
const assessmentPath = require.resolve("../../models/RiskAssessment");
const hmacPath = require.resolve("../../utils/hmacUtil");

const loadService = ({ assessmentOrganizationId = "org-a" } = {}) => {
  delete require.cache[servicePath];
  delete require.cache[profilePath];
  delete require.cache[feedbackPath];
  delete require.cache[assessmentPath];
  delete require.cache[hmacPath];

  let createdFeedback = null;
  require.cache[assessmentPath] = {
    id: assessmentPath,
    filename: assessmentPath,
    loaded: true,
    exports: {
      findById: () => ({
        lean: async () => ({
          _id: "ra-1",
          organizationId: assessmentOrganizationId,
          deterministic: { contributions: [{ ruleId: "severity_base", score: 10 }] },
        }),
      }),
    },
  };
  require.cache[profilePath] = {
    id: profilePath,
    filename: profilePath,
    loaded: true,
    exports: {
      findOne: () => ({
        lean: async () => null,
      }),
      create: async () => ({
        toObject: () => ({
          organizationId: assessmentOrganizationId,
          version: 1,
          ruleWeights: {},
        }),
      }),
      findOneAndUpdate: () => ({
        lean: async () => ({
          organizationId: assessmentOrganizationId,
          version: 2,
        }),
      }),
    },
  };
  require.cache[feedbackPath] = {
    id: feedbackPath,
    filename: feedbackPath,
    loaded: true,
    exports: {
      create: async (payload) => {
        createdFeedback = payload;
        return { _id: "fb-1" };
      },
    },
  };
  require.cache[hmacPath] = {
    id: hmacPath,
    filename: hmacPath,
    loaded: true,
    exports: { hmacEntityKey: (value) => `hash:${value}` },
  };

  return {
    service: require("../../services/risk/RiskCalibrationService"),
    getCreatedFeedback: () => createdFeedback,
  };
};

test("recordRiskFeedback defaults to assessment organization when request org is omitted", async () => {
  const { service, getCreatedFeedback } = loadService({ assessmentOrganizationId: "org-z" });

  const result = await service.recordRiskFeedback({
    assessmentId: "ra-1",
    feedbackType: "false_positive",
    actorKey: "actor-1",
  });

  assert.equal(getCreatedFeedback().organizationId, "org-z");
  assert.equal(result.organizationId, "org-z");
});

test("recordRiskFeedback rejects invalid feedbackType", async () => {
  const { service } = loadService();
  await assert.rejects(
    () =>
      service.recordRiskFeedback({
        assessmentId: "ra-1",
        feedbackType: "unknown_feedback",
      }),
    /invalid feedbackType/
  );
});
