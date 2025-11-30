// server/services/auditService.js
// Lightweight integrity audit service to spot suspicious payloads that
// may have bypassed validation (e.g., JSON fragments in name fields).

const User = require("../models/User");
const Workshop = require("../models/Workshop");
const { runWorkshopAudit } = require("./workshopAuditService");

const SUSPICIOUS_NAME_REGEX = /[{}<>\[\]$]/;
const LEADING_TRAILING_WHITESPACE = /^\s|\s$/;
const DOUBLE_SPACE = /\s{2,}/;

const MIN_AUDIT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes between manual calls
let auditTimer = null;
let userAuditInFlight = false;
let lastUserAuditResult = null;
let lastUserAuditError = null;
let lastUserRunAt = 0;
let workshopAuditInFlight = false;
let lastWorkshopAudit = null;
let lastWorkshopRunAt = 0;
let lastAuditSuite = null;

function normalizeDisplay(value = "") {
  const trimmed = String(value).trim().replace(/\s{2,}/g, " ");
  return trimmed;
}

function summarizeBucket(list = [], limit = 50) {
  return list.slice(0, limit);
}

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
    $or: [
      { email: { $in: [null, ""] } },
      { phone: { $in: [null, ""] } },
    ],
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
  return docs.map((doc) => ({ id: doc._id, email: doc.email, role: doc.role }));
}

async function queryMissingIntegrityHashes(limit = 150) {
  const cursor = User.find({
    $or: [
      { roleIntegrityHash: { $in: [null, ""] } },
      { idNumberHash: { $in: [null, ""] } },
    ],
  })
    .select("name email role idNumber roleIntegrityHash idNumberHash")
    .limit(limit)
    .lean();

  const docs = await cursor;
  return docs.map((doc) => ({
    id: doc._id,
    email: doc.email,
    role: doc.role,
    hasRoleHash: Boolean(doc.roleIntegrityHash),
    hasIdNumberHash: Boolean(doc.idNumberHash),
  }));
}

async function queryIntegrityHashMismatches(limit = 150) {
  const docs = await User.find({})
    .select("email role idNumber roleIntegrityHash idNumberHash")
    .limit(limit)
    .lean();

  return docs
    .map((doc) => {
      const roleExpected = User.computeRoleHash(doc._id, doc.role);
      const idExpected = User.computeIdNumberHash(doc.idNumber);

      const roleMismatch =
        Boolean(doc.role && doc.roleIntegrityHash) && doc.roleIntegrityHash !== roleExpected;
      const idMismatch =
        Boolean(doc.idNumber && doc.idNumberHash) && doc.idNumberHash !== idExpected;

      if (!roleMismatch && !idMismatch) return null;

      return {
        id: doc._id,
        email: doc.email,
        role: doc.role,
        issues: {
          role: roleMismatch ? { expected: roleExpected, actual: doc.roleIntegrityHash } : null,
          idNumber: idMismatch ? { expected: idExpected, actual: doc.idNumberHash } : null,
        },
      };
    })
    .filter(Boolean);
}

async function normalizeIntegrityHashes(limit = 200) {
  const users = await User.find({
    $or: [
      { roleIntegrityHash: { $in: [null, ""] } },
      { idNumberHash: { $in: [null, ""] } },
    ],
  })
    .select("role idNumber roleIntegrityHash idNumberHash")
    .limit(limit);

  const normalized = [];

  for (const user of users) {
    try {
      user.refreshIntegrityHashes();
      await user.save({ validateBeforeSave: false });
      normalized.push({ id: user._id, role: user.role, normalized: true });
    } catch (err) {
      normalized.push({ id: user._id, role: user.role, error: err.message });
    }
  }

  return normalized;
}

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

async function runWorkshopIntegrityAudit({ reason = "manual", force = false } = {}) {
  if (workshopAuditInFlight) {
    return lastWorkshopAudit;
  }

  const now = Date.now();
  if (!force && lastWorkshopAudit && now - lastWorkshopRunAt < MIN_AUDIT_INTERVAL_MS) {
    return lastWorkshopAudit;
  }

  workshopAuditInFlight = true;
  try {
    const [integrityFixes, availability] = await Promise.all([
      runWorkshopAudit(),
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

    if (
      availability?.counts?.staleAvailable ||
      availability?.counts?.missingSchedule ||
      availability?.counts?.missingHashedId
    ) {
      console.warn("[AUDIT] workshop anomalies detected", availability.counts);
    }

    return result;
  } catch (err) {
    console.error("[AUDIT] workshop integrity failed", err.message || err);
    throw err;
  } finally {
    workshopAuditInFlight = false;
  }
}

async function runAuditSuite(options = {}) {
  const { reason = "manual", force = false } = options;

  const [userAudit, workshopAudit] = await Promise.all([
    runUserIntegrityAudit({ reason, force }),
    runWorkshopIntegrityAudit({ reason, force }),
  ]);

  lastAuditSuite = {
    checkedAt: new Date().toISOString(),
    reason,
    userAudit,
    workshopAudit,
  };

  return lastAuditSuite;
}

async function runUserIntegrityAudit({ reason = "manual", force = false } = {}) {
  if (userAuditInFlight) {
    return lastUserAuditResult;
  }

  const now = Date.now();
  if (!force && now - lastUserRunAt < MIN_AUDIT_INTERVAL_MS && lastUserAuditResult) {
    return lastUserAuditResult;
  }

  userAuditInFlight = true;
  try {
    const [totalUsers, suspiciousNames, missingContacts, invalidRoles] = await Promise.all([
      User.estimatedDocumentCount(),
      querySuspiciousNames(),
      queryMissingContacts(),
      queryInvalidRoles(),
    ]);

    const [missingIntegrityHashes, integrityHashMismatches, normalizedIntegrityHashes] =
      await Promise.all([
        queryMissingIntegrityHashes(),
        queryIntegrityHashMismatches(),
        normalizeIntegrityHashes(),
      ]);

    const summary = {
      suspiciousNameCount: suspiciousNames.length,
      missingContactCount: missingContacts.length,
      invalidRoleCount: invalidRoles.length,
      missingIntegrityCount: missingIntegrityHashes.length,
      integrityMismatchCount: integrityHashMismatches.length,
      integrityNormalizedCount: normalizedIntegrityHashes.filter((n) => n.normalized).length,
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
        missingIntegrityHashes: summarizeBucket(missingIntegrityHashes),
        integrityHashMismatches: summarizeBucket(integrityHashMismatches),
        normalizedIntegrityHashes: summarizeBucket(normalizedIntegrityHashes),
      },
    };

    lastUserAuditResult = result;
    lastUserAuditError = null;
    lastUserRunAt = now;

    if (
      summary.suspiciousNameCount ||
      summary.invalidRoleCount ||
      summary.missingIntegrityCount ||
      summary.integrityMismatchCount
    ) {
      console.warn("[AUDIT] anomalies detected", summary);
    } else {
      console.log("[AUDIT] clean run", summary);
    }

    return result;
  } catch (err) {
    lastUserAuditError = err;
    console.error("[AUDIT] failed", err.message || err);
    throw err;
  } finally {
    userAuditInFlight = false;
  }
}

function getAuditSnapshot() {
  return {
    userAudit: lastUserAuditResult,
    workshopAudit: lastWorkshopAudit,
    suite: lastAuditSuite,
    lastUserAuditError: lastUserAuditError
      ? lastUserAuditError.message || String(lastUserAuditError)
      : null,
    lastUserRunAt,
    lastWorkshopRunAt,
  };
}

function startAuditScheduler({ intervalMs } = {}) {
  if (process.env.NODE_ENV === "test") return;
  if (auditTimer) return;

  const computedInterval =
    typeof intervalMs === "number" && intervalMs > MIN_AUDIT_INTERVAL_MS
      ? intervalMs
      : Number(process.env.AUDIT_INTERVAL_MS || 30 * 60 * 1000);

  const runScheduledAudit = () => {
    runAuditSuite({ reason: "scheduled", force: true }).catch((err) => {
      console.error("[AUDIT] scheduled run failed", err.message || err);
    });
  };

  auditTimer = setInterval(runScheduledAudit, computedInterval).unref();

  // Fire one audit immediately on startup so stale data is cleaned proactively
  runScheduledAudit();

  console.log(`[AUDIT] scheduler started, interval=${computedInterval}ms`);
}

module.exports = {
  runUserIntegrityAudit,
  runWorkshopIntegrityAudit,
  runAuditSuite,
  getAuditSnapshot,
  startAuditScheduler,
};
