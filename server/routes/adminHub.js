const express = require("express");
const { authenticate, authorizeAdmin } = require("../middleware/authMiddleware");
const { requireAdminHubPassword } = require("../middleware/adminPasswordMiddleware");
const adminHubController = require("../controllers/adminHubController");

const router = express.Router();

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
