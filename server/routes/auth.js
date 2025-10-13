// server/routes/auth.js
const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { refreshAccessToken, logout } = require("../controllers/authController");

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

/* ----------------------------------------
 * 🚦 Per-route Limiters
 * -------------------------------------- */

// General login/register limiter
const generalAuthLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 min
  max: 10, // up to 10 requests per IP
  message: { message: "Too many authentication attempts. Try again later." },
});

// Stricter OTP limiter
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  max: 3, // only 3 OTP actions allowed
  message: { message: "Too many OTP requests. Try again later." },
});

/* ----------------------------------------
 * 🧩 Routes
 * -------------------------------------- */

// Registration & login
router.post("/register", generalAuthLimiter, registerUser);
router.post("/login", generalAuthLimiter, loginUser);

router.post("/refresh", refreshAccessToken);
router.post("/logout", logout);
// OTP
router.post("/send-otp", otpLimiter, sendOtp);
router.post("/verify", otpLimiter, verifyOtp);

// Password recovery
router.post("/recover", otpLimiter, recoverPassword);
router.post("/reset", otpLimiter, resetPassword);

// Authenticated profile routes
const { authenticate } = require("../middleware/authMiddleware");
console.log("🧩 AUTH MIDDLEWARE:", { authenticate });

router.get("/me", authenticate, getUserProfile);
router.put("/password", authenticate, updatePassword);

module.exports = router;
