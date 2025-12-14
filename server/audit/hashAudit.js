const User = require("../models/User");
const Workshop = require("../models/Workshop");
const { hashId } = require("../utils/hashId");

function getSampleSize() {
  const raw = Number(process.env.HASH_AUDIT_SAMPLE_SIZE || 20);
  if (!Number.isFinite(raw) || raw <= 0) return 20;
  return raw;
}

function logSummary(kind, details) {
  console.log(`[AUDIT][HASH] ${kind}:`, details);
}

function logWarning(message, details) {
  console.warn(`[AUDIT][HASH][WARN] ${message}`, details || "");
}

function stringifyId(id) {
  if (!id) return "";
  return id.toString();
}

async function auditHashConsistency() {
  const sampleSize = getSampleSize();
  const mismatches = [];
  let checked = 0;

  try {
    const users = await User.find({})
      .select("_id entityKey hashedId familyMembers._id familyMembers.entityKey")
      .limit(sampleSize)
      .lean();

    for (const user of users) {
      const expectedUserHash = hashId("user", stringifyId(user._id));
      const storedUserHashes = {
        entityKey: user.entityKey,
        hashedId: user.hashedId,
      };

      if (storedUserHashes.entityKey && storedUserHashes.entityKey !== expectedUserHash) {
        mismatches.push({
          model: "User",
          _id: user._id,
          field: "entityKey",
          stored: storedUserHashes.entityKey,
          computed: expectedUserHash,
        });
      }

      if (storedUserHashes.hashedId && storedUserHashes.hashedId !== expectedUserHash) {
        mismatches.push({
          model: "User",
          _id: user._id,
          field: "hashedId",
          stored: storedUserHashes.hashedId,
          computed: expectedUserHash,
        });
      }

      checked++;

      (user.familyMembers || []).forEach((member) => {
        const expectedFamilyHash = hashId("family", stringifyId(member._id));
        const stored = member.entityKey;
        if (stored && stored !== expectedFamilyHash) {
          mismatches.push({
            model: "FamilyMember",
            parentId: user._id,
            _id: member._id,
            field: "entityKey",
            stored,
            computed: expectedFamilyHash,
          });
        }
        checked++;
      });
    }

    const workshops = await Workshop.find({})
      .select("_id hashedId")
      .limit(sampleSize)
      .lean();

    for (const workshop of workshops) {
      const expectedWorkshopHash = hashId("workshop", stringifyId(workshop._id));
      const stored = workshop.hashedId;
      if (stored && stored !== expectedWorkshopHash) {
        mismatches.push({
          model: "Workshop",
          _id: workshop._id,
          field: "hashedId",
          stored,
          computed: expectedWorkshopHash,
        });
      }
      checked++;
    }
  } catch (err) {
    logWarning("hash consistency audit failed", err.message || err);
    return { checked, mismatches: mismatches.length, details: mismatches, error: err.message };
  }

  mismatches.forEach((m) => logWarning("hash mismatch detected", m));
  logSummary("consistency", { checked, mismatches: mismatches.length });

  return { checked, mismatches: mismatches.length, details: mismatches };
}

async function auditHashQueryability() {
  const sampleSize = getSampleSize();
  const failures = [];
  let checked = 0;

  try {
    const users = await User.find({})
      .select("_id entityKey hashedId familyMembers.entityKey familyMembers._id")
      .limit(sampleSize)
      .lean();

    for (const user of users) {
      const stored = user.entityKey || user.hashedId;
      if (stored) {
        checked++;
        const resolved = await User.findOne({ entityKey: stored }).select("_id").lean();
        if (!resolved) {
          failures.push({
            model: "User",
            entityKey: stored,
            reason: "Hash query did not resolve document",
          });
        }
      } else {
        failures.push({ model: "User", _id: user._id, reason: "Missing hashed identifier" });
      }

      for (const member of user.familyMembers || []) {
        const storedMember = member.entityKey;
        if (storedMember) {
          checked++;
          const resolved = await User.findOne({ "familyMembers.entityKey": storedMember })
            .select("_id")
            .lean();
          if (!resolved) {
            failures.push({
              model: "FamilyMember",
              entityKey: storedMember,
              reason: "Hash query did not resolve document",
            });
          }
        } else {
          failures.push({
            model: "FamilyMember",
            parentId: user._id,
            reason: "Missing hashed identifier",
          });
        }
      }
    }

    const workshops = await Workshop.find({}).select("_id hashedId").limit(sampleSize).lean();
    for (const workshop of workshops) {
      const stored = workshop.hashedId;
      if (stored) {
        checked++;
        const resolved = await Workshop.findOne({ hashedId: stored }).select("_id").lean();
        if (!resolved) {
          failures.push({
            model: "Workshop",
            entityKey: stored,
            reason: "Hash query did not resolve document",
          });
        }
      } else {
        failures.push({ model: "Workshop", _id: workshop._id, reason: "Missing hashed identifier" });
      }
    }
  } catch (err) {
    logWarning("hash queryability audit failed", err.message || err);
    return { checked, failures: failures.length, details: failures, error: err.message };
  }

  failures.forEach((f) => logWarning("hash query failed", f));
  logSummary("queryability", { checked, failures: failures.length });

  return { checked, failures: failures.length, details: failures };
}

async function auditHashSecretDrift() {
  const sampleSize = getSampleSize();
  let comparisons = 0;
  let mismatches = 0;
  const mismatchedExamples = [];

  try {
    const users = await User.find({})
      .select("_id entityKey hashedId familyMembers.entityKey familyMembers._id")
      .limit(sampleSize)
      .lean();

    for (const user of users) {
      const expectedUserHash = hashId("user", stringifyId(user._id));
      if (user.entityKey) {
        comparisons++;
        if (user.entityKey !== expectedUserHash) {
          mismatches++;
          mismatchedExamples.push({ model: "User", _id: user._id, field: "entityKey" });
        }
      }
      if (user.hashedId) {
        comparisons++;
        if (user.hashedId !== expectedUserHash) {
          mismatches++;
          mismatchedExamples.push({ model: "User", _id: user._id, field: "hashedId" });
        }
      }

      for (const member of user.familyMembers || []) {
        if (!member.entityKey) continue;
        const expectedFamilyHash = hashId("family", stringifyId(member._id));
        comparisons++;
        if (member.entityKey !== expectedFamilyHash) {
          mismatches++;
          mismatchedExamples.push({
            model: "FamilyMember",
            parentId: user._id,
            _id: member._id,
            field: "entityKey",
          });
        }
      }
    }

    const workshops = await Workshop.find({}).select("_id hashedId").limit(sampleSize).lean();
    for (const workshop of workshops) {
      if (!workshop.hashedId) continue;
      const expectedWorkshopHash = hashId("workshop", stringifyId(workshop._id));
      comparisons++;
      if (workshop.hashedId !== expectedWorkshopHash) {
        mismatches++;
        mismatchedExamples.push({ model: "Workshop", _id: workshop._id, field: "hashedId" });
      }
    }
  } catch (err) {
    logWarning("hash secret drift audit failed", err.message || err);
    return { comparisons, mismatches, error: err.message };
  }

  const mismatchRate = comparisons === 0 ? 0 : mismatches / comparisons;
  if (mismatchRate > 0) {
    logWarning(
      `possible secret drift detected (mismatches=${mismatches}, comparisons=${comparisons})`,
      {
        mismatchRate,
        examples: mismatchedExamples.slice(0, 5),
        recommendation:
          "Possible PUBLIC_ID_SECRET or hashing logic drift detected. Do NOT rotate secrets without migration.",
      }
    );
  } else {
    logSummary("secret-drift", { status: "OK", comparisons });
  }

  return { comparisons, mismatches, mismatchRate, examples: mismatchedExamples.slice(0, 20) };
}

async function runAllHashAudits() {
  const results = {};
  results.consistency = await auditHashConsistency();
  results.queryability = await auditHashQueryability();
  results.secretDrift = await auditHashSecretDrift();
  return results;
}

module.exports = {
  auditHashConsistency,
  auditHashQueryability,
  auditHashSecretDrift,
  runAllHashAudits,
};
