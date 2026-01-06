// routes/dev.js
const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const User = require("../models/User");

const isNonProduction = process.env.NODE_ENV !== "production";
const devRoutesEnabled = process.env.ENABLE_DEV_ROUTES === "true";

const requireDevSurface = (req, res, next) => {
  if (!isNonProduction || !devRoutesEnabled) {
    console.warn("[DEV ROUTES] Blocked request — dev surface disabled or running in production.");
    return res.status(404).json({ message: "Not found" });
  }
  return next();
};

const requireDevAdminSecret = (req, res, next) => {
  const configuredSecret = process.env.DEV_ADMIN_SECRET;
  if (!configuredSecret) {
    console.warn("[DEV CLEANUP] Missing DEV_ADMIN_SECRET; blocking request");
    return res
      .status(503)
      .json({ message: "Dev admin secret not configured on server" });
  }

  const providedSecret =
    req.headers["x-dev-admin-key"] || req.headers["x-admin-secret"];

  if (providedSecret !== configuredSecret) {
    return res.status(401).json({ message: "Invalid or missing admin secret" });
  }

  return next();
};

const requireDestructiveAccess = (req, res, next) => {
  const destructiveEnabled = process.env.ENABLE_DEV_DESTRUCTIVE === "true";
  if (!destructiveEnabled || !isNonProduction || !devRoutesEnabled) {
    console.warn("[DEV CLEANUP] Destructive dev route blocked by configuration or environment guard.");
    return res.status(403).json({ message: "Dev destructive routes are disabled" });
  }
  return next();
};

const cleanupLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window to avoid brute-force guessing
  limit: 5, // allow a handful of cleanup operations per minute
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many cleanup attempts. Please slow down." },
});

router.use(requireDevSurface);

router.delete("/cleanup-user", cleanupLimiter, requireDevAdminSecret, requireDestructiveAccess, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    const user = await User.findOneAndDelete({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    console.log(`[DEV CLEANUP] Deleted ${email}`);
    res.status(200).json({ message: "Deleted" });
  } catch (err) {
    console.error("[DEV CLEANUP ERROR]", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
