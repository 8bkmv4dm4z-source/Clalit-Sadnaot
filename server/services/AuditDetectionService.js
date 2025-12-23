const Workshop = require("../models/Workshop");
const User = require("../models/User");

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const detectMaxedWorkshops = async ({ batchSize = 200, now = Date.now() } = {}) => {
  const cutoff = new Date(now - ONE_DAY_MS);
  const results = [];
  let lastUpdatedAt = null;

  while (results.length < batchSize) {
    const query = {
      available: true,
      maxParticipants: { $gt: 0 },
      $expr: { $gte: ["$participantsCount", "$maxParticipants"] },
    };
    if (lastUpdatedAt) {
      query.updatedAt = { $lt: lastUpdatedAt };
    }

    const batch = await Workshop.find(query)
      .select("workshopKey hashedId participantsCount maxParticipants waitingList updatedAt")
      .sort({ updatedAt: -1 })
      .limit(batchSize - results.length)
      .lean();

    if (!batch.length) break;

    for (const doc of batch) {
      if (doc.updatedAt && doc.updatedAt < cutoff) {
        return results.filter((r) => r.subjectKey);
      }
      results.push({
        subjectKey: doc.workshopKey || doc.hashedId || null,
        participantsCount: doc.participantsCount,
        maxParticipants: doc.maxParticipants,
        waitlistCount: Array.isArray(doc.waitingList) ? doc.waitingList.length : 0,
      });
    }

    lastUpdatedAt = batch[batch.length - 1].updatedAt || lastUpdatedAt;
  }

  return results.filter((r) => r.subjectKey);
};

const detectStaleUsers = async ({ staleDays, batchSize = 500, now = Date.now() } = {}) => {
  const days = Number.isFinite(staleDays) && staleDays > 0 ? staleDays : Number(process.env.STALE_USER_DAYS || 30);
  const cutoff = new Date(now - days * ONE_DAY_MS);
  const results = [];
  let lastUpdatedAt = null;

  while (results.length < batchSize) {
    const query = { updatedAt: { $lte: cutoff } };
    if (lastUpdatedAt) {
      query.updatedAt.$lt = lastUpdatedAt;
    }

    const batch = await User.find(query)
      .select("entityKey hashedId updatedAt")
      .sort({ updatedAt: -1 })
      .limit(batchSize - results.length)
      .lean();

    if (!batch.length) break;

    for (const doc of batch) {
      const subjectKey = doc.entityKey || doc.hashedId || null;
      if (!subjectKey) continue;
      results.push({
        subjectKey,
        lastUpdatedAt: doc.updatedAt,
        staleDays: days,
      });
    }

    lastUpdatedAt = batch[batch.length - 1].updatedAt || lastUpdatedAt;
  }

  return results;
};

module.exports = { detectMaxedWorkshops, detectStaleUsers };
