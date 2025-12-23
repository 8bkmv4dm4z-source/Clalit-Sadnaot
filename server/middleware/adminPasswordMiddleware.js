const crypto = require("crypto");

/**
 * Enforce secondary admin password for hub endpoints.
 * Uses constant-time comparison to reduce timing attacks.
 */
const requireAdminHubPassword = (req, res, next) => {
  const configuredPassword = process.env.ADMIN_HUB_PASSWORD;
  if (!configuredPassword) {
    // Misconfiguration: fail closed without leaking sensitive data
    return res.status(500).json({ message: "Admin hub password not configured" });
  }

  const providedPassword =
    (typeof req.get === "function" && req.get("x-admin-password")) ||
    req.headers["x-admin-password"];

  if (!providedPassword) {
    return res.status(401).json({ message: "Admin password required" });
  }

  const providedBuffer = Buffer.from(String(providedPassword), "utf8");
  const configuredBuffer = Buffer.from(String(configuredPassword), "utf8");

  if (
    providedBuffer.length !== configuredBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, configuredBuffer)
  ) {
    return res.status(401).json({ message: "Invalid admin password" });
  }

  return next();
};

module.exports = { requireAdminHubPassword };
