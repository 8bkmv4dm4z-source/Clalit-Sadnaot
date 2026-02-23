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

const toNonNegativeInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const sanitizeSourceMetadata = (metadata = {}) => {
  if (!metadata || typeof metadata !== "object") return {};
  const normalized = {};
  const takeString = (key) => {
    const value = metadata[key];
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    normalized[key] = trimmed.slice(0, 500);
  };

  ["route", "method", "context", "reason", "guardViolation", "ipHash", "userAgent"].forEach(takeString);

  if (Array.isArray(metadata.strippedFields)) {
    const strippedFields = metadata.strippedFields
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 50);
    if (strippedFields.length) normalized.strippedFields = strippedFields;
  }

  return normalized;
};

const toJitterRatio = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, 1);
};

const getReliabilityConfig = () => ({
  leaseDurationMs: toPositiveInteger(process.env.RISK_REVIEWER_LEASE_MS, 30000),
  retryBaseMs: toPositiveInteger(process.env.RISK_REVIEWER_RETRY_BASE_MS, 1000),
  retryMaxMs: toPositiveInteger(process.env.RISK_REVIEWER_RETRY_MAX_MS, 60000),
  retryJitterRatio: toJitterRatio(process.env.RISK_REVIEWER_RETRY_JITTER_RATIO, 0.2),
  maxAttempts: toPositiveInteger(process.env.RISK_REVIEWER_MAX_ATTEMPTS, 3),
  leaseOwner: String(process.env.RISK_REVIEWER_LEASE_OWNER || FALLBACK_LEASE_OWNER),
});

const getBackfillConfig = () => ({
  enabled: process.env.RISK_REVIEWER_BACKFILL_ENABLED !== "false",
  lookbackHours: toNonNegativeInteger(process.env.RISK_REVIEWER_BACKFILL_HOURS, 72),
  limit: toPositiveInteger(process.env.RISK_REVIEWER_BACKFILL_LIMIT, 500),
  batchSize: toPositiveInteger(process.env.RISK_REVIEWER_BACKFILL_BATCH_SIZE, 25),
  minIntervalMs: toPositiveInteger(process.env.RISK_REVIEWER_BACKFILL_MIN_INTERVAL_MS, 60000),
});

let backfillInFlight = false;
let lastBackfillAt = 0;
let riskReviewerScheduler = null;
const isRiskTraceEnabled = () => process.env.RISK_REVIEWER_TRACE === "true";

const traceRisk = (stage, payload = {}) => {
  if (!isRiskTraceEnabled()) return;
  try {
    console.info(
      "[RISK REVIEWER][TRACE]",
      JSON.stringify({
        at: new Date().toISOString(),
        stage: String(stage || "unknown"),
        ...payload,
      })
    );
  } catch {
    console.info("[RISK REVIEWER][TRACE]", stage);
  }
};

const isManualReviewRequired = (deterministic = {}, aiOverlay = {}) => {
  if (["medium", "high", "immediate"].includes(deterministic.riskLevel)) return true;
  const suggested = aiOverlay?.suggestedActions || [];
  return suggested.some((item) => item?.actionId === "queue_manual_review");
};

const buildSubjectKeyHash = (auditLog) => {
  if (auditLog?.subjectKeyHash) return auditLog.subjectKeyHash;
  return hmacEntityKey(String(auditLog?.subjectKey || ""));
};

const buildProcessingLogEntry = ({ stage, message, level = "info" }) => ({
  at: new Date(),
  stage: String(stage || "unknown"),
  level: String(level || "info"),
  message: String(message || "").slice(0, 500),
});

const buildAssessmentEnvelope = async (auditLog = {}) => {
  const organizationId = String(auditLog?.metadata?.organizationId || "global");
  const auditLogId = String(auditLog?._id || "");

  let calibrationProfile;
  try {
    calibrationProfile = await getOrCreateCalibrationProfile(organizationId);
  } catch (calErr) {
    console.warn("[RISK REVIEWER] calibration profile failed", JSON.stringify({
      auditLogId,
      organizationId,
      error: String(calErr?.message || calErr || "unknown").slice(0, 300),
      code: calErr?.code || null,
    }));
    throw calErr;
  }

  let deterministic;
  try {
    deterministic = scoreAuditEvent(auditLog, { calibrationProfile });
  } catch (scoreErr) {
    console.warn("[RISK REVIEWER] deterministic scoring failed", JSON.stringify({
      auditLogId,
      organizationId,
      error: String(scoreErr?.message || scoreErr || "unknown").slice(0, 300),
    }));
    throw scoreErr;
  }

  let subjectHistory = [];
  try {
    const subjectKeyHash = buildSubjectKeyHash(auditLog);
    const lookbackMs = 72 * 60 * 60 * 1000;
    subjectHistory = await AdminAuditLog.find({
      subjectKeyHash,
      createdAt: { $gte: new Date(Date.now() - lookbackMs) },
    }).sort({ createdAt: -1 }).limit(50).lean();
  } catch (histErr) {
    console.warn("[RISK REVIEWER] subject history lookup failed", String(histErr?.message || histErr || "unknown").slice(0, 300));
  }

  const aiOverlay = buildAIReasoningOverlay({
    deterministic,
    category: String(auditLog?.category || "SECURITY"),
    auditLog,
    subjectHistory,
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
  const baseDelay = config.retryBaseMs * Math.pow(2, exponent);
  const boundedDelay = Math.min(baseDelay, config.retryMaxMs);
  const jitterRatio = Math.max(0, Number(config.retryJitterRatio) || 0);
  if (!jitterRatio) return boundedDelay;

  const jitterMin = Math.max(0, boundedDelay * (1 - jitterRatio));
  const jitterMax = Math.min(config.retryMaxMs, boundedDelay * (1 + jitterRatio));
  if (jitterMax <= jitterMin) return Math.round(jitterMin);

  return Math.round(jitterMin + Math.random() * (jitterMax - jitterMin));
};

const markProcessing = async (auditLog = {}, now = new Date(), config = getReliabilityConfig()) => {
  const auditLogId = toObjectId(auditLog?._id);
  const leaseExpiresAt = new Date(now.getTime() + config.leaseDurationMs);
  const claimLog = buildProcessingLogEntry({
    stage: "claim",
    message: `Lease acquired by ${config.leaseOwner}`,
  });
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
        sourceMetadata: sanitizeSourceMetadata(auditLog?.metadata),
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
      $push: {
        "processing.logs": {
          $each: [claimLog],
          $slice: -40,
        },
      },
      $unset: {
        "processing.nextRetryAt": "",
      },
    },
    { new: true, upsert: true }
  ).lean();
};

const processAuditLogRisk = async (auditLog = {}) => {
  const auditLogId = toObjectId(auditLog?._id);
  if (!auditLogId) {
    traceRisk("skip_missing_audit_log_id");
    return { outcome: "skipped_no_id", assessment: null };
  }
  const config = getReliabilityConfig();
  const now = new Date();
  traceRisk("process_start", {
    auditLogId: String(auditLogId),
    eventType: String(auditLog?.eventType || ""),
    category: String(auditLog?.category || ""),
  });

  const existing = await RiskAssessment.findOne({ auditLogId }).lean();
  if (["completed", "dead_letter"].includes(existing?.processing?.status)) {
    traceRisk("skip_terminal_status", {
      auditLogId: String(auditLogId),
      status: String(existing?.processing?.status || ""),
    });
    return { outcome: "skipped_terminal", assessment: existing };
  }
  if (hasActiveLease(existing, now)) {
    traceRisk("skip_active_lease", {
      auditLogId: String(auditLogId),
      leaseExpiresAt: existing?.processing?.leaseExpiresAt || null,
    });
    return { outcome: "skipped_lease", assessment: existing };
  }
  if (isRetryPending(existing, now)) {
    traceRisk("skip_retry_pending", {
      auditLogId: String(auditLogId),
      nextRetryAt: existing?.processing?.nextRetryAt || null,
    });
    return { outcome: "skipped_retry", assessment: existing };
  }

  try {
    let claim;
    try {
      claim = await markProcessing(auditLog, now, config);
    } catch (claimErr) {
      if (Number(claimErr?.code) === 11000) {
        const contentionDoc = await RiskAssessment.findOne({ auditLogId }).lean();
        return { outcome: "skipped_contention", assessment: contentionDoc };
      }
      throw claimErr;
    }

    if (!claim) {
      traceRisk("claim_not_acquired", { auditLogId: String(auditLogId) });
      const lostDoc = await RiskAssessment.findOne({ auditLogId }).lean();
      return { outcome: "skipped_claim_lost", assessment: lostDoc };
    }
    traceRisk("claim_acquired", {
      auditLogId: String(auditLogId),
      attempts: Number(claim?.processing?.attempts || 0),
    });

    const envelope = await buildAssessmentEnvelope(auditLog);
    const contributionCount = Array.isArray(envelope?.deterministic?.contributions)
      ? envelope.deterministic.contributions.length
      : 0;
    const completedLog = buildProcessingLogEntry({
      stage: "completed",
      message: `Deterministic scoring complete: ${envelope.deterministic.score}/100 (${envelope.deterministic.riskLevel}), contributions=${contributionCount}`,
    });
    traceRisk("score_computed", {
      auditLogId: String(auditLogId),
      score: Number(envelope?.deterministic?.score || 0),
      riskLevel: String(envelope?.deterministic?.riskLevel || ""),
      contributionCount,
    });

    const completionUpdate = {
      $set: {
        organizationId: envelope.organizationId,
        eventType: String(auditLog?.eventType || "security"),
        category: String(auditLog?.category || "SECURITY"),
        severity: String(auditLog?.severity || "info"),
        subjectType: String(auditLog?.subjectType || "system"),
        subjectKey: String(auditLog?.subjectKey || "system"),
        subjectKeyHash: buildSubjectKeyHash(auditLog),
        sourceMetadata: sanitizeSourceMetadata(auditLog?.metadata),
        deterministic: envelope.deterministic,
        aiOverlay: envelope.aiOverlay,
        final: envelope.final,
        calibration: envelope.calibration,
        "processing.status": "completed",
        "processing.processedAt": new Date(),
        "processing.lastError": "",
        "processing.deadLetterReason": "",
      },
      $push: {
        "processing.logs": {
          $each: [completedLog],
          $slice: -40,
        },
      },
      $unset: {
        "processing.leaseOwner": "",
        "processing.leaseAcquiredAt": "",
        "processing.leaseExpiresAt": "",
        "processing.nextRetryAt": "",
        "processing.deadLetteredAt": "",
      },
    };

    let completed;
    try {
      completed = await RiskAssessment.findOneAndUpdate(
        { auditLogId },
        completionUpdate,
        { new: true, upsert: true }
      ).lean();
    } catch (completionErr) {
      if (Number(completionErr?.code) === 11000) {
        completed = await RiskAssessment.findOneAndUpdate(
          { auditLogId },
          completionUpdate,
          { new: true }
        ).lean();
      }
      if (!completed) throw completionErr;
    }
    traceRisk("assessment_completed", {
      auditLogId: String(auditLogId),
      status: String(completed?.processing?.status || ""),
      score: Number(completed?.final?.score || 0),
    });
    console.info(
      "[RISK REVIEWER] scored",
      JSON.stringify({
        auditLogId: String(auditLogId),
        score: Number(completed?.final?.score || 0),
        riskLevel: String(completed?.final?.riskLevel || ""),
      })
    );
    return { outcome: "scored", assessment: completed };
  } catch (err) {
    const claimed = await RiskAssessment.findOne({ auditLogId }).lean();
    const attempts = Number(claimed?.processing?.attempts || 1);
    const deadLettered = attempts >= config.maxAttempts;
    const errorMessage = String(err?.message || err || "unknown_error").slice(0, 500);
    const nextRetryAt = deadLettered ? null : new Date(now.getTime() + computeRetryDelayMs(attempts, config));
    const failedLog = buildProcessingLogEntry({
      stage: deadLettered ? "dead_letter" : "failed",
      level: "error",
      message: errorMessage,
    });
    console.warn("[RISK REVIEWER] event failed", JSON.stringify({
      auditLogId: String(auditLogId),
      attempts,
      deadLettered,
      error: errorMessage,
    }));
    traceRisk("assessment_error", {
      auditLogId: String(auditLogId),
      deadLettered,
      attempts,
      error: errorMessage,
    });

    const failedDoc = await RiskAssessment.findOneAndUpdate(
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
        $push: {
          "processing.logs": {
            $each: [failedLog],
            $slice: -40,
          },
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
    return { outcome: "failed", assessment: failedDoc };
  }
};

const scheduleAuditLogRiskProcessing = (auditLog = {}) => {
  if (process.env.RISK_REVIEWER_ENABLED === "false") {
    traceRisk("schedule_skip_disabled", {
      auditLogId: auditLog?._id ? String(auditLog._id) : "",
      eventType: String(auditLog?.eventType || ""),
    });
    return;
  }
  traceRisk("schedule_enqueue", {
    auditLogId: auditLog?._id ? String(auditLog._id) : "",
    eventType: String(auditLog?.eventType || ""),
    category: String(auditLog?.category || ""),
  });
  setImmediate(() => {
    processAuditLogRisk(auditLog).catch((err) => {
      traceRisk("schedule_execution_error", {
        auditLogId: auditLog?._id ? String(auditLog._id) : "",
        error: String(err?.message || err || "unknown_error").slice(0, 500),
      });
      console.warn("[RISK REVIEWER] processing skipped", err?.message || err);
    });
  });
};

const backfillRiskAssessmentsFromAuditLogs = async ({ reason = "manual" } = {}) => {
  if (process.env.RISK_REVIEWER_ENABLED === "false") {
    traceRisk("backfill_skip_reviewer_disabled", { reason });
    return { skipped: true, reason: "risk_reviewer_disabled" };
  }

  const config = getBackfillConfig();
  if (!config.enabled) {
    traceRisk("backfill_skip_disabled", { reason });
    return { skipped: true, reason: "risk_backfill_disabled" };
  }

  const nowMs = Date.now();
  const since = new Date(nowMs - config.lookbackHours * 60 * 60 * 1000);

  const auditLogs = await AdminAuditLog.find({ createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(config.limit)
    .lean();
  console.info("[RISK REVIEWER] backfill starting", JSON.stringify({
    reason,
    lookbackHours: config.lookbackHours,
    batchSize: config.batchSize,
    considered: auditLogs.length,
    since: since.toISOString(),
  }));
  traceRisk("backfill_start", {
    reason,
    lookbackHours: config.lookbackHours,
    limit: config.limit,
    batchSize: config.batchSize,
    considered: auditLogs.length,
  });

  let scored = 0;
  let skippedItems = 0;
  let failed = 0;
  const outcomeCounts = {};
  const errorSamples = [];
  const MAX_ERROR_SAMPLES = 3;

  for (let idx = 0; idx < auditLogs.length; idx += config.batchSize) {
    const batch = auditLogs.slice(idx, idx + config.batchSize);
    const results = await Promise.allSettled(
      batch.map((auditLog) => processAuditLogRisk(auditLog))
    );
    results.forEach((result, batchIdx) => {
      const eventId = String(batch[batchIdx]?._id || "unknown");
      if (result.status === "fulfilled") {
        const outcome = result.value?.outcome || "unknown";
        outcomeCounts[outcome] = (outcomeCounts[outcome] || 0) + 1;
        if (outcome === "scored") scored += 1;
        else if (outcome === "failed") {
          failed += 1;
          const lastError = result.value?.assessment?.processing?.lastError
            || result.value?.assessment?.processing?.deadLetterReason
            || "";
          const errorStr = String(lastError || "no_assessment_returned").slice(0, 300);
          console.warn("[RISK REVIEWER] backfill event failed", JSON.stringify({
            auditLogId: eventId,
            error: errorStr,
            attempts: result.value?.assessment?.processing?.attempts || 0,
            status: result.value?.assessment?.processing?.status || "unknown",
          }));
          if (errorSamples.length < MAX_ERROR_SAMPLES) {
            errorSamples.push(errorStr);
          }
        } else skippedItems += 1;
      } else {
        failed += 1;
        outcomeCounts.rejected = (outcomeCounts.rejected || 0) + 1;
        const rejectedError = String(result.reason?.message || result.reason || "rejected").slice(0, 500);
        console.warn("[RISK REVIEWER] backfill event rejected", JSON.stringify({
          auditLogId: eventId,
          error: rejectedError,
        }));
        if (errorSamples.length < MAX_ERROR_SAMPLES) {
          errorSamples.push(rejectedError);
        }
      }
    });
  }

  return {
    skipped: false,
    reason,
    lookbackHours: config.lookbackHours,
    considered: auditLogs.length,
    processed: scored,
    scored,
    skippedItems,
    failed,
    outcomeCounts,
    errorSamples,
  };
};

const scheduleRiskBackfillFromAuditLogs = ({ reason = "scheduled" } = {}) => {
  if (backfillInFlight) {
    traceRisk("backfill_schedule_skip_inflight", { reason });
    return false;
  }
  const config = getBackfillConfig();
  const nowMs = Date.now();
  if (!config.enabled) {
    traceRisk("backfill_schedule_skip_disabled", { reason });
    return false;
  }
  if (nowMs - lastBackfillAt < config.minIntervalMs) {
    traceRisk("backfill_schedule_skip_throttled", {
      reason,
      minIntervalMs: config.minIntervalMs,
      elapsedMs: nowMs - lastBackfillAt,
    });
    return false;
  }

  backfillInFlight = true;
  lastBackfillAt = nowMs;
  traceRisk("backfill_schedule_enqueued", { reason });
  setImmediate(() => {
    backfillRiskAssessmentsFromAuditLogs({ reason })
      .then((result) => {
        if (result?.skipped) return;
        console.info(
          "[RISK REVIEWER] backfill finished",
          JSON.stringify({
            reason: result.reason,
            considered: result.considered,
            scored: result.scored,
            skippedItems: result.skippedItems,
            failed: result.failed,
            outcomeCounts: result.outcomeCounts,
            errorSamples: result.errorSamples,
          })
        );
      })
      .catch((err) => {
        console.warn("[RISK REVIEWER] backfill failed", err?.message || err);
      })
      .finally(() => {
        backfillInFlight = false;
      });
  });

  return true;
};

const startRiskReviewerScheduler = () => {
  if (process.env.RISK_REVIEWER_ENABLED === "false") return;
  if (riskReviewerScheduler) return;

  const intervalMs = toPositiveInteger(process.env.RISK_REVIEWER_POLL_INTERVAL_MS, 60000);
  console.info("[RISK REVIEWER] online", JSON.stringify({
    pollIntervalMs: intervalMs,
    leaseMs: toPositiveInteger(process.env.RISK_REVIEWER_LEASE_MS, 30000),
    maxAttempts: toPositiveInteger(process.env.RISK_REVIEWER_MAX_ATTEMPTS, 3),
    backfillEnabled: process.env.RISK_REVIEWER_BACKFILL_ENABLED !== "false",
    backfillBatchSize: toPositiveInteger(process.env.RISK_REVIEWER_BACKFILL_BATCH_SIZE, 25),
    backfillLookbackHours: toNonNegativeInteger(process.env.RISK_REVIEWER_BACKFILL_HOURS, 72),
  }));
  traceRisk("scheduler_start", { intervalMs });
  riskReviewerScheduler = setInterval(() => {
    scheduleRiskBackfillFromAuditLogs({ reason: "scheduler" });
  }, intervalMs);
  riskReviewerScheduler.unref?.();

  scheduleRiskBackfillFromAuditLogs({ reason: "startup_scheduler" });
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

const resetFailedAssessments = async () => {
  const result = await RiskAssessment.updateMany(
    { "processing.status": { $in: ["failed", "dead_letter"] } },
    {
      $set: {
        "processing.status": "pending",
        "processing.attempts": 0,
        "processing.lastError": "",
        "processing.deadLetterReason": "",
      },
      $unset: {
        "processing.nextRetryAt": "",
        "processing.deadLetteredAt": "",
      },
    }
  );
  return { resetCount: Number(result?.modifiedCount || 0) };
};

const isBackfillInFlight = () => backfillInFlight;

module.exports = {
  processAuditLogRisk,
  scheduleAuditLogRiskProcessing,
  backfillRiskAssessmentsFromAuditLogs,
  scheduleRiskBackfillFromAuditLogs,
  startRiskReviewerScheduler,
  retryRiskAssessment,
  resetFailedAssessments,
  isBackfillInFlight,
};
