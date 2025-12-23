const Workshop = require("../models/Workshop");
const User = require("../models/User");

const getMaxedWorkshops = async () => {
  const maxed = await Workshop.find({
    available: true,
    maxParticipants: { $gt: 0 },
    $expr: { $gte: ["$participantsCount", "$maxParticipants"] },
  })
    .select("title participantsCount maxParticipants workshopKey hashedId")
    .lean();

  return (maxed || []).map((w) => ({
    workshopId: w.workshopKey || w.hashedId || null,
    title: w.title,
    participantsCount: w.participantsCount,
    maxParticipants: w.maxParticipants,
  }));
};

const getStaleUsers = async () => {
  const staleDays = Number(process.env.STALE_USER_DAYS || 30);
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

  const users = await User.find({ updatedAt: { $lte: cutoff } })
    .select("entityKey name updatedAt")
    .lean();

  return (users || []).map((u) => ({
    entityKey: u.entityKey,
    name: u.name,
    updatedAt: u.updatedAt,
  }));
};

module.exports = {
  getMaxedWorkshops,
  getStaleUsers,
};
