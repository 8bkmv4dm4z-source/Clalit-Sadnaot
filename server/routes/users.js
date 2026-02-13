// server/routes/users.js
const express = require("express");
const router = express.Router();
const usersController = require("../controllers/userController");
const { authenticate: protect, authorizeAdmin } = require("../middleware/authMiddleware");

// 🧩 Joi / Celebrate Validation Schemas
const {
  validateUserRegistration,
  validateUserEdit
} = require("../middleware/validation");


// ============================================================
// 👤 Logged-in user (minimal identity view)
// ============================================================
router.get("/getMe", protect, (req, res, next) => {
  next();
}, usersController.getMe);

// ============================================================
// 🔍 Smart Search (NEW)
// ============================================================
// ✅ Uses text index for admin global search, and family-level search for normal users
router.get("/search", protect, usersController.searchUsers);

// ============================================================
// 👥 General Users CRUD
// ============================================================

// 🔹 Get all users (Admin only)
router.get("/", protect, authorizeAdmin, usersController.getAllUsers);

// 🔍 Data integrity report (Admin only)
router.get(
  "/audit/report",
  protect,
  authorizeAdmin,
  usersController.getUserAuditReport
);

// 🔹 Create new user (Admin only)
router.post("/", protect, authorizeAdmin, validateUserRegistration, usersController.createUser);

// 🔹 Delete user (Admin only) — explicit entityKey route
router.delete(
  "/by-entity/:entityKey",
  protect,
  authorizeAdmin,
  usersController.deleteUser
);
// Legacy: treat :id as entityKey for backward compatibility
router.delete("/:id", protect, authorizeAdmin, usersController.deleteUser);

// ============================================================
// 🧩 Mixed User/Family routes
// ============================================================

// 🔹 Workshops list for user/family (Admin only, placed before /:id)
router.get("/:id/workshops", protect, authorizeAdmin, usersController.getUserWorkshopsList);

// 🔹 Unified entity fetch (user or family member)
router.get("/entity/:id", protect, usersController.getEntityById);

// 🔹 Get user or family entity by entityKey
router.get("/:id", protect, usersController.getUserById);

// 🔹 Unified update (user or family)
router.put("/update-entity", protect, validateUserEdit, usersController.updateEntity);

module.exports = router;
