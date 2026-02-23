const rateLimit = require("express-rate-limit");
const { logRateLimit } = require("../services/SecurityEventLogger");

const DEFAULTS = {
  windowMs: 15 * 60 * 1000,
  limit: 20,
};

const buildPerUserKey = (req) => {
  // Rate limiting key:
  // Use entityKey for authenticated users (canonical identity).
  // Mongo _id must not be used as an external identity signal.
  const userKey = req.user?.entityKey || req.body?.entityKey || req.body?.familyMemberKey || req.body?.parentKey;
  const email = req.body?.email || req.query?.email;
  const fallback = req.ip || "unknown";
  return String(userKey || email || fallback).toLowerCase();
};

const perUserRateLimit = (options = {}) =>
  rateLimit({
    ...DEFAULTS,
    ...options,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: buildPerUserKey,
    skip: () => process.env.NODE_ENV === "loadtest",
    handler: (req, res) => {
      logRateLimit(req, { limiter: "perUser" });
      res.status(429).json({ message: "Too many requests. Please try again later." });
    },
  });

module.exports = {
  perUserRateLimit,
  buildPerUserKey,
};
