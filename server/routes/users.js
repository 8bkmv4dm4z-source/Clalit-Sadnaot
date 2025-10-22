// server/routes/users.js
const express = require("express");
const router = express.Router();
const usersController = require("../controllers/userController");
const { authenticate: protect, authorizeAdmin } = require("../middleware/authMiddleware");

// 🧩 Joi / Celebrate Validation Schemas
const {
  validateUserRegistration,
  validateUserEdit,
  validateFamilyMember,
} = require("../middleware/validation");
console.log({
  protect,
  authorizeAdmin,
  validateUserRegistration: typeof validateUserRegistration,
  createUser: typeof usersController.createUser,
});
console.log("🧩 USER ROUTES INIT");

// ============================================================
// 👤 Logged-in user
// ============================================================
// אין body, לכן אין צורך בוולידציה
router.get("/me", protect, usersController.getMe);

// ============================================================
// 👥 General Users CRUD
// ============================================================

// 🔹 Get all users (Admin only)
router.get("/", protect, authorizeAdmin, usersController.getAllUsers);

// 🔹 Create new user (Admin only)
// ✅ הוספנו validateUserRegistration — בודק שם, אימייל, טלפון וכו'
router.post("/", protect, authorizeAdmin, validateUserRegistration, usersController.createUser);

// 🔹 Delete user (Admin only)
// אין גוף בבקשה, לכן אין צורך בוולידציה
router.delete("/:id", protect, authorizeAdmin, usersController.deleteUser);

// ============================================================
// 🧩 Mixed User/Family routes
// ============================================================

// 🔹 Workshops list for user/family (Admin only, placed before /:id)
router.get("/:id/workshops", protect, authorizeAdmin, usersController.getUserWorkshopsList);

// 🔹 Unified entity fetch (user or family member)
router.get("/entity/:id", protect, usersController.getEntityById);

// 🔹 Get user by id (after /entity/:id)
router.get("/:id", protect, usersController.getUserById);

// 🔹 Unified update (user or family)
// ✅ הוספנו validateUserEdit — בודק שהשדות תקינים (name, phone, city וכו')
router.put("/update-entity", protect, validateUserEdit, usersController.updateEntity);

// 🟢 אם תוסיף ראוט להוספת בן משפחה, תוכל להשתמש בזה:
//router.post("/:id/family", protect, validateFamilyMember, usersController.addFamilyMember);

module.exports = router;
