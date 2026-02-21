// server/services/auditService.js
// Lightweight integrity audit service to spot suspicious payloads that
// may have bypassed validation (e.g., JSON fragments in name fields).

const User = require("../models/User");
const Workshop = require("../models/Workshop");
const { runWorkshopAudit } = require("./workshopAuditService");
const { logIntegrityMismatch } = require("./SecurityEventLogger");
const { runSecurityInsightAggregation } = require("./SecurityInsightService");
const { recordAuditSuiteRun } = require("./ObservabilityMetricsService");

const SUSPICIOUS_NAME_REGEX = /[{}<>$[\]]/;
const LEADING_TRAILING_WHITESPACE = /^\s|\s$/;
const DOUBLE_SPACE = /\s{2,}/;

const MIN_AUDIT_INTERVAL_MS = 5 * 60 * 1000;

let auditTimer = null;
let userAuditInFlight = false;
let lastUserAuditResult = null;
let lastUserAuditError = null;
let lastUserRunAt = 0;
let workshopAuditInFlight = false;
let lastWorkshopAudit = null;
let lastWorkshopRunAt = 0;
let lastAuditSuite = null;

/* ============================================================
   Helpers
   ============================================================ */
function normalizeDisplay(value = "") {
  return String(value).trim().replace(/\s{2,}/g, " ");
}

function summarizeBucket(list = [], limit = 50) {
  return list.slice(0, limit);
}

/* ============================================================
   Existing queries (UNCHANGED)
   ============================================================ */
async function querySuspiciousNames() {
  const cursor = User.find({
    $or: [
      { name: { $regex: SUSPICIOUS_NAME_REGEX } },
      { name: { $regex: LEADING_TRAILING_WHITESPACE } },
      { name: { $regex: DOUBLE_SPACE } },
      { "familyMembers.name": { $regex: SUSPICIOUS_NAME_REGEX } },
    ],
  })
    .select("name email phone city familyMembers updatedAt createdAt")
    .limit(150)
    .lean();

  const docs = await cursor;
  return docs.map((doc) => ({
    id: doc._id,
    name: doc.name,
    normalizedName: normalizeDisplay(doc.name),
    email: doc.email,
    phone: doc.phone,
    city: doc.city,
    hasFamilyWithSuspiciousName: (doc.familyMembers || []).some((m) =>
      SUSPICIOUS_NAME_REGEX.test(String(m.name || ""))
    ),
  }));
}

async function queryMissingContacts() {
  const cursor = User.find({
    $or: [{ email: { $in: [null, ""] } }, { phone: { $in: [null, ""] } }],
  })
    .select("name email phone city")
    .limit(150)
    .lean();

  const docs = await cursor;
  return docs.map((doc) => ({
    id: doc._id,
    name: doc.name,
    email: doc.email,
    phone: doc.phone,
    city: doc.city,
  }));
}

async function queryInvalidRoles() {
  const cursor = User.find({ role: { $nin: ["user", "admin"] } })
    .select("name email role")
    .limit(50)
    .lean();

  const docs = await cursor;
  return docs.map((doc) => ({
    id: doc._id,
    email: doc.email,
    role: doc.role,
  }));
}

/* ============================================================
   FIXED: integrity hash mismatches (self-healing)
   ============================================================ */
async function queryIntegrityHashMismatches({ limit = 150, fix = false } = {}) {
  const users = await User.find({})
    .select("email role idNumber roleIntegrityHash idNumberHash")
    .limit(limit);

  const results = [];

  for (const user of users) {
    let touched = false;
    let roleIssue = null;
    let idIssue = null;

    if (user.role) {
      const expected = User.computeRoleHash(user._id, user.role);
      if (!user.roleIntegrityHash || user.roleIntegrityHash !== expected) {
        roleIssue = { expected, actual: user.roleIntegrityHash || null };
        if (fix) {
          user.roleIntegrityHash = expected;
          touched = true;
        }
      }
    }

    if (user.idNumber) {
      const expected = User.computeIdNumberHash(user.idNumber);
      if (!user.idNumberHash || user.idNumberHash !== expected) {
        idIssue = { expected, actual: user.idNumberHash || null };
        if (fix) {
          user.idNumberHash = expected;
          touched = true;
        }
      }
    }

    if (!roleIssue && !idIssue) continue;

    if (fix && touched) {
      await user.save({ validateBeforeSave: false });
    }

    logIntegrityMismatch({
      hasRoleIssue: !!roleIssue,
      hasIdIssue: !!idIssue,
      fixed: Boolean(fix && touched),
    });

    results.push({
      id: user._id,
      email: user.email,
      role: user.role,
      issues: { role: roleIssue, idNumber: idIssue },
      fixed: Boolean(fix && touched),
    });
  }

  return results;
}

/* ============================================================
   Workshop availability (UNCHANGED)
   ============================================================ */
async function auditWorkshopAvailability(limit = 150) {
  const now = new Date();

  const staleAvailability = await Workshop.find({
    available: true,
    endDate: { $lt: now },
  })
    .select("title startDate endDate available hashedId city")
    .limit(limit)
    .lean();

  const missingSchedule = await Workshop.find({
    $or: [{ startDate: { $exists: false } }, { sessionsCount: { $exists: false } }],
  })
    .select("title available hashedId city")
    .limit(limit)
    .lean();

  const missingHashedId = await Workshop.find({ hashedId: { $in: [null, ""] } })
    .select("title startDate city available")
    .limit(limit)
    .lean();

  return {
    counts: {
      staleAvailable: staleAvailability.length,
      missingSchedule: missingSchedule.length,
      missingHashedId: missingHashedId.length,
    },
    buckets: {
      staleAvailable: summarizeBucket(staleAvailability),
      missingSchedule: summarizeBucket(missingSchedule),
      missingHashedId: summarizeBucket(missingHashedId),
    },
  };
}

/* ============================================================
   FIXED: Workshop audit wiring
   ============================================================ */
async function runWorkshopIntegrityAudit({ reason = "manual", force = false, fix = false } = {}) {
  if (workshopAuditInFlight) return lastWorkshopAudit;

  const now = Date.now();
  if (!force && lastWorkshopAudit && now - lastWorkshopRunAt < MIN_AUDIT_INTERVAL_MS) {
    return lastWorkshopAudit;
  }

  workshopAuditInFlight = true;
  try {
    const [integrityFixes, availability] = await Promise.all([
      runWorkshopAudit({ fix }),
      auditWorkshopAvailability(),
    ]);

    const result = {
      checkedAt: new Date(now).toISOString(),
      reason,
      integrity: integrityFixes,
      availability,
    };

    lastWorkshopAudit = result;
    lastWorkshopRunAt = now;

    return result;
  } finally {
    workshopAuditInFlight = false;
  }
}

/* ============================================================
   FIXED: User audit wiring
   ============================================================ */
async function runUserIntegrityAudit({ reason = "manual", force = false, fix = false } = {}) {
  if (userAuditInFlight) return lastUserAuditResult;

  const now = Date.now();
  if (!force && lastUserAuditResult && now - lastUserRunAt < MIN_AUDIT_INTERVAL_MS) {
    return lastUserAuditResult;
  }

  userAuditInFlight = true;
  try {
    const [totalUsers, suspiciousNames, missingContacts, invalidRoles, integrityHashMismatches] =
      await Promise.all([
        User.estimatedDocumentCount(),
        querySuspiciousNames(),
        queryMissingContacts(),
        queryInvalidRoles(),
        queryIntegrityHashMismatches({ fix }),
      ]);

    const summary = {
      suspiciousNameCount: suspiciousNames.length,
      missingContactCount: missingContacts.length,
      invalidRoleCount: invalidRoles.length,
      integrityMismatchCount: integrityHashMismatches.length,
      fixedCount: integrityHashMismatches.filter((x) => x.fixed).length,
    };

    const result = {
      checkedAt: new Date(now).toISOString(),
      reason,
      totals: { users: totalUsers },
      summary,
      buckets: {
        suspiciousNames: summarizeBucket(suspiciousNames),
        missingContacts: summarizeBucket(missingContacts),
        invalidRoles: summarizeBucket(invalidRoles),
        integrityHashMismatches: summarizeBucket(integrityHashMismatches),
      },
    };

    lastUserAuditResult = result;
    lastUserRunAt = now;
    lastUserAuditError = null;

    return result;
  } catch (err) {
    lastUserAuditError = err;
    throw err;
  } finally {
    userAuditInFlight = false;
  }
}

/* ============================================================
   SUITE + SCHEDULER
   ============================================================ */
let lastSecurityInsight = null;

async function runAuditSuite({ reason = "manual", force = false, fix = false } = {}) {
  const startedAt = Date.now();
  try {
    const [userAudit, workshopAudit, securityInsight] = await Promise.all([
      runUserIntegrityAudit({ reason, force, fix }),
      runWorkshopIntegrityAudit({ reason, force, fix }),
      runSecurityInsightAggregation().catch((err) => {
        console.warn("[AUDIT] Security insight aggregation failed:", err?.message || err);
        return null;
      }),
    ]);

    lastSecurityInsight = securityInsight;

    lastAuditSuite = {
      checkedAt: new Date().toISOString(),
      reason,
      userAudit,
      workshopAudit,
      securityInsight,
    };

    recordAuditSuiteRun({
      reason,
      status: "success",
      durationMs: Date.now() - startedAt,
    });

    return lastAuditSuite;
  } catch (err) {
    recordAuditSuiteRun({
      reason,
      status: "failure",
      durationMs: Date.now() - startedAt,
    });
    throw err;
  }
}

function startAuditScheduler({ intervalMs } = {}) {
  if (process.env.NODE_ENV === "test") return;
  if (auditTimer) return;

  const interval =
    typeof intervalMs === "number"
      ? intervalMs
      : Number(process.env.AUDIT_INTERVAL_MS || 30 * 60 * 1000);

  auditTimer = setInterval(() => {
    runAuditSuite({ reason: "scheduled", force: true }).catch(console.error);
  }, interval).unref();

  runAuditSuite({ reason: "startup", force: true }).catch(console.error);
}

module.exports = {
  runUserIntegrityAudit,
  runWorkshopIntegrityAudit,
  runAuditSuite,
  getAuditSnapshot: () => ({
    userAudit: lastUserAuditResult,
    workshopAudit: lastWorkshopAudit,
    securityInsight: lastSecurityInsight,
    suite: lastAuditSuite,
    lastUserAuditError:
      lastUserAuditError?.message || String(lastUserAuditError || ""),
    lastUserRunAt,
    lastWorkshopRunAt,
  }),
  startAuditScheduler,
};
