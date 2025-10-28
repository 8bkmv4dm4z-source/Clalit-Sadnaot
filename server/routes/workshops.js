// server/routes/workshops.js
const express = require("express");
const router = express.Router();

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
} = require("../middleware/validation");

/* ============================================================
   🟢 PUBLIC / USER ROUTES
   ============================================================ */

// ✅ מטא ראוטים (חשוב להופיע לפני :id)
router.get("/meta/cities", workshopController.getAvailableCities);
router.get(
  "/meta/validate-address",
  protect,
  authorizeAdmin,
  workshopController.validateAddress
);

// ✅ כל הסדנאות (כולל מידע אישי על המשתמש המחובר)
router.get("/", workshopController.getAllWorkshops);

// ✅ Smart search over workshops with filters
// This endpoint performs an indexed text search (Atlas search) over
// workshop fields (title, description, coach, type, city) and supports
// additional filters such as city, day, hour, type, ageGroup, coach and availability.
// It must appear before ":id" routes to avoid conflicting with numeric IDs.
router.get("/search", workshopController.searchWorkshops);

// ✅ רשימת הסדנאות שהמשתמש או אחד מבני משפחתו רשומים אליהן
router.get("/registered", protect, workshopController.getRegisteredWorkshops);

// ✅ פרטי סדנה בודדת
router.get("/:id", workshopController.getWorkshopById);

// ✅ משתתפים בסדנה (למודאל של האדמין)
router.get("/:id/participants", protect, workshopController.getWorkshopParticipants);

// ✅ רישום משתמש או בן משפחה לסדנה
router.post(
  "/:id/register-entity",
  protect,
  validateWorkshopRegistration,
  workshopController.registerEntityToWorkshop
);

// ✅ ביטול רישום לסדנה
router.delete(
  "/:id/unregister-entity",
  protect,
  validateWorkshopUnregister,
  workshopController.unregisterEntityFromWorkshop
);

// ✅ הוספה לרשימת המתנה (משתמש או בן משפחה)
router.post("/:id/waitlist-entity", protect, workshopController.addEntityToWaitlist);

// ✅ הסרה מרשימת המתנה (משתמש או בן משפחה)
router.delete("/:id/waitlist-entity", protect, workshopController.removeEntityFromWaitlist);

/* ============================================================
   🟣 ADMIN ROUTES
   ============================================================ */

// ✅ יצירת סדנה חדשה
router.post(
  "/",
  protect,
  authorizeAdmin,
  validateWorkshopCreate,
  workshopController.createWorkshop
);

// ✅ עדכון סדנה קיימת
router.put(
  "/:id",
  protect,
  authorizeAdmin,
  validateWorkshopEdit,
  workshopController.updateWorkshop
);

// ✅ מחיקת סדנה
router.delete("/:id", protect, authorizeAdmin, workshopController.deleteWorkshop);

// ✅ ייצוא סדנה לאקסל ושליחת מייל למנהל
router.post("/:id/export", protect, authorizeAdmin, workshopController.exportWorkshopExcel);

// ✅ צפייה ברשימת ההמתנה
router.get("/:id/waitlist", protect, authorizeAdmin, workshopController.getWaitlist);

// ✅ הוספה ידנית לרשימת ההמתנה
router.post("/:id/waitlist", protect, authorizeAdmin, workshopController.addToWaitlist);

// ✅ הסרה ידנית מרשימת ההמתנה
router.delete("/:id/waitlist/:entryId", protect, authorizeAdmin, workshopController.removeFromWaitlist);

/* ============================================================
   🧩 EXPORT ROUTER
   ============================================================ */
module.exports = router;
