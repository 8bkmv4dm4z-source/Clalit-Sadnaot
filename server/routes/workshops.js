const express = require("express");
const router = express.Router();
const { authenticate, authorizeAdmin } = require("../middleware/authMiddleware");
const ctrl = require("../controllers/workshopController");

// --- Health check ---
router.get("/health", (_req, res) => res.json({ ok: true }));

/* ---------- Public Routes ---------- */
// ✅ נתיב חדש שמחזיר רשימת IDs של סדנאות שהמשתמש רשום אליהן
router.get("/registered", authenticate, ctrl.getRegisteredWorkshopIds);

// ✅ כל הסדנאות (עם אפשרות חיפוש/סינון)
router.get("/", ctrl.getAllWorkshops);

// רשימת משתתפים לסדנה מסוימת
router.get("/:id/participants", authenticate, ctrl.getWorkshopParticipants);

// סדנה לפי ID
router.get("/:id", ctrl.getWorkshopById);

/* ---------- Admin CRUD Routes ---------- */
router.post("/", authenticate, authorizeAdmin, ctrl.createWorkshop);
router.put("/:id", authenticate, authorizeAdmin, ctrl.updateWorkshop);
router.delete("/:id", authenticate, authorizeAdmin, ctrl.deleteWorkshop);

/* ---------- Legacy Registration Routes ---------- */
router.post("/:id/register", authenticate, ctrl.registerForWorkshop);
router.put("/:id/register", authenticate, ctrl.registerForWorkshop);
router.post("/:id/unregister", authenticate, ctrl.unregisterFromWorkshop);
router.put("/:id/unregister", authenticate, ctrl.unregisterFromWorkshop);

/* ---------- New Unified Routes ---------- */
router.post("/:id/user_array", authenticate, ctrl.addUserToWorkshop);
router.delete("/:id/user_array/:userId", authenticate, ctrl.removeUserFromWorkshop);
router.delete("/:id/remove/:userId", authenticate, authorizeAdmin, ctrl.removeUserFromWorkshop);
router.put("/:id/users_array", authenticate, authorizeAdmin, ctrl.updateParticipantsArray);
router.put("/:id/capacity", authenticate, authorizeAdmin, ctrl.updateWorkshopCapacity);

module.exports = router;