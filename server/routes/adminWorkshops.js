const express = require("express");
const { authenticate, authorizeAdmin } = require("../middleware/authMiddleware");
const workshopController = require("../controllers/workshopController");

const router = express.Router();

// GET /api/admin/workshops/invariants
router.get(
  "/invariants",
  authenticate,
  authorizeAdmin,
  workshopController.getWorkshopInvariants
);

module.exports = router;
