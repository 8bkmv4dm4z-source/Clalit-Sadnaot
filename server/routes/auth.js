// server/routes/auth.js
const express = require("express");
const router = express.Router();
const {
  registerUser,
  loginUser,
  sendOtp,
  verifyOtp,
  getUserProfile,
  updatePassword,
  recoverPassword,
  resetPassword,
} = require("../controllers/authController");

console.log("🧩 AUTH CONTROLLER:", {
  registerUser,
  loginUser,
  sendOtp,
  verifyOtp,
  getUserProfile,
  updatePassword,
  recoverPassword,
  resetPassword,
});

const { authenticate } = require("../middleware/authMiddleware");
console.log("🧩 AUTH MIDDLEWARE:", { authenticate });

// Registration & login
router.post("/register", registerUser);
router.post("/login", loginUser);

// OTP
router.post("/send-otp", sendOtp);
router.post("/verify", verifyOtp);

// Password recovery
router.post("/recover", recoverPassword);
router.post("/reset", resetPassword);

// Profile
router.get("/me", authenticate, getUserProfile);

// Password update (requires login)
router.put("/password", authenticate, updatePassword);

module.exports = router;
