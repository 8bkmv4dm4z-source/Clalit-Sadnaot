const RiskAssessment = require("../../models/RiskAssessment");
const AdminAuditLog = require("../../models/AdminAuditLog");
const { hmacEntityKey } = require("../../utils/hmacUtil");
const { scoreAuditEvent } = require("./DeterministicRiskEngine");
const { buildAIReasoningOverlay } = require("./AIReasoningOverlay");
const { getOrCreateCalibrationProfile } = require("./RiskCalibrationService");

const toObjectId = (value) => value;
const FALLBACK_LEASE_OWNER = "risk-reviewer";

const toPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getReliabilityConfig = () => ({
  leaseDurationMs: toPositiveInteger(process.env.RISK_REVIEWER_LEASE_MS, 30000),
  retryBaseMs: toPositiveInteger(process.env.RISK_REVIEWER_RETRY_BASE_MS, 1000),
  retryMaxMs: toPositiveInteger(process.env.RISK_REVIEWER_RETRY_MAX_MS, 60000),
  maxAttempts: toPositiveInteger(process.env.RISK_REVIEWER_MAX_ATTEMPTS, 3),
  leaseOwner: String(process.env.RISK_REVIEWER_LEASE_OWNER || FALLBACK_LEASE_OWNER),
});

const isManualReviewRequired = (deterministic = {}, aiOverlay = {}) => {
  if (["medium", "high", "immediate"].includes(deterministic.riskLevel)) return true;
  const suggested = aiOverlay?.suggestedActions || [];
  return suggested.some((item) => item?.actionId === "queue_manual_review");
};

const buildSubjectKeyHash = (auditLog) => {
  if (auditLog?.subjectKeyHash) return auditLog.subjectKeyHash;
  return hmacEntityKey(String(auditLog?.subjectKey || ""));
};

const buildAssessmentEnvelope = async (auditLog = {}) => {
  const organizationId = String(auditLog?.metadata?.organizationId || "global");
  const calibrationProfile = await getOrCreateCalibrationProfile(organizationId);
  const deterministic = scoreAuditEvent(auditLog, { calibrationProfile });
  const aiOverlay = buildAIReasoningOverlay({
    deterministic,
    category: String(auditLog?.category || "SECURITY"),
  });

  return {
    organizationId,
    deterministic,
    aiOverlay,
    final: {
      score: deterministic.score,
      riskLevel: deterministic.riskLevel,
      requiresManualReview: isManualReviewRequired(deterministic, aiOverlay),
      sourceOfTruth: "deterministic",
    },
    calibration: {
      profileVersion: Number(calibrationProfile?.version || 1),
      appliedRuleWeights: calibrationProfile?.ruleWeights || {},
    },
  };
};

const hasActiveLease = (assessment = {}, now = new Date()) => {
  if (assessment?.processing?.status !== "processing") return false;
  const leaseExpiresAt = assessment?.processing?.leaseExpiresAt ? new Date(assessment.processing.leaseExpiresAt) : null;
  return Boolean(leaseExpiresAt && leaseExpiresAt.getTime() > now.getTime());
};

const isRetryPending = (assessment = {}, now = new Date()) => {
  if (assessment?.processing?.status !== "failed") return false;
  const nextRetryAt = assessment?.processing?.nextRetryAt ? new Date(assessment.processing.nextRetryAt) : null;
  return Boolean(nextRetryAt && nextRetryAt.getTime() > now.getTime());
};

const computeRetryDelayMs = (attempts = 1, config = getReliabilityConfig()) => {
  const exponent = Math.max(0, Number(attempts) - 1);
  const delay = config.retryBaseMs * Math.pow(2, exponent);
  return Math.min(delay, config.retryMaxMs);
};

const markProcessing = async (auditLog = {}, now = new Date(), config = getReliabilityConfig()) => {
  const auditLogId = toObjectId(auditLog?._id);
  const leaseExpiresAt = new Date(now.getTime() + config.leaseDurationMs);
  return RiskAssessment.findOneAndUpdate(
    {
      auditLogId,
      "processing.status": { $nin: ["completed", "dead_letter"] },
      $and: [
        {
          $or: [
            { "processing.status": { $ne: "processing" } },
            { "processing.leaseExpiresAt": { $lte: now } },
            { "processing.leaseExpiresAt": { $exists: false } },
          ],
        },
        {
          $or: [
            { "processing.nextRetryAt": { $exists: false } },
            { "processing.nextRetryAt": { $lte: now } },
          ],
        },
      ],
    },
    {
      $setOnInsert: {
        auditLogId,
        organizationId: String(auditLog?.metadata?.organizationId || "global"),
        eventType: String(auditLog?.eventType || "security"),
        category: String(auditLog?.category || "SECURITY"),
        severity: String(auditLog?.severity || "info"),
        subjectType: String(auditLog?.subjectType || "system"),
        subjectKey: String(auditLog?.subjectKey || "system"),
        subjectKeyHash: buildSubjectKeyHash(auditLog),
        "processing.maxAttempts": config.maxAttempts,
      },
      $set: {
        "processing.status": "processing",
        "processing.lastAttemptAt": now,
        "processing.lastError": "",
        "processing.maxAttempts": config.maxAttempts,
        "processing.leaseOwner": config.leaseOwner,
        "processing.leaseAcquiredAt": now,
        "processing.leaseExpiresAt": leaseExpiresAt,
      },
      $inc: { "processing.attempts": 1 },
      $unset: {
        "processing.nextRetryAt": "",
      },
    },
    { new: true, upsert: true }
  ).lean();
};

const processAuditLogRisk = async (auditLog = {}) => {
  const auditLogId = toObjectId(auditLog?._id);
  if (!auditLogId) return null;
  const config = getReliabilityConfig();
  const now = new Date();

  const existing = await RiskAssessment.findOne({ auditLogId }).lean();
  if (["completed", "dead_letter"].includes(existing?.processing?.status)) return existing;
  if (hasActiveLease(existing, now)) return existing;
  if (isRetryPending(existing, now)) return existing;

  try {
    let claim;
    try {
      claim = await markProcessing(auditLog, now, config);
    } catch (claimErr) {
      if (Number(claimErr?.code) === 11000) {
        return RiskAssessment.findOne({ auditLogId }).lean();
      }
      throw claimErr;
    }

    if (!claim) {
      return RiskAssessment.findOne({ auditLogId }).lean();
    }

    const envelope = await buildAssessmentEnvelope(auditLog);

    return await RiskAssessment.findOneAndUpdate(
      { auditLogId },
      {
        $set: {
          organizationId: envelope.organizationId,
          eventType: String(auditLog?.eventType || "security"),
          category: String(auditLog?.category || "SECURITY"),
          severity: String(auditLog?.severity || "info"),
          subjectType: String(auditLog?.subjectType || "system"),
          subjectKey: String(auditLog?.subjectKey || "system"),
          subjectKeyHash: buildSubjectKeyHash(auditLog),
          deterministic: envelope.deterministic,
          aiOverlay: envelope.aiOverlay,
          final: envelope.final,
          calibration: envelope.calibration,
          "processing.status": "completed",
          "processing.processedAt": new Date(),
          "processing.lastError": "",
          "processing.deadLetterReason": "",
        },
        $unset: {
          "processing.leaseOwner": "",
          "processing.leaseAcquiredAt": "",
          "processing.leaseExpiresAt": "",
          "processing.nextRetryAt": "",
          "processing.deadLetteredAt": "",
        },
      },
      { new: true, upsert: true }
    ).lean();
  } catch (err) {
    const claimed = await RiskAssessment.findOne({ auditLogId }).lean();
    const attempts = Number(claimed?.processing?.attempts || 1);
    const deadLettered = attempts >= config.maxAttempts;
    const errorMessage = String(err?.message || err || "unknown_error").slice(0, 500);
    const nextRetryAt = deadLettered ? null : new Date(now.getTime() + computeRetryDelayMs(attempts, config));

    return RiskAssessment.findOneAndUpdate(
      { auditLogId },
      {
        $set: {
          "processing.status": deadLettered ? "dead_letter" : "failed",
          "processing.lastError": errorMessage,
          "processing.maxAttempts": config.maxAttempts,
          "processing.deadLetteredAt": deadLettered ? new Date() : null,
          "processing.deadLetterReason": deadLettered ? errorMessage : "",
          ...(nextRetryAt ? { "processing.nextRetryAt": nextRetryAt } : {}),
        },
        $unset: {
          "processing.leaseOwner": "",
          "processing.leaseAcquiredAt": "",
          "processing.leaseExpiresAt": "",
          ...(nextRetryAt ? {} : { "processing.nextRetryAt": "" }),
        },
      },
      { new: true }
    ).lean();
  }
};

const scheduleAuditLogRiskProcessing = (auditLog = {}) => {
  if (process.env.RISK_REVIEWER_ENABLED === "false") return;
  setImmediate(() => {
    processAuditLogRisk(auditLog).catch((err) => {
      console.warn("[RISK REVIEWER] processing skipped", err?.message || err);
    });
  });
};

const retryRiskAssessment = async ({ assessmentId, actorKey = "" } = {}) => {
  if (!assessmentId) throw new Error("assessmentId is required");
  const now = new Date();
  const updated = await RiskAssessment.findOneAndUpdate(
    {
      _id: assessmentId,
      "processing.status": { $in: ["failed", "dead_letter"] },
    },
    {
      $set: {
        "processing.status": "pending",
        "processing.lastError": "",
        "processing.lastAttemptAt": now,
        "processing.deadLetterReason": "",
      },
      $unset: {
        "processing.nextRetryAt": "",
        "processing.leaseOwner": "",
        "processing.leaseAcquiredAt": "",
        "processing.leaseExpiresAt": "",
        "processing.deadLetteredAt": "",
      },
    },
    { new: true }
  ).lean();

  if (!updated) {
    const exists = await RiskAssessment.findById(assessmentId).select("processing.status").lean();
    if (!exists) throw new Error("Risk assessment not found");
    throw new Error("retry_not_allowed");
  }

  if (actorKey) {
    console.info("[RISK REVIEWER] assessment retried by actor", actorKey);
  }

  setImmediate(async () => {
    try {
      const auditLog = await AdminAuditLog.findById(updated.auditLogId).lean();
      if (!auditLog) {
        await RiskAssessment.findByIdAndUpdate(assessmentId, {
          $set: {
            "processing.status": "failed",
            "processing.lastError": "audit_log_not_found",
          },
        });
        return;
      }
      await processAuditLogRisk(auditLog);
    } catch (err) {
      await RiskAssessment.findByIdAndUpdate(assessmentId, {
        $set: {
          "processing.status": "failed",
          "processing.lastError": String(err?.message || err || "retry_processing_error").slice(0, 500),
        },
      });
    }
  });

  return updated;
};

module.exports = {
  processAuditLogRisk,
  scheduleAuditLogRiskProcessing,
  retryRiskAssessment,
};
