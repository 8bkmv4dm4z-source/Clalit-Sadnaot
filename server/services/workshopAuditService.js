// server/services/workshopAuditService.js
// -------------------------------------------------------------
// Auto-fix orphan/stale participant references inside Workshops.
// -------------------------------------------------------------

const Workshop = require("../models/Workshop");
const User = require("../models/User");

let lastRun = null;
let lastResult = null;
let auditRunning = false;

// Resolve entityKey from user OR family member
function resolveEntityKey(user, familyMemberId) {
  if (!user) return null;

  if (!familyMemberId) {
    // main user
    return user.entityKey || user._id.toString();
  }

  const fm = (user.familyMembers || []).find(
    (m) => String(m._id) === String(familyMemberId)
  );

  if (!fm) return null;

  return fm.entityKey || fm._id.toString();
}

async function fixWorkshop(w) {
  const issues = [];

  const newParticipants = [];
  const newFamily = [];
  const newWaitlist = [];

  // Build user cache index (stores actual documents, NOT queries)
  const userCache = {};

  async function getUserCached(id) {
    const key = String(id);
    if (userCache[key]) return userCache[key];

    // FIXED: execute the query *before* caching
    const user = await User.findById(id).lean();
    userCache[key] = user || null;
    return userCache[key];
  }

  // -----------------------------
  // 1) Fix participants
  // -----------------------------
  for (const p of w.participants || []) {
    const uid = String(p);

    const user = await getUserCached(uid);
    if (!user) {
      issues.push(`❌ Orphan participant removed: user=${uid}`);
      continue;
    }

    const entityKey = resolveEntityKey(user, null);

    if (!entityKey) {
      issues.push(`❌ Participant missing entityKey: user=${uid}`);
      continue;
    }

    newParticipants.push(user._id); // normalized: participants hold ObjectId
  }

  // -----------------------------
  // 2) Fix familyRegistrations
  // -----------------------------
  for (const fr of w.familyRegistrations || []) {
    const parentId = fr.parentUser;
    const memberId = fr.familyMemberId;

    const user = await getUserCached(parentId);
    if (!user) {
      issues.push(`❌ Orphan familyRegistration.parentUser removed`);
      continue;
    }

    const parentKey = resolveEntityKey(user, null);
    const familyKey = resolveEntityKey(user, memberId);

    if (!familyKey) {
      issues.push(`❌ Missing familyMember in parent=${parentId}`);
      continue;
    }

    newFamily.push({
      ...fr,
      parentUser: user._id,
      familyMemberId: memberId,
      parentKey,
      familyMemberKey: familyKey,
    });
  }

  // -----------------------------
  // 3) Fix waitlist
  // -----------------------------
  for (const wl of w.waitingList || []) {
    const parentId = wl.parentUser;
    const memberId = wl.familyMemberId;

    const user = await getUserCached(parentId);
    if (!user) {
      issues.push("❌ Orphan waitlist entry removed");
      continue;
    }

    const parentKey = resolveEntityKey(user, null);
    const familyKey = resolveEntityKey(user, memberId);

    if (!parentKey) continue;

    newWaitlist.push({
      ...wl,
      parentUser: user._id,
      familyMemberId: memberId,
      parentKey,
      familyMemberKey: familyKey,
    });
  }

  // -----------------------------
  // Save final workshop
  // -----------------------------
  const beforeCount = w.participantsCount;

  w.participants = newParticipants;
  w.familyRegistrations = newFamily;
  w.waitingList = newWaitlist;

  w.participantsCount = newParticipants.length + newFamily.length;

  await w.save({ validateBeforeSave: false });

  return {
    id: w._id,
    title: w.title,
    beforeCount,
    afterCount: w.participantsCount,
    issues,
  };
}

async function runWorkshopAudit() {
  if (auditRunning) return lastResult;

  auditRunning = true;
  try {
    const workshops = await Workshop.find({}).lean(false);

    const results = [];
    for (const w of workshops) {
      const r = await fixWorkshop(w);
      results.push(r);
    }

    lastRun = new Date();
    lastResult = {
      at: lastRun,
      fixedCount: results.length,
      results,
    };

    return lastResult;
  } catch (err) {
    console.error("❌ Workshop Audit ERROR:", err);
    throw err;
  } finally {
    auditRunning = false;
  }
}

function getWorkshopAuditSnapshot() {
  return {
    lastRun,
    lastResult,
  };
}

module.exports = {
  runWorkshopAudit,
  getWorkshopAuditSnapshot,
};
