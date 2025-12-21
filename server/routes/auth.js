// server/routes/auth.js
const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { refreshAccessToken, logout } = require("../controllers/authController");

const {
  registerUser,
  requestRegistration,
  verifyRegistrationOtp,
  loginUser,
  sendOtp,
  verifyOtp,
  getUserProfile,
  updatePassword,
  recoverPassword,
  requestPasswordReset,
  resetPassword,
} = require("../controllers/authController");

// 🎛 Validation middleware (Celebrate + Joi)
const {
  validateSendOtp,
  validateRegister,
  validateRegistrationRequest,
  validateRegistrationOtp,
  validateLogin,
  validateOTP,
  validatePasswordResetRequest,
  validatePasswordReset,
} = require("../middleware/validation");

// 🧱 Authentication middleware
const { authenticate } = require("../middleware/authMiddleware");

console.log("🧩 AUTH ROUTES INIT");

// ============================================================
// 🚦 Rate Limiters (final tuned version)
// ============================================================

// General login/register limiter
const generalAuthLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 8, // only 8 auth attempts per 10 minutes per IP
  message: { message: "Too many authentication attempts. Try again later." },
  skip: (req) =>
    process.env.NODE_ENV === "loadtest" ||
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip),
  handler: (req, res) => {
    console.warn("[LIMITER] hit", {
      type: "auth-general",
      ip: req.ip,
      path: req.path,
      when: new Date().toISOString(),
    });
    res.status(429).json({ message: "Too many authentication attempts." });
  },
});
// OTP-specific limiter
const otpLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,     // 10 minutes
  max: 3,                       // only 3 OTPs per IP per 10 min
  message: { message: "Too many OTP requests. Try again later." },
  standardHeaders: true,        // return RateLimit-* headers
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === "loadtest", // disable only in loadtest
  handler: (req, res) => {
    console.warn("[LIMITER] OTP limit hit", req.ip);
    res.status(429).json({ message: "Too many OTP requests" });
  },
});
const otpRequests = new Map();
const registrationVelocity = new Map();

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // three registrations per IP per hour
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === "loadtest",
  handler: (req, res) => {
    console.warn("[LIMITER] registration IP cap reached", req.ip);
    res
      .status(429)
      .json({ message: "Too many registrations from this network. Try again later." });
  },
});

function enforceRegistrationVelocity(req, res, next) {
  const email = (req.body.email || "").toLowerCase();
  const key = `${req.ip}|${email || "unknown"}`;
  const now = Date.now();
  const windowMs = 30 * 60 * 1000; // 30 minutes rolling window
  const maxAttempts = 5;

  const attempts = registrationVelocity.get(key) || [];
  const recent = attempts.filter((ts) => now - ts < windowMs);
  recent.push(now);
  registrationVelocity.set(key, recent);

  if (recent.length > maxAttempts) {
    console.warn("[LIMITER] registration velocity blocked", { ip: req.ip, email });
    return res.status(429).json({
      message: "Registration attempts are temporarily blocked for this address.",
    });
  }

  next();
}

function otpEmailLimiter(req, res, next) {
  const email = req.body.email?.toLowerCase();
  if (!email) return next();

  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const max = 3;

  const entry = otpRequests.get(email) || [];
  const recent = entry.filter((t) => now - t < windowMs);
  recent.push(now);

  otpRequests.set(email, recent);

  if (recent.length > max) {
    return res.status(429).json({ message: "Too many OTP requests for this email" });
  }

  next();
}


// ============================================================
// 🧩 Auth Routes
// ============================================================

// 🟢 New: start registration (pending until OTP confirmed)
router.post(
  "/register/request",
  generalAuthLimiter,
  registrationLimiter,
  enforceRegistrationVelocity,
  validateRegistrationRequest,
  requestRegistration
);

// 🟢 New: confirm registration OTP
router.post(
  "/register/verify",
  otpLimiter,
  otpEmailLimiter,
  validateRegistrationOtp,
  verifyRegistrationOtp
);

// 🟢 Register new user
router.post(
  "/register",
  generalAuthLimiter,
  registrationLimiter,
  enforceRegistrationVelocity,
  validateRegister,
  registerUser
);

// 🔵 Login existing user
router.post("/login", generalAuthLimiter, validateLogin, loginUser);

// 🟣 Refresh access token (no validation body)
router.post("/refresh", refreshAccessToken);

// 🔴 Logout
router.post("/logout", logout);

// ============================================================
// 🔐 OTP verification & password reset
// ============================================================

// ✉️ Send OTP (for login or recovery)
router.post("/send-otp", otpLimiter,otpEmailLimiter,validateSendOtp, sendOtp);

// ✅ Verify OTP
router.post("/verify", otpLimiter, validateOTP, verifyOtp);

// 🛠️ Recover password (send reset link + OTP to email)
router.post(
  "/recover",
  otpLimiter,
  otpEmailLimiter,
  validatePasswordResetRequest,
  recoverPassword
);

// 📨 Dedicated reset-link request endpoint (alias of /recover)
router.post(
  "/password/request",
  otpLimiter,
  otpEmailLimiter,
  validatePasswordResetRequest,
  requestPasswordReset
);

// 🔄 Reset password with OTP
router.post("/reset", otpLimiter, validatePasswordReset, resetPassword);

// ============================================================
// 👤 Authenticated user routes
// ============================================================

// 🧾 Get logged-in user profile
router.get("/me", authenticate, getUserProfile);

// 🔑 Update password (authenticated)
router.put("/password", authenticate, validatePasswordReset, updatePassword);

module.exports = router;
