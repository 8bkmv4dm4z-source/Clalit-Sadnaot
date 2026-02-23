const { queryLogs, sanitizeMetadata } = require("../services/AuditLogService");
const { allowedEventTypes, AuditSeverityLevels, getAuditEventDefinition } = require("../services/AuditEventRegistry");
const {
  getMaxedWorkshops,
  getStaleUsers: fetchStaleUsers,
} = require("../services/AdminHubService");
const { getLatestInsights } = require("../services/SecurityInsightService");
const { renderPrometheusMetrics } = require("../services/ObservabilityMetricsService");
const RiskAssessment = require("../models/RiskAssessment");
const { recordRiskFeedback } = require("../services/risk/RiskCalibrationService");
const { retryRiskAssessment, resetFailedAssessments: resetFailedAssessmentsService, scheduleRiskBackfillFromAuditLogs, isBackfillInFlight } = require("../services/risk/RiskReviewerService");

const ALLOWED_SUBJECT_TYPES = ["user", "familyMember", "workshop", "system"];
const VALID_SEVERITIES = new Set(Object.values(AuditSeverityLevels));
const RISK_QUEUE_STATUSES = ["pending", "processing", "failed", "dead_letter", "completed"];
const RISK_FAILURE_STATUSES = ["failed", "dead_letter"];
const isAdminHubRiskTraceEnabled = () => process.env.ADMIN_HUB_RISK_TRACE === "true";

const parsePositiveInt = (value, { min, max, fallback }) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.max(min, Math.min(Math.trunc(num), max));
  return clamped;
};

const parseIsoDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

/**
 * Identity:
 *   - Relies on upstream admin authorization tied to entityKey authorities.
 * Storage:
 *   - Removes Mongo _id before responding; database lookups stay internal.
 * Notes:
 *   - Sanitizes metadata to avoid leaking identifiers during admin log reads.
 */
const getLogs = async (req, res) => {
  try {
    const { eventType, subjectType, subjectKey, severity, from, to, page, limit, sort } = req.query;

    if (eventType && !allowedEventTypes.includes(eventType)) {
      return res.status(400).json({ message: "Invalid eventType" });
    }
    if (subjectType && !ALLOWED_SUBJECT_TYPES.includes(subjectType)) {
      return res.status(400).json({ message: "Invalid subjectType" });
    }
    if (severity && !VALID_SEVERITIES.has(severity)) {
      return res.status(400).json({ message: "Invalid severity" });
    }

    const parsedFrom = parseIsoDate(from);
    const parsedTo = parseIsoDate(to);
    if ((from && !parsedFrom) || (to && !parsedTo)) {
      return res.status(400).json({ message: "Invalid date range" });
    }

    const safeLimit = parsePositiveInt(limit, { min: 1, max: 100, fallback: 50 });
    const safePage = parsePositiveInt(page, { min: 1, max: 1000, fallback: 1 });

    const sortValue = sort === "createdAt_asc" ? "asc" : -1;

    const logs = await queryLogs({
      eventType,
      subjectType,
      subjectKey,
      severity,
      from: parsedFrom,
      to: parsedTo,
      page: safePage,
      limit: safeLimit,
      sort: sortValue,
    });

    const sanitizedLogs = (logs || []).map((log) => {
      const copy = { ...log };
      delete copy._id;
      delete copy.__v;
      if (copy.metadata) copy.metadata = sanitizeMetadata(copy.metadata);
      if (!copy.category) {
        copy.category = getAuditEventDefinition(copy.eventType)?.category;
      }
      return copy;
    });

    return res.json({ logs: sanitizedLogs });
  } catch (err) {
    console.error("[ADMIN HUB] Failed to fetch logs", err);
    return res.status(500).json({ message: "Failed to fetch logs" });
  }
};

/**
 * Identity:
 *   - Expects admin-scoped callers validated by entityKey-based middleware.
 * Storage:
 *   - Uses Mongo _id only inside AdminHubService queries.
 * Notes:
 *   - Responds with alerts without exposing internal identifiers.
 */
const getMaxedWorkshopAlerts = async (_req, res) => {
  try {
    const alerts = await getMaxedWorkshops();
    return res.json({ alerts });
  } catch (err) {
    console.error("[ADMIN HUB] Failed to fetch maxed workshops", err);
    return res.status(500).json({ message: "Failed to fetch alerts" });
  }
};

/**
 * Identity:
 *   - Admin access enforced upstream via entityKey/authority checks.
 * Storage:
 *   - Pulls stale user data by _id internally without returning it.
 * Notes:
 *   - Outputs sanitized stale user summaries only.
 */
const getStaleUsers = async (_req, res) => {
  try {
    const staleUsers = await fetchStaleUsers();
    return res.json({ staleUsers });
  } catch (err) {
    console.error("[ADMIN HUB] Failed to fetch stale users", err);
    return res.status(500).json({ message: "Failed to fetch stale users" });
  }
};

const getStats = async (_req, res) => {
  try {
    const { hourly, daily, warnings } = await getLatestInsights();
    return res.json({
      hourly,
      daily,
      warnings,
      hourlyPeriod: hourly
        ? { start: hourly.periodStart, end: hourly.periodEnd }
        : null,
      dailyPeriod: daily
        ? { start: daily.periodStart, end: daily.periodEnd }
        : null,
    });
  } catch (err) {
    console.error("[ADMIN HUB] Failed to fetch stats", err);
    return res.status(500).json({ message: "Failed to fetch stats" });
  }
};

const getMetrics = async (_req, res) => {
  try {
    const body = renderPrometheusMetrics();
    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return res.status(200).send(body);
  } catch (err) {
    console.error("[ADMIN HUB] Failed to export metrics", err);
    return res.status(500).json({ message: "Failed to export metrics" });
  }
};

const getRiskAssessments = async (req, res) => {
  try {
    const { status, eventType, category, page, limit, includeFailures } = req.query;
    if (status && !RISK_QUEUE_STATUSES.includes(String(status))) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const includeFailuresInResponse = ["1", "true", "yes"].includes(String(includeFailures || "").toLowerCase());
    const safeLimit = parsePositiveInt(limit, { min: 1, max: 100, fallback: 20 });
    const safePage = parsePositiveInt(page, { min: 1, max: 1000, fallback: 1 });
    const skip = (safePage - 1) * safeLimit;

    const summaryFilters = {};
    if (eventType) summaryFilters.eventType = eventType;
    if (category) summaryFilters.category = category;

    const filters = { ...summaryFilters };
    if (status) filters["processing.status"] = status;

    const rowsPromise = RiskAssessment.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean();
    const queueSummaryPromise = RiskAssessment.aggregate([
      { $match: summaryFilters },
      { $group: { _id: "$processing.status", count: { $sum: 1 } } },
    ]);

    const failuresPromise = includeFailuresInResponse
      ? RiskAssessment.find({
          ...summaryFilters,
          "processing.status": { $in: RISK_FAILURE_STATUSES },
        })
          .sort({ updatedAt: -1, createdAt: -1 })
          .skip(skip)
          .limit(safeLimit)
          .lean()
      : Promise.resolve([]);

    const [rows, queueSummaryRows, failureRows] = await Promise.all([rowsPromise, queueSummaryPromise, failuresPromise]);

    const assessments = (rows || []).map((row) => {
      const copy = { ...row };
      copy.assessmentId = String(row?._id || "");
      delete copy._id;
      delete copy.__v;
      delete copy.subjectKeyHash;
      return copy;
    });

    const queueSummary = RISK_QUEUE_STATUSES.reduce((acc, currentStatus) => {
      acc[currentStatus] = 0;
      return acc;
    }, {});

    (queueSummaryRows || []).forEach((entry) => {
      const queueStatus = String(entry?._id || "");
      if (!RISK_QUEUE_STATUSES.includes(queueStatus)) return;
      queueSummary[queueStatus] = Number(entry?.count || 0);
    });

    const hasAnyQueueData =
      assessments.length > 0 || Object.values(queueSummary).some((count) => Number(count || 0) > 0);
    const backfillTriggered = !!scheduleRiskBackfillFromAuditLogs({
      reason: hasAnyQueueData ? "admin_hub_poll" : "admin_hub_empty_queue",
    });
    if (isAdminHubRiskTraceEnabled()) {
      console.info(
        "[ADMIN HUB][RISK TRACE]",
        JSON.stringify({
          at: new Date().toISOString(),
          route: "GET /api/admin/hub/risk-assessments",
          request: {
            status: status || "",
            eventType: eventType || "",
            category: category || "",
            includeFailuresInResponse,
            page: safePage,
            limit: safeLimit,
          },
          response: {
            assessmentsCount: assessments.length,
            failuresCount: includeFailuresInResponse ? (failureRows || []).length : undefined,
            queueSummary,
            hasAnyQueueData,
            backfillTriggered,
          },
        })
      );
    }

    const failures = includeFailuresInResponse
      ? (failureRows || []).map((row) => {
          const copy = { ...row };
          copy.assessmentId = String(row?._id || "");
          delete copy._id;
          delete copy.__v;
          delete copy.subjectKeyHash;
          return copy;
        })
      : undefined;

    return res.json({
      assessments,
      page: safePage,
      limit: safeLimit,
      queueSummary,
      backfillTriggered,
      backfillInFlight: isBackfillInFlight(),
      ...(includeFailuresInResponse ? { failures } : {}),
    });
  } catch (err) {
    console.error("[ADMIN HUB] Failed to fetch risk assessments", err);
    return res.status(500).json({ message: "Failed to fetch risk assessments" });
  }
};

const getRiskAssessmentFailures = async (req, res) => {
  try {
    const { eventType, category, page, limit } = req.query;
    const safeLimit = parsePositiveInt(limit, { min: 1, max: 100, fallback: 20 });
    const safePage = parsePositiveInt(page, { min: 1, max: 1000, fallback: 1 });
    const skip = (safePage - 1) * safeLimit;

    const filters = {
      "processing.status": { $in: RISK_FAILURE_STATUSES },
    };
    if (eventType) filters.eventType = eventType;
    if (category) filters.category = category;

    const rows = await RiskAssessment.find(filters)
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean();

    const failures = (rows || []).map((row) => {
      const copy = { ...row };
      copy.assessmentId = String(row?._id || "");
      delete copy._id;
      delete copy.__v;
      delete copy.subjectKeyHash;
      return copy;
    });

    return res.json({ failures, page: safePage, limit: safeLimit });
  } catch (err) {
    console.error("[ADMIN HUB] Failed to fetch failed assessments", err);
    return res.status(500).json({ message: "Failed to fetch failed assessments" });
  }
};

const submitRiskFeedback = async (req, res) => {
  try {
    const assessmentId = String(req.params.assessmentId || "").trim();
    const feedbackType = String(req.body?.feedbackType || "").trim();
    const notes = String(req.body?.notes || "");
    const actionId = String(req.body?.actionId || "");
    const organizationId = req.body?.organizationId;

    if (!assessmentId || !feedbackType) {
      return res.status(400).json({ message: "assessmentId and feedbackType are required" });
    }

    const actorKey = req.user?.entityKey || "";
    const result = await recordRiskFeedback({
      assessmentId,
      feedbackType,
      actorKey,
      organizationId,
      notes,
      actionId,
    });

    return res.status(201).json(result);
  } catch (err) {
    if (String(err?.message || "").includes("not found")) {
      return res.status(404).json({ message: "Risk assessment not found" });
    }
    if (String(err?.message || "").includes("organizationId mismatch")) {
      return res.status(400).json({ message: "organizationId does not match assessment" });
    }
    if (String(err?.message || "").includes("invalid feedbackType")) {
      return res.status(400).json({ message: "Invalid feedbackType" });
    }
    console.error("[ADMIN HUB] Failed to submit risk feedback", err);
    return res.status(500).json({ message: "Failed to submit risk feedback" });
  }
};

const retryAssessment = async (req, res) => {
  try {
    const assessmentId = String(req.params.assessmentId || "").trim();
    if (!assessmentId) {
      return res.status(400).json({ message: "assessmentId is required" });
    }

    const actorKey = req.user?.entityKey || "";
    const updated = await retryRiskAssessment({ assessmentId, actorKey });
    const response = { ...updated };
    response.assessmentId = String(updated?._id || "");
    delete response._id;
    delete response.__v;
    delete response.subjectKeyHash;

    return res.status(200).json({ assessment: response });
  } catch (err) {
    if (String(err?.message || "").includes("not found")) {
      return res.status(404).json({ message: "Risk assessment not found" });
    }
    if (String(err?.message || "").includes("retry_not_allowed")) {
      return res.status(409).json({ message: "Assessment is not in retryable status" });
    }
    console.error("[ADMIN HUB] Failed to retry assessment", err);
    return res.status(500).json({ message: "Failed to retry assessment" });
  }
};

const resetFailedAssessments = async (_req, res) => {
  try {
    const result = await resetFailedAssessmentsService();
    return res.status(200).json(result);
  } catch (err) {
    console.error("[ADMIN HUB] Failed to reset failed assessments", err);
    return res.status(500).json({ message: "Failed to reset failed assessments" });
  }
};

module.exports = {
  getLogs,
  getMaxedWorkshopAlerts,
  getStaleUsers,
  getStats,
  getMetrics,
  getRiskAssessments,
  getRiskAssessmentFailures,
  submitRiskFeedback,
  retryAssessment,
  resetFailedAssessments,
};
