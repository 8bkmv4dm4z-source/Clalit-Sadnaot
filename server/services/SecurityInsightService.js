const AdminAuditLog = require("../models/AdminAuditLog");
const SecurityInsight = require("../models/SecurityInsight");
const { AuditCategories } = require("./AuditEventRegistry");

const toNumber = (val, fallback) => {
  const num = Number(val);
  return Number.isFinite(num) && num > 0 ? num : fallback;
};

const THRESHOLDS = {
  authFailuresPerHour: toNumber(process.env.SECURITY_THRESHOLD_AUTH_FAILURES_HOUR, 20),
  rateLimitsPerDay: toNumber(process.env.SECURITY_THRESHOLD_RATE_LIMITS_DAY, 50),
  csrfPerHour: toNumber(process.env.SECURITY_THRESHOLD_CSRF_HOUR, 5),
  adminPwdPerDay: toNumber(process.env.SECURITY_THRESHOLD_ADMIN_PWD_DAY, 3),
  criticalPerDay: toNumber(process.env.SECURITY_THRESHOLD_CRITICAL_DAY, 1),
};

const buildWarnings = (metrics, thresholds, periodType) => {
  const warnings = [];
  const byType = metrics.byEventType || {};
  const bySev = metrics.bySeverity || {};

  if (periodType === "hourly") {
    const authFailures = (byType["security.auth.failure"] || 0) +
      (byType["security.admin.password.failure"] || 0);
    if (authFailures >= thresholds.authFailuresPerHour) {
      warnings.push({
        code: "HIGH_AUTH_FAILURES",
        message: `${authFailures} auth failures in the last hour`,
        severity: "critical",
        value: authFailures,
        threshold: thresholds.authFailuresPerHour,
      });
    }

    const csrf = byType["security.csrf.failure"] || 0;
    if (csrf >= thresholds.csrfPerHour) {
      warnings.push({
        code: "HIGH_CSRF_FAILURES",
        message: `${csrf} CSRF failures in the last hour`,
        severity: "critical",
        value: csrf,
        threshold: thresholds.csrfPerHour,
      });
    }
  }

  if (periodType === "daily") {
    const rateLimits = byType["security.rate.limit"] || 0;
    if (rateLimits >= thresholds.rateLimitsPerDay) {
      warnings.push({
        code: "HIGH_RATE_LIMITS",
        message: `${rateLimits} rate limit hits in the last 24 hours`,
        severity: "warn",
        value: rateLimits,
        threshold: thresholds.rateLimitsPerDay,
      });
    }

    const adminPwd = byType["security.admin.password.failure"] || 0;
    if (adminPwd >= thresholds.adminPwdPerDay) {
      warnings.push({
        code: "HIGH_ADMIN_PWD_FAILURES",
        message: `${adminPwd} admin password failures in the last 24 hours`,
        severity: "critical",
        value: adminPwd,
        threshold: thresholds.adminPwdPerDay,
      });
    }

    const critical = bySev.critical || 0;
    if (critical >= thresholds.criticalPerDay) {
      warnings.push({
        code: "CRITICAL_EVENTS_DETECTED",
        message: `${critical} critical security events in the last 24 hours`,
        severity: "critical",
        value: critical,
        threshold: thresholds.criticalPerDay,
      });
    }
  }

  return warnings;
};

const runAggregation = async (periodStart, periodEnd) => {
  const pipeline = [
    {
      $match: {
        category: AuditCategories.SECURITY,
        createdAt: { $gte: periodStart, $lt: periodEnd },
      },
    },
    {
      $facet: {
        bySeverity: [
          { $group: { _id: "$severity", count: { $sum: 1 } } },
        ],
        byEventType: [
          { $group: { _id: "$eventType", count: { $sum: 1 } } },
        ],
        topSubjectHashes: [
          { $group: { _id: "$subjectKeyHash", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        total: [{ $count: "count" }],
      },
    },
  ];

  const [result] = await AdminAuditLog.aggregate(pipeline);
  if (!result) {
    return { totalEvents: 0, bySeverity: {}, byEventType: {}, topSubjectHashes: [] };
  }

  const bySeverity = {};
  for (const item of result.bySeverity || []) {
    if (item._id) bySeverity[item._id] = item.count;
  }

  const byEventType = {};
  for (const item of result.byEventType || []) {
    if (item._id) byEventType[item._id] = item.count;
  }

  const topSubjectHashes = (result.topSubjectHashes || []).map((s) => ({
    hash: s._id,
    count: s.count,
  }));

  const totalEvents = result.total?.[0]?.count || 0;

  return { totalEvents, bySeverity, byEventType, topSubjectHashes };
};

const computeHourlyInsight = async () => {
  const now = new Date();
  const periodEnd = new Date(now);
  const periodStart = new Date(now.getTime() - 60 * 60 * 1000);

  const metrics = await runAggregation(periodStart, periodEnd);
  const warnings = buildWarnings(metrics, THRESHOLDS, "hourly");

  const insight = await SecurityInsight.create({
    periodType: "hourly",
    periodStart,
    periodEnd,
    metrics,
    warnings,
  });

  return insight;
};

const computeDailyInsight = async () => {
  const now = new Date();
  const periodEnd = new Date(now);
  const periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const metrics = await runAggregation(periodStart, periodEnd);
  const warnings = buildWarnings(metrics, THRESHOLDS, "daily");

  const insight = await SecurityInsight.create({
    periodType: "daily",
    periodStart,
    periodEnd,
    metrics,
    warnings,
  });

  return insight;
};

const getLatestInsights = async () => {
  const [hourly, daily] = await Promise.all([
    SecurityInsight.findOne({ periodType: "hourly" })
      .sort({ createdAt: -1 })
      .lean(),
    SecurityInsight.findOne({ periodType: "daily" })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const allWarnings = [
    ...(hourly?.warnings || []),
    ...(daily?.warnings || []),
  ];

  const sanitize = (doc) => {
    if (!doc) return null;
    const copy = { ...doc };
    delete copy._id;
    delete copy.__v;
    return copy;
  };

  return {
    hourly: sanitize(hourly),
    daily: sanitize(daily),
    warnings: allWarnings,
  };
};

const runSecurityInsightAggregation = async () => {
  const [hourly, daily] = await Promise.all([
    computeHourlyInsight(),
    computeDailyInsight(),
  ]);
  return { hourly, daily };
};

module.exports = {
  computeHourlyInsight,
  computeDailyInsight,
  getLatestInsights,
  runSecurityInsightAggregation,
};
