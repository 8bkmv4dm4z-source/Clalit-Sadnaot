const express = require("express");
const { authenticate, authorizeAdmin, hasAuthority } = require("../middleware/authMiddleware");
const { requireAdminHubPassword } = require("../middleware/adminPasswordMiddleware");
const { perUserRateLimit } = require("../middleware/perUserRateLimit");
const adminHubController = require("../controllers/adminHubController");

// Admin hub is triple-gated (JWT + admin authority + timing-safe password).
// Limit raised from 5 to 40 to accommodate the 4-request initial load plus
// normal browsing (tab switches, refreshes, pagination). Brute-force risk
// is mitigated by the admin authority gate + timing-safe password comparison.
const adminHubLimiter = perUserRateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
});

const router = express.Router();

// Opaque readiness probe for admin UI — reveals nothing to non-admin callers
router.get(
  "/access",
  authenticate,
  (req, res, next) => {
    if (!hasAuthority(req.user, "admin")) return res.status(404).end();
    return next();
  },
  (_req, res) => res.status(204).end()
);

// GET /api/admin/hub/logs
router.get(
  "/logs",
  authenticate,
  authorizeAdmin,
  adminHubLimiter,
  requireAdminHubPassword,
  adminHubController.getLogs
);

// GET /api/admin/hub/alerts/maxed-workshops
router.get(
  "/alerts/maxed-workshops",
  authenticate,
  authorizeAdmin,
  adminHubLimiter,
  requireAdminHubPassword,
  adminHubController.getMaxedWorkshopAlerts
);

// GET /api/admin/hub/stale-users
router.get(
  "/stale-users",
  authenticate,
  authorizeAdmin,
  adminHubLimiter,
  requireAdminHubPassword,
  adminHubController.getStaleUsers
);

// GET /api/admin/hub/stats
router.get(
  "/stats",
  authenticate,
  authorizeAdmin,
  adminHubLimiter,
  requireAdminHubPassword,
  adminHubController.getStats
);

// GET /api/admin/hub/metrics
router.get(
  "/metrics",
  authenticate,
  authorizeAdmin,
  adminHubLimiter,
  requireAdminHubPassword,
  adminHubController.getMetrics
);

module.exports = router;
