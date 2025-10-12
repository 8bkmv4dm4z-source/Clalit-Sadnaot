// server/routes/workshops.js
const express = require("express");
const router = express.Router();
const {
  authenticate: protect,
  authorizeAdmin,
} = require("../middleware/authMiddleware");

// 📦 Workshop Controller (הגרסה המלאה שלך)
const workshopController = require("../controllers/workshopController");

/* ============================================================
   🟢 PUBLIC / USER ROUTES
   ============================================================ */

// ✅ כל הסדנאות (כולל מידע אישי על המשתמש המחובר)
router.get("/", workshopController.getAllWorkshops);

// ✅ רשימת הסדנאות שהמשתמש או אחד מבני משפחתו רשומים אליהן
router.get("/registered", protect, workshopController.getRegisteredWorkshops);

// ✅ פרטי סדנה בודדת
router.get("/:id", workshopController.getWorkshopById);

// ✅ משתתפים בסדנה (למודאל של האדמין)
router.get("/:id/participants", protect, workshopController.getWorkshopParticipants);

// ✅ רישום משתמש או בן משפחה לסדנה (משתמש רגיל)
router.post("/:id/register-entity", protect, workshopController.registerEntityToWorkshop);

// ✅ ביטול רישום לסדנה (משתמש רגיל)
router.delete("/:id/unregister-entity", protect, workshopController.unregisterEntityFromWorkshop);


/* ============================================================
   🟣 ADMIN ROUTES
   ============================================================ */

// ✅ יצירת סדנה חדשה
router.post("/", protect, authorizeAdmin, workshopController.createWorkshop);

// ✅ עדכון סדנה קיימת
router.put("/:id", protect, authorizeAdmin, workshopController.updateWorkshop);

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
