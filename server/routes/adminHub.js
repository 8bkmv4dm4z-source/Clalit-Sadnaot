const express = require("express");
const { authenticate, authorizeAdmin, hasAuthority } = require("../middleware/authMiddleware");
const { requireAdminHubPassword } = require("../middleware/adminPasswordMiddleware");
const adminHubController = require("../controllers/adminHubController");
const { ACCESS_PROOF_HEADER, ACCESS_SCOPE_HEADER } = require("../utils/accessScope");

const router = express.Router();

// Opaque readiness probe for admin UI — reveals nothing to non-admin callers
router.get(
  "/access",
  authenticate,
  (req, res, next) => {
    if (!hasAuthority(req.user, "admin")) return res.status(404).end();
    // P7: admin state is proven only by reachability, not data or headers.
    res.removeHeader(ACCESS_SCOPE_HEADER);
    res.removeHeader(ACCESS_PROOF_HEADER);
    res.setHeader(ACCESS_SCOPE_HEADER, "public");
    return next();
  },
  (_req, res) => res.status(204).end()
);

// GET /api/admin/hub/logs
router.get(
  "/logs",
  authenticate,
  authorizeAdmin,
  requireAdminHubPassword,
  adminHubController.getLogs
);

// GET /api/admin/hub/alerts/maxed-workshops
router.get(
  "/alerts/maxed-workshops",
  authenticate,
  authorizeAdmin,
  requireAdminHubPassword,
  adminHubController.getMaxedWorkshopAlerts
);

// GET /api/admin/hub/stale-users
router.get(
  "/stale-users",
  authenticate,
  authorizeAdmin,
  requireAdminHubPassword,
  adminHubController.getStaleUsers
);

// GET /api/admin/hub/stats (placeholder)
router.get(
  "/stats",
  authenticate,
  authorizeAdmin,
  requireAdminHubPassword,
  adminHubController.getStats
);

module.exports = router;
