const express = require("express");
const { authenticate, authorizeAdmin, hasAuthority } = require("../middleware/authMiddleware");
const { requireAdminHubPassword } = require("../middleware/adminPasswordMiddleware");
const { perUserRateLimit } = require("../middleware/perUserRateLimit");
const adminHubController = require("../controllers/adminHubController");

const adminHubPasswordLimiter = perUserRateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
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
  adminHubPasswordLimiter,
  requireAdminHubPassword,
  adminHubController.getLogs
);

// GET /api/admin/hub/alerts/maxed-workshops
router.get(
  "/alerts/maxed-workshops",
  authenticate,
  authorizeAdmin,
  adminHubPasswordLimiter,
  requireAdminHubPassword,
  adminHubController.getMaxedWorkshopAlerts
);

// GET /api/admin/hub/stale-users
router.get(
  "/stale-users",
  authenticate,
  authorizeAdmin,
  adminHubPasswordLimiter,
  requireAdminHubPassword,
  adminHubController.getStaleUsers
);

// GET /api/admin/hub/stats (placeholder)
router.get(
  "/stats",
  authenticate,
  authorizeAdmin,
  adminHubPasswordLimiter,
  requireAdminHubPassword,
  adminHubController.getStats
);

module.exports = router;
