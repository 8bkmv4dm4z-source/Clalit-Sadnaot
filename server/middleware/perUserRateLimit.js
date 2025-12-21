const rateLimit = require("express-rate-limit");

const DEFAULTS = {
  windowMs: 15 * 60 * 1000,
  limit: 20,
};

const buildPerUserKey = (req) => {
  const userId = req.user?._id || req.user?.id;
  const email = req.body?.email || req.query?.email;
  const entityKey = req.body?.entityKey || req.body?.familyMemberKey || req.body?.parentKey;
  const fallback = req.ip || "unknown";
  return String(userId || email || entityKey || fallback).toLowerCase();
};

const perUserRateLimit = (options = {}) =>
  rateLimit({
    ...DEFAULTS,
    ...options,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: buildPerUserKey,
    skip: (req) => process.env.NODE_ENV === "loadtest",
    handler: (_req, res) => {
      res.status(429).json({ message: "Too many requests. Please try again later." });
    },
  });

module.exports = {
  perUserRateLimit,
  buildPerUserKey,
};
