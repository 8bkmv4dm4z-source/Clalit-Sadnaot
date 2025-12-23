const User = require("../models/User");

const toPositiveNumberOrDefault = (value, fallback) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
};

const resolveStaleDays = (overrideDays) => {
  if (Number.isFinite(overrideDays) && overrideDays > 0) return overrideDays;
  return toPositiveNumberOrDefault(process.env.STALE_USER_DAYS, 30);
};

const findStaleUsers = async ({ staleDays } = {}) => {
  const days = resolveStaleDays(staleDays);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const users = await User.find({ updatedAt: { $lte: cutoff } })
    .select("entityKey name updatedAt")
    .lean();

  return (users || []).map((u) => ({
    entityKey: u.entityKey,
    name: u.name,
    updatedAt: u.updatedAt,
  }));
};

module.exports = { findStaleUsers, resolveStaleDays };
