// server/routes/workshops.js — FIXED & COMPLETE
const express = require("express");
const router = express.Router();
const { runWorkshopAudit } = require("../services/workshopAuditService");
const { perUserRateLimit } = require("../middleware/perUserRateLimit");

const {
  authenticate: protect,
  authorizeAdmin,
} = require("../middleware/authMiddleware");
const { csrfProtection } = require("../middleware/csrf");

const workshopController = require("../controllers/workshopController");

// 🎛 Validation middleware (Celebrate + Joi)
const {
  validateWorkshopCreate,
  validateWorkshopEdit,
  validateWorkshopRegistration,
  validateWorkshopUnregister,
  validateWaitlistEntity,
  validateWorkshopSearch,
} = require("../middleware/validation");

const participantActionLimiter = perUserRateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
});

const adminParticipantViewLimiter = perUserRateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
});

/* ============================================================
   🟢 STATIC / META ROUTES (MUST BE FIRST)
   ============================================================ */

// 1. Audit (Moved to top so it's not caught by /:id)
router.get("/audit/run", protect, authorizeAdmin, async (_req, res) => {
  try {
    const result = await runWorkshopAudit();
    return res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// 2. Meta Routes
router.get("/meta/cities", workshopController.getAvailableCities);

// 3. Validation Routes
// Note: I added a plain alias just in case frontend calls /validate-address directly
router.get(
  "/meta/validate-address",
  protect,
  authorizeAdmin,
  workshopController.validateAddress
);
router.get(
  "/validate-address", 
  protect, 
  authorizeAdmin, 
  workshopController.validateAddress
);

/* ============================================================
   🟢 LIST ROUTES
   ============================================================ */
// Search must come before /:id
router.get("/search", validateWorkshopSearch, workshopController.searchWorkshops);
router.get("/registered", protect, workshopController.getRegisteredWorkshops);
router.get("/", workshopController.getAllWorkshops);

/* ============================================================
   🟢 ACTION ROUTES (Specific Sub-resources)
   ============================================================ */
// Register / Unregister entity
router.post(
  "/:id/register-entity",
  protect,
  participantActionLimiter,
  validateWorkshopRegistration,
  workshopController.registerEntityToWorkshop
);

router.delete(
  "/:id/unregister-entity",
  protect,
  participantActionLimiter,
  validateWorkshopUnregister,
  workshopController.unregisterEntityFromWorkshop
);

// Waitlist entity
router.post(
  "/:id/waitlist-entity",
  protect,
  participantActionLimiter,
  validateWaitlistEntity,
  workshopController.addEntityToWaitlist
);

router.delete(
  "/:id/waitlist-entity",
  protect,
  participantActionLimiter,
  validateWaitlistEntity,
  workshopController.removeEntityFromWaitlist
);

// Export & Waitlist View
router.post(
  "/:id/export",
  protect,
  authorizeAdmin,
  csrfProtection,
  workshopController.exportWorkshopExcel
);

router.get(
  "/:id/waitlist",
  protect,
  authorizeAdmin,
  adminParticipantViewLimiter,
  workshopController.getWaitlist
);

/* ============================================================
   🟢 DETAIL ROUTES (SPECIFIC GETs)
   ============================================================ */

router.get(
  "/:id/participants",
  protect,
  authorizeAdmin,
  adminParticipantViewLimiter,
  workshopController.getWorkshopParticipants
);

/* ============================================================
   ⚠️ GENERIC GET ROUTE (MUST BE LAST GET)
   ============================================================ */
// This catches anything that looks like an ID. 
// If "audit" or "search" were below this, they would break.
router.get("/:id", workshopController.getWorkshopById);

/* ============================================================
   🟣 ADMIN ROUTES (POST/PUT/DELETE)
   ============================================================ */
// These are safe here because the HTTP methods are different (not GET)

router.post(
  "/",
  protect,
  authorizeAdmin,
  csrfProtection,
  validateWorkshopCreate,
  workshopController.createWorkshop
);

router.put(
  "/:id",
  protect,
  authorizeAdmin,
  csrfProtection,
  validateWorkshopEdit,
  workshopController.updateWorkshop
);

router.delete(
  "/:id",
  protect,
  authorizeAdmin,
  csrfProtection,
  workshopController.deleteWorkshop
);

module.exports = router;
