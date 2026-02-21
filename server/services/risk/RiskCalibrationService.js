const RiskCalibrationProfile = require("../../models/RiskCalibrationProfile");
const RiskFeedback = require("../../models/RiskFeedback");
const RiskAssessment = require("../../models/RiskAssessment");
const { hmacEntityKey } = require("../../utils/hmacUtil");

const FEEDBACK_TO_DELTA = Object.freeze({
  false_positive: -2,
  downgrade: -2,
  true_positive: 2,
  escalate: 3,
  accepted_action: 1,
  rejected_action: -1,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizeWeights = (weights = {}) => {
  const clean = {};
  for (const [ruleId, value] of Object.entries(weights || {})) {
    const num = Number(value);
    clean[ruleId] = Number.isFinite(num) ? clamp(num, -20, 20) : 0;
  }
  return clean;
};

const computeCalibrationUpdate = ({ currentWeights = {}, targetRuleId, feedbackType }) => {
  const delta = FEEDBACK_TO_DELTA[feedbackType] || 0;
  if (!targetRuleId || delta === 0) {
    return { nextWeights: normalizeWeights(currentWeights), changes: [] };
  }

  const decayed = {};
  for (const [ruleId, value] of Object.entries(currentWeights || {})) {
    decayed[ruleId] = clamp(Number((Number(value || 0) * 0.98).toFixed(2)), -20, 20);
  }

  const before = Number(decayed[targetRuleId] || 0);
  const after = clamp(Number((before + delta).toFixed(2)), -20, 20);
  decayed[targetRuleId] = after;

  return {
    nextWeights: normalizeWeights(decayed),
    changes: [
      {
        ruleId: targetRuleId,
        from: before,
        to: after,
        feedbackType,
      },
    ],
  };
};

const getOrCreateCalibrationProfile = async (organizationId = "global") => {
  const existing = await RiskCalibrationProfile.findOne({ organizationId }).lean();
  if (existing) return existing;
  const created = await RiskCalibrationProfile.create({
    organizationId,
    active: true,
    version: 1,
    ruleWeights: {},
    driftScore: 0,
    history: [],
  });
  return created.toObject();
};

const selectTargetRule = (assessment) => {
  const contributions = assessment?.deterministic?.contributions || [];
  if (!contributions.length) return null;
  const top = [...contributions].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  return top?.ruleId || null;
};

const applyCalibrationFromFeedback = async ({ assessment, feedback, actorKeyHash }) => {
  const organizationId = feedback.organizationId || "global";
  const profile = await getOrCreateCalibrationProfile(organizationId);
  const targetRuleId = selectTargetRule(assessment);
  const update = computeCalibrationUpdate({
    currentWeights: profile.ruleWeights || {},
    targetRuleId,
    feedbackType: feedback.feedbackType,
  });

  if (!update.changes.length) return profile;

  const feedbackId = feedback?._id ? String(feedback._id) : "";
  const reason = `feedback:${feedback.feedbackType}`;
  const stampedChanges = update.changes.map((change) => ({ ...change, reason }));

  const updated = await RiskCalibrationProfile.findOneAndUpdate(
    { organizationId },
    {
      $set: {
        ruleWeights: update.nextWeights,
        updatedAt: new Date(),
      },
      $inc: { version: 1 },
      $push: {
        history: {
          at: new Date(),
          feedbackId,
          actorKeyHash: actorKeyHash || "",
          changes: stampedChanges,
        },
      },
    },
    { new: true, upsert: true }
  ).lean();

  return updated;
};

const recordRiskFeedback = async ({
  assessmentId,
  feedbackType,
  actorKey,
  organizationId = "global",
  notes = "",
  actionId = "",
}) => {
  if (!assessmentId || !feedbackType) {
    throw new Error("assessmentId and feedbackType are required");
  }

  const assessment = await RiskAssessment.findById(assessmentId).lean();
  if (!assessment) throw new Error("Risk assessment not found");

  const actorKeyHash = actorKey ? hmacEntityKey(actorKey) : "";

  const feedback = await RiskFeedback.create({
    assessmentId,
    organizationId,
    feedbackType,
    actionId: String(actionId || "").slice(0, 80),
    actorKeyHash,
    notes: String(notes || "").slice(0, 500),
  });

  const profile = await applyCalibrationFromFeedback({
    assessment,
    feedback,
    actorKeyHash,
  });

  return {
    feedbackId: String(feedback._id),
    profileVersion: profile?.version || 1,
    organizationId: profile?.organizationId || organizationId,
  };
};

module.exports = {
  computeCalibrationUpdate,
  getOrCreateCalibrationProfile,
  recordRiskFeedback,
};

