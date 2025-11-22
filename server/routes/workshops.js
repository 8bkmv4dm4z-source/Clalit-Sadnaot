// server/routes/workshops.js — FIXED ORDER
const express = require("express");
const router = express.Router();
const { runWorkshopAudit } = require("../services/workshopAuditService");

const {
  authenticate: protect,
  authorizeAdmin,
} = require("../middleware/authMiddleware");

const workshopController = require("../controllers/workshopController");

// 🎛 Validation middleware (Celebrate + Joi)
const {
  validateWorkshopCreate,
  validateWorkshopEdit,
  validateWorkshopRegistration,
  validateWorkshopUnregister,
  validateWaitlistEntity,
} = require("../middleware/validation");

/* ============================================================
   🟢 PUBLIC / USER ROUTES
   ============================================================ */

// Meta
router.get("/meta/cities", workshopController.getAvailableCities);
router.get(
  "/meta/validate-address",
  protect,
  authorizeAdmin,
  workshopController.validateAddress
);

// List + search
router.get("/", workshopController.getAllWorkshops);
router.get("/search", workshopController.searchWorkshops);
router.get("/registered", protect, workshopController.getRegisteredWorkshops);

/* ============================================================
   🟢 ACTION ROUTES — MUST COME BEFORE /:id
   ============================================================ */

// Register / Unregister entity
router.post(
  "/:id/register-entity",
  protect,
  validateWorkshopRegistration,
  workshopController.registerEntityToWorkshop
);

router.delete(
  "/:id/unregister-entity",
  protect,
  validateWorkshopUnregister,
  workshopController.unregisterEntityFromWorkshop
);

// Waitlist entity
router.post(
  "/:id/waitlist-entity",
  protect,
  validateWaitlistEntity,
  workshopController.addEntityToWaitlist
);

router.delete(
  "/:id/waitlist-entity",
  protect,
  validateWaitlistEntity,
  workshopController.removeEntityFromWaitlist
);

/* ============================================================
   🟢 DETAIL ROUTES — SAFE NOW
   ============================================================ */

router.get(
  "/:id/participants",
  protect,
  workshopController.getWorkshopParticipants
);

router.get("/:id", workshopController.getWorkshopById);

/* ============================================================
   🟣 ADMIN ROUTES
   ============================================================ */

router.post(
  "/",
  protect,
  authorizeAdmin,
  validateWorkshopCreate,
  workshopController.createWorkshop
);

router.put(
  "/:id",
  protect,
  authorizeAdmin,
  validateWorkshopEdit,
  workshopController.updateWorkshop
);

router.delete(
  "/:id",
  protect,
  authorizeAdmin,
  workshopController.deleteWorkshop
);

router.post(
  "/:id/export",
  protect,
  authorizeAdmin,
  workshopController.exportWorkshopExcel
);

router.get(
  "/:id/waitlist",
  protect,
  authorizeAdmin,
  workshopController.getWaitlist
);



router.get(
  "/audit/run",
  protect,
  authorizeAdmin,
  async (req, res) => {
    try {
      const result = await runWorkshopAudit();
      res.json({ success: true, result });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }
);
module.exports = router;
