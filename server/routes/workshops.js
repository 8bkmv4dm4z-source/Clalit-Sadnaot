// server/routes/workshops.js
const express = require("express");
const router = express.Router();
const { authenticate, authorizeAdmin } = require("../middleware/authMiddleware");
const ctrl = require("../controllers/workshopController");

// --- Health check ---
router.get("/health", (_req, res) => res.json({ ok: true }));

/* ---------- Public Routes ---------- */
// ✅ רשימת כל הסדנאות עם אפשרות חיפוש/סינון
router.get("/", ctrl.getAllWorkshops);

// ✅ רשימת מזהי סדנאות שהמשתמש (או בני המשפחה שלו) רשום אליהן
router.get("/registered", authenticate, ctrl.getRegisteredWorkshops);

// ✅ סדנה לפי ID
router.get("/:id", ctrl.getWorkshopById);

// ✅ רשימת משתתפים לסדנה מסוימת
router.get("/:id/participants", authenticate, ctrl.getWorkshopParticipants);

/* ---------- Admin CRUD Routes ---------- */
router.post("/", authenticate, authorizeAdmin, ctrl.createWorkshop);
router.put("/:id", authenticate, authorizeAdmin, ctrl.updateWorkshop);
router.delete("/:id", authenticate, authorizeAdmin, ctrl.deleteWorkshop);

/* ---------- Unified Registration Routes ---------- */
// ✅ הרשמה (משתמש או בן משפחה)
router.post("/:id/register-entity", authenticate, ctrl.registerEntityToWorkshop);

// ✅ ביטול הרשמה (משתמש או בן משפחה)
router.delete("/:id/unregister-entity", authenticate, ctrl.unregisterEntityFromWorkshop);

module.exports = router;
