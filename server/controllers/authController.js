/**
 * authController.js — Unified Auth + OTP Controller (Resend Only)
 * -------------------------------------------------------------
 * ✅ Priority: Uses Resend (sadnaot.online) exclusively.
 * ✅ Logs: Keeps all your existing safeAuthLog logic.
 */

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Resend } = require("resend");
const User = require("../models/User");

// SECURITY FIX: centralize sanitized logging for auth flows
const DEV_AUTH_LOG = process.env.NODE_ENV !== "production";
const safeAuthLog = (message) => {
  if (DEV_AUTH_LOG) {
    console.info(`[AUTH] ${message}`);
  }
};

/* ============================================================
   🔐 JWT Helpers
   ============================================================ */
function generateAccessToken(user) {
  const expiresIn = process.env.JWT_EXPIRY || "15m";
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn,
  });
}

function generateRefreshToken(user) {
  const expiresIn = process.env.JWT_REFRESH_EXPIRY || "7d";
  return jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn,
  });
}

function parseJwtExpToMs(exp) {
  const m = String(exp).match(/^(\d+)([smhd])$/i);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * map[unit];
}

function setRefreshCookie(res, refreshToken) {
  const isProd = process.env.NODE_ENV === "production";
  const sameSite = "Lax"; // or 'None' if frontend/backend are on different domains
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite,
    path: "/",
    maxAge: parseJwtExpToMs(process.env.JWT_REFRESH_EXPIRY || "7d"),
  });
  safeAuthLog(`refreshToken cookie set | secure=${isProd}`);
}

/* ============================================================
   📤 Email Configuration (Resend Only)
   ============================================================ */
const isProd = process.env.NODE_ENV === "production";
const logFile = path.join(__dirname, "../../otp_log.csv");

let resend = null;

// Initialize Resend
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log("📩 Resend API initialized.");
} else {
  console.warn("⚠️  RESEND_API_KEY is missing. Emails will not send.");
}

/* ============================================================
   🛠 Helpers: Tokens & URLs
   ============================================================ */
const PASSWORD_RESET_TOKEN_MINUTES = Math.max(
  Number(process.env.PASSWORD_RESET_TOKEN_MINUTES || 30),
  5
);
const PASSWORD_RESET_TOKEN_TTL_MS = PASSWORD_RESET_TOKEN_MINUTES * 60 * 1000;

function hashResetToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
}

function hashRefreshToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken || "")).digest("hex");
}

function tokensMatch(storedToken, candidateToken) {
  if (!storedToken || !candidateToken) return false;
  const stored = Buffer.from(String(storedToken));
  const candidateHashed = Buffer.from(hashRefreshToken(candidateToken));
  const safeEqual = (a, b) => {
    if (a.length !== b.length) return false;
    try { return crypto.timingSafeEqual(a, b); } 
    catch (err) { return false; }
  };
  if (safeEqual(stored, candidateHashed)) return true;
  return safeEqual(stored, Buffer.from(String(candidateToken)));
}

function resolveClientBaseUrl(req) {
  // 1. Best: Explicit env var
  if (process.env.CLIENT_URL) return process.env.CLIENT_URL.replace(/\/$/, "");
  
  // 2. Fallbacks
  if (process.env.PUBLIC_CLIENT_URL) return process.env.PUBLIC_CLIENT_URL.replace(/\/$/, "");
  
  const origin = req?.headers?.origin;
  if (origin) return origin.replace(/\/$/, "");

  // 3. Last Resort
  return "http://localhost:5173";
}

function buildPasswordResetPayload({ baseUrl, email, otp, token, minutes }) {
  const resetUrl = new URL("/resetpassword", baseUrl);
  resetUrl.searchParams.set("token", token);
  resetUrl.searchParams.set("email", email);

  const prettyMinutes = minutes >= 60
    ? `${Math.round(minutes / 60)} שעות`
    : `${minutes} דקות`;

  const text =
    `קישור לאיפוס סיסמה: ${resetUrl.toString()}\n\n` +
    `קוד חד-פעמי: ${otp}\n\n` +
    `הקישור והקוד יהיו זמינים למשך ${prettyMinutes}. אם לא ביקשת איפוס, ניתן להתעלם מהודעה זו.`;

  const html = `<div dir="rtl" style="text-align:right; font-family:sans-serif;">
    <p>לקוח יקר/ה,</p>
    <p>בקשה לאיפוס סיסמה התקבלה עבור המשתמש <strong>${email}</strong>.</p>
    <p><a href="${resetUrl.toString()}" style="color:#2563eb;font-weight:bold;">לחצו כאן כדי לאפס את הסיסמה</a></p>
    <p>ניתן גם להקליד את הקוד החד-פעמי: <strong>${otp}</strong></p>
    <p>הקישור והקוד יהיו זמינים למשך ${prettyMinutes}. אם לא ביקשתם איפוס, ניתן להתעלם מהודעה זו.</p>
    </div>`;

  return { text, html, resetUrl: resetUrl.toString() };
}

function createPasswordResetArtifacts() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = hashResetToken(rawToken);
  const expiresAt = Date.now() + PASSWORD_RESET_TOKEN_TTL_MS;
  return { otp, rawToken, hashedToken, expiresAt };
}

/* ============================================================
   ✉️ Send Email (Resend Only)
   ============================================================ */
async function sendEmail({ to, subject, text, html }) {
  safeAuthLog(`sendEmail invoked for: ${to}`);

  if (!resend) {
    console.error("❌ Resend API not initialized. Cannot send email.");
    return false;
  }

  // 1️⃣ Send via Resend
  try {
    const fromAddress = process.env.EMAIL_FROM || "info@sadnaot.online";
    
    await resend.emails.send({
      from: fromAddress, // Must be your verified domain
      to, 
      subject,
      html: html || `<p>${text}</p>`,
    });
    
    safeAuthLog("✅ sendEmail delivered via Resend");
    return true;
    
  } catch (err) {
    console.error(`❌ Resend failed: ${err.message}`);
    
    // Fallback: Log locally for debugging if Resend fails
    const line = `[${new Date().toISOString()}] To: ${to} | Subject: ${subject} | Error: ${err.message}\n`;
    fs.appendFileSync(logFile, line);
    return false;
  }
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  setRefreshCookie,
  sendEmail,
  resolveClientBaseUrl,
  createPasswordResetArtifacts,
  buildPasswordResetPayload,
  hashResetToken,
  tokensMatch,
};

/* ============================================================
   👤 Register User
   ============================================================ */
exports.registerUser = async (req, res) => {
  safeAuthLog("registerUser invoked");
  try {
    const {
      name,
      email = "",
      password,
      idNumber,
      birthDate,
      city,
      phone = "",
      canCharge,
      familyMembers = [],
    } = req.body;

    const role = "user";
    if (!email && !phone)
      return res.status(400).json({ message: "Email or phone is required" });

    const cleanEmail = email?.trim().toLowerCase();
    const existing = await User.findOne({
      $or: [
        cleanEmail ? { email: cleanEmail } : null,
        phone ? { phone } : null,
      ].filter(Boolean),
    });

    if (existing)
      return res.status(400).json({ message: "A user with this email or phone already exists" });

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    
    // Sanitize family members
    const validFamily = Array.isArray(familyMembers)
      ? familyMembers
          .filter((m) => m.name && m.idNumber)
          .map((m) => ({
            name: m.name,
            relation: m.relation || "",
            idNumber: m.idNumber,
            phone: m.phone || phone || "",
            email: m.email || cleanEmail || "",
            city: m.city || city || "",
            birthDate: m.birthDate || "",
          }))
      : [];

    const user = await User.create({
      name,
      email: cleanEmail || null,
      phone: phone || null,
      passwordHash,
      idNumber,
      birthDate,
      city,
      canCharge: !!canCharge,
      familyMembers: validFamily,
      hasPassword: !!password,
      temporaryPassword: false,
      role,
    });

    safeAuthLog("registerUser succeeded");
    return res.status(201).json({
      success: true,
      message: "User registered successfully.",
      user: sanitizeUserForResponse(user, user),
    });
  } catch (e) {
    console.error("❌ registerUser error:", e);
    res.status(500).json({ message: "Server error during registration." });
  }
};

/* ============================================================
   🔑 Login User
   ============================================================ */
exports.loginUser = async (req, res) => {
  safeAuthLog("loginUser invoked");
  try {
    const { email, password } = req.body;
    const user = await User.findOne({
      email: (email || "").toLowerCase().trim(),
    }).select("+passwordHash");

    if (!user) return res.status(400).json({ message: "Invalid email or password" });

    const match = await bcrypt.compare(password, user.passwordHash || "");
    if (!match) return res.status(400).json({ message: "Invalid email or password" });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    user.refreshTokens.push({
      token: hashRefreshToken(refreshToken),
      userAgent: req.headers["user-agent"] || "",
    });
    await user.save();
    setRefreshCookie(res, refreshToken);

    safeAuthLog("loginUser succeeded");
    return res.json({
      accessToken,
      user: sanitizeUserForResponse(user, user),
    });
  } catch (e) {
    console.error("❌ loginUser error:", e);
    res.status(500).json({ message: "Server error during login" });
  }
};

/* ============================================================
   ✉️ Send OTP
   ============================================================ */
exports.sendOtp = async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    safeAuthLog("sendOtp invoked");

    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User with this email not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.otpCode = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000;
    user.otpAttempts = 0;
    await user.save();

    const sent = await sendEmail({
      to: email,
      subject: "קוד אימות - סדנאות כללית", // "Verification Code" in Hebrew
      text: `קוד האימות שלך הוא ${otp}. הקוד בתוקף ל-5 דקות.`,
      html: `<div dir="rtl" style="font-family:sans-serif;">
              <h2>קוד אימות</h2>
              <p>קוד האימות שלך הוא: <strong style="font-size: 20px;">${otp}</strong></p>
              <p>הקוד בתוקף ל-5 דקות.</p>
             </div>`,
    });

    if (!sent) return res.status(500).json({ message: "Failed to send OTP email." });

    return res.json({ success: true, message: "OTP sent successfully." });
  } catch (e) {
    console.error("❌ sendOtp error:", e);
    res.status(500).json({ message: "Failed to send OTP." });
  }
};

/* ============================================================
   ✅ Verify OTP
   ============================================================ */
exports.verifyOtp = async (req, res) => {
  safeAuthLog("verifyOtp invoked");
  try {
    const { email, otp } = req.body;
    const normalizedOtp = String(otp ?? "").trim();
    const user = await User.findOne({
      email: (email || "").toLowerCase().trim(),
    }).select("+otpCode +otpExpires +otpAttempts");

    if (!user) return res.status(404).json({ message: "User not found." });

    // Handle consumed/missing OTP
    if (!user.otpCode && !user.otpExpires) {
      return res.status(409).json({ message: "OTP already verified or missing." });
    }

    // Expired
    if (!user.otpExpires || user.otpExpires < Date.now()) {
      user.otpCode = null;
      user.otpExpires = null;
      await user.save();
      return res.status(400).json({ message: "OTP expired." });
    }

    // Wrong code
    if (String(user.otpCode).trim() !== normalizedOtp) {
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      await user.save();
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Valid
    safeAuthLog("verifyOtp succeeded");
    user.otpCode = null;
    user.otpExpires = null;
    await user.save();

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    user.refreshTokens.push({
      token: hashRefreshToken(refreshToken),
      userAgent: req.headers["user-agent"] || "",
    });
    await user.save();

    setRefreshCookie(res, refreshToken);

    return res.json({
      accessToken,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
    });
  } catch (e) {
    console.error("❌ verifyOtp error:", e);
    res.status(500).json({ message: "Server error verifying code." });
  }
};

/* ============================================================
   🔁 Recover & Reset Password
   ============================================================ */
async function handlePasswordResetRequest(req, res) {
  const emailRaw = req.body?.email;
  safeAuthLog("requestPasswordReset invoked");
  try {
    const email = (emailRaw || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email }).select(
      "+passwordResetTokenHash +passwordResetTokenExpires"
    );

    const genericResponse = {
      success: true,
      message: "אם החשבון קיים, נשלח קישור לאיפוס סיסמה. בדקו את תיבת המייל.",
    };

    if (!user) {
      // Fake delay to prevent timing attacks
      await new Promise((resolve) => setTimeout(resolve, 300));
      return res.json(genericResponse);
    }

    const { otp, rawToken, hashedToken, expiresAt } = createPasswordResetArtifacts();

    user.otpCode = otp;
    user.otpExpires = expiresAt;
    user.otpAttempts = 0;
    user.passwordResetTokenHash = hashedToken;
    user.passwordResetTokenExpires = expiresAt;
    user.passwordResetTokenIssuedAt = new Date();
    await user.save();

    const baseUrl = resolveClientBaseUrl(req);
    const payload = buildPasswordResetPayload({
      baseUrl,
      email,
      otp,
      token: rawToken,
      minutes: PASSWORD_RESET_TOKEN_MINUTES,
    });

    const sent = await sendEmail({
      to: email,
      subject: "איפוס סיסמה - סדנאות כללית",
      text: payload.text,
      html: payload.html,
    });

    if (!sent) {
      console.warn("⚠️ Password reset email dispatch failed");
      return res.status(500).json({ message: "Failed to send password reset email" });
    }

    safeAuthLog("requestPasswordReset dispatched");
    return res.json(genericResponse);
  } catch (e) {
    console.error("❌ requestPasswordReset error:", e);
    return res.status(500).json({ message: "Server error sending reset instructions" });
  }
}

exports.recoverPassword = handlePasswordResetRequest;
exports.requestPasswordReset = handlePasswordResetRequest;

exports.resetPassword = async (req, res) => {
  safeAuthLog("resetPassword invoked");
  try {
    const { email, otp, newPassword, token } = req.body;
    if (!email || !newPassword) {
      return res.status(400).json({ message: "email and newPassword required" });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select(
      "+passwordHash +otpCode +otpExpires +otpAttempts +passwordResetTokenHash +passwordResetTokenExpires"
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    const now = Date.now();
    let verified = false;

    // Verify Token (Link Click)
    if (token) {
      const normalizedToken = String(token).trim().toLowerCase();
      const hashed = hashResetToken(normalizedToken);
      if (
        !user.passwordResetTokenHash ||
        !user.passwordResetTokenExpires ||
        now > user.passwordResetTokenExpires
      ) {
        return res.status(400).json({ message: "Reset token expired" });
      }
      if (hashed !== user.passwordResetTokenHash) {
        return res.status(400).json({ message: "Invalid reset token" });
      }
      verified = true;
    }

    // Verify OTP (Manual Entry)
    if (!verified) {
      if (!otp) return res.status(400).json({ message: "OTP or token required" });
      if (!user.otpCode || !user.otpExpires || now > user.otpExpires) {
        return res.status(400).json({ message: "OTP expired" });
      }
      if (String(otp).trim() !== String(user.otpCode).trim()) {
        return res.status(400).json({ message: "Invalid OTP" });
      }
      verified = true;
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.hasPassword = true;
    user.temporaryPassword = false;
    user.otpCode = null;
    user.otpExpires = null;
    user.otpAttempts = 0;
    user.passwordResetTokenHash = null;
    user.passwordResetTokenExpires = 0;
    user.passwordResetTokenIssuedAt = null;
    await user.save();

    return res.json({ success: true, message: "Password reset successfully" });
  } catch (e) {
    console.error("❌ resetPassword error:", e);
    return res.status(500).json({ message: "Server error resetting password" });
  }
};

/* ============================================================
   👤 User Profile & Password Update
   ============================================================ */
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-passwordHash -otpCode");
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json(sanitizeUserForResponse(user, req.user));
  } catch (e) {
    res.status(500).json({ message: "Server error retrieving profile." });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select("+passwordHash");
    if (!user) return res.status(404).json({ message: "User not found." });

    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) return res.status(400).json({ message: "Current password incorrect." });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.hasPassword = true;
    user.temporaryPassword = false;
    await user.save();
    res.json({ success: true, message: "Password updated successfully." });
  } catch (e) {
    res.status(500).json({ message: "Server error updating password." });
  }
};

/* ============================================================
   🔁 Token Refresh & Logout
   ============================================================ */
exports.refreshAccessToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ message: "No refresh token" });

    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const session = user.refreshTokens.find((rt) => tokensMatch(rt.token, token));
    if (!session) return res.status(403).json({ message: "Refresh not recognized" });

    const newAccess = generateAccessToken(user);
    return res.json({ accessToken: newAccess });
  } catch (e) {
    res.status(500).json({ message: "Server error refreshing token" });
  }
};

exports.logout = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    const isProd = process.env.NODE_ENV === "production";
    
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: isProd,
      sameSite: "Lax",
      path: "/",
    });

    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        const user = await User.findById(payload.id);
        if (user) {
          user.refreshTokens = user.refreshTokens.filter(
            (rt) => !tokensMatch(rt.token, token)
          );
          await user.save();
        }
      } catch (err) {
        // Token might be expired, just ignore
      }
    }
    return res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: "Server error during logout" });
  }
};
