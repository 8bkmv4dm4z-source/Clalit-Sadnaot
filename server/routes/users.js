// server/routes/users.js
const express = require("express");
const router = express.Router();
const usersController = require("../controllers/userController");
const { authenticate: protect, authorizeAdmin } = require("../middleware/authMiddleware");

console.log("🧩 USER ROUTES INIT");

// ============================================================
// 👤 Logged-in user
// ============================================================
router.get("/me", protect, usersController.getMe);

// ============================================================
// 👥 General Users CRUD
// ============================================================

// 🔹 Get all users (Admin only)
router.get("/", protect, authorizeAdmin, usersController.getAllUsers);

// 🔹 Create new user (Admin only)
router.post("/", protect, authorizeAdmin, usersController.createUser);

// 🔹 Delete user (Admin only)
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
router.put("/update-entity", protect, usersController.updateEntity);

module.exports = router;
