const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  getMe,
  createUser,
  updateUser,
  deleteUser,
} = require("../controllers/userController");
const { authenticate: protect } = require("../middleware/authMiddleware");

// ✅ NEW route for /me (must come before "/:id")
router.get("/me", protect, getMe);

// Existing routes
router.get("/", protect, getAllUsers);
router.get("/:id", protect, getUserById);
router.post("/", protect, createUser);
router.put("/:id", protect, updateUser);
router.delete("/:id", protect, deleteUser);
console.log("🧩 USER ROUTES INIT:");
console.log("protect =", typeof protect);
console.log("getMe =", typeof getMe);

module.exports = router;
