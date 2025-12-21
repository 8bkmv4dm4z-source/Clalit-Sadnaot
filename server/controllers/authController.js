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
const RegistrationRequest = require("../models/RegistrationRequest");
const emailService = require('../services/emailService');
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
let gmailTransport = null;
let resendOverride = null;

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
function sanitizeUserForResponse(user, loggedInUser) {
  // Convert Mongoose doc to object if needed
  const u = user.toObject ? user.toObject() : user;
  
  // delete sensitive fields
  delete u.passwordHash;
  delete u.otpCode;
  delete u.otpExpires;
  delete u.otpAttempts;
  delete u.passwordResetTokenHash;
  delete u.passwordResetTokenExpires;
  delete u.refreshTokens;
  delete u.__v;
  
  return u;
}

function normalizeFamilyMembers(familyMembers = [], defaults = {}) {
  const basePhone = defaults.phone || "";
  const baseEmail = defaults.email || "";
  const baseCity = defaults.city || "";

  return Array.isArray(familyMembers)
    ? familyMembers
        .filter((m) => m && m.name && m.idNumber)
        .map((m) => ({
          name: String(m.name || "").trim(),
          relation: String(m.relation || "").trim(),
          idNumber: String(m.idNumber || "").trim(),
          phone: String(m.phone || "").trim() || basePhone,
          email: String(m.email || "").trim() || baseEmail,
          city: String(m.city || "").trim() || baseCity,
          birthDate: m.birthDate || "",
        }))
    : [];
}

function normalizeRegistrationPayload(body = {}) {
  const normalizedEmail = String(body.email || "").trim().toLowerCase();
  const normalizedPhone = String(body.phone || "").trim();
  const normalizedCity = String(body.city || "").trim();

  const payload = {
    name: String(body.name || "").trim(),
    email: normalizedEmail,
    password: body.password,
    phone: normalizedPhone,
    idNumber: String(body.idNumber || "").trim(),
    birthDate: body.birthDate || "",
    city: normalizedCity,
    canCharge: !!body.canCharge,
  };

  payload.familyMembers = normalizeFamilyMembers(body.familyMembers, {
    phone: normalizedPhone,
    email: normalizedEmail,
    city: normalizedCity,
  });

  return payload;
}

function setResendInstance(instance) {
  resendOverride = instance;
  if (instance) {
    resend = instance;
  }
}

function setGmailTransport(transport) {
  gmailTransport = transport;
}

function resetTransports() {
  resendOverride = null;
  gmailTransport = null;
}
/* ============================================================
   ✉️ Send Email (Resend Only)
   ============================================================ */
async function sendEmail({ to, subject, text, html }) {
  safeAuthLog(`sendEmail invoked for: ${to}`);

  const activeResend = resendOverride || resend;

  if (activeResend) {
    try {
      const fromAddress = process.env.EMAIL_FROM || "info@sadnaot.online";

      await activeResend.emails.send({
        from: fromAddress, // Must be your verified domain
        to,
        subject,
        html: html || `<p>${text}</p>`,
        text,
      });

      safeAuthLog("✅ sendEmail delivered via Resend");
      return true;
    } catch (err) {
      console.error(`❌ Resend failed: ${err.message}`);
    }
  }

  if (gmailTransport?.sendMail) {
    try {
      await gmailTransport.sendMail({
        to,
        subject,
        html: html || `<p>${text}</p>`,
        text,
      });
      safeAuthLog("✅ sendEmail delivered via Gmail transport");
      return true;
    } catch (err) {
      console.error("❌ Gmail transport failed:", err.message);
    }
  }

  // Fallback: Log locally for debugging if all transports fail
  const line = `[${new Date().toISOString()}] To: ${to} | Subject: ${subject} | Error: sendEmail transport missing or failed\n`;
  fs.appendFileSync(logFile, line);
  return false;
}

/* ============================================================
   🛠 Export Helpers (Fixed)
   ============================================================ */
exports.generateAccessToken = generateAccessToken;
exports.generateRefreshToken = generateRefreshToken;
exports.setRefreshCookie = setRefreshCookie;
exports.sendEmail = sendEmail;
exports.resolveClientBaseUrl = resolveClientBaseUrl;
exports.createPasswordResetArtifacts = createPasswordResetArtifacts;
exports.buildPasswordResetPayload = buildPasswordResetPayload;
exports.hashResetToken = hashResetToken;
exports.tokensMatch = tokensMatch;
exports.__test = {
  sendEmail,
  setResendInstance,
  setGmailTransport,
  resetTransports,
};

/* ============================================================
   👤 Register User
   ============================================================ */
exports.registerUser = async (req, res) => {
  safeAuthLog("registerUser invoked");
  try {
    const payload = normalizeRegistrationPayload(req.body);

    const role = "user";
    if (!payload.email && !payload.phone)
      return res.status(400).json({ message: "Email or phone is required" });

    const existing = await User.findOne({
      $or: [
        payload.email ? { email: payload.email } : null,
        payload.phone ? { phone: payload.phone } : null,
      ].filter(Boolean),
    });

    if (existing)
      return res.status(400).json({ message: "A user with this email or phone already exists" });

    const passwordHash = payload.password ? await bcrypt.hash(payload.password, 10) : null;

    const user = await User.create({
      name: payload.name,
      email: payload.email || null,
      phone: payload.phone || null,
      passwordHash,
      idNumber: payload.idNumber,
      birthDate: payload.birthDate,
      city: payload.city,
      canCharge: !!payload.canCharge,
      familyMembers: payload.familyMembers,
      hasPassword: !!payload.password,
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
   🧾 Two-Step Registration (Request + OTP Verify)
   ============================================================ */
const REGISTRATION_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const REGISTRATION_REQUEST_TTL_MS = 30 * 60 * 1000; // 30 minutes

exports.requestRegistration = async (req, res) => {
  safeAuthLog("requestRegistration invoked");
  try {
    const payload = normalizeRegistrationPayload(req.body);

    if (!payload.email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const existing = await User.findOne({
      $or: [
        payload.email ? { email: payload.email } : null,
        payload.phone ? { phone: payload.phone } : null,
      ].filter(Boolean),
    });

    if (existing) {
      return res.status(400).json({ message: "A user with this email or phone already exists" });
    }

    const passwordHash = payload.password ? await bcrypt.hash(payload.password, 10) : null;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + REGISTRATION_OTP_TTL_MS;
    const expiresAt = new Date(Date.now() + REGISTRATION_REQUEST_TTL_MS);

    const baseFields = {
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      idNumber: payload.idNumber,
      birthDate: payload.birthDate,
      city: payload.city,
      canCharge: payload.canCharge,
      familyMembers: payload.familyMembers,
    };

    let request = await RegistrationRequest.findOne({
      email: payload.email,
      status: "pending",
    }).select("+passwordHash +otpCode +otpExpires +otpAttempts");

    if (request) {
      Object.assign(request, baseFields);
    } else {
      request = new RegistrationRequest(baseFields);
    }

    request.passwordHash = passwordHash;
    request.otpCode = otp;
    request.otpExpires = otpExpires;
    request.otpAttempts = 0;
    request.status = "pending";
    request.expiresAt = expiresAt;
    request.meta = {
      ip: req.ip,
      userAgent: req.headers["user-agent"] || "",
    };

    await request.save();

    const emailResult = await emailService.sendEmail({
      to: payload.email,
      subject: "קוד אימות הרשמה - סדנאות כללית",
      text: `קוד האימות שלך הוא ${otp}. הקוד בתוקף ל-10 דקות.`,
      html: `
        <div dir="rtl" style="font-family:sans-serif; color: #1f2937;">
          <h2 style="color:#4F46E5;">אימות הרשמה</h2>
          <p>שלום ${payload.name || ""},</p>
          <p>להשלמת ההרשמה למערכת יש להזין את הקוד הבא:</p>
          <p style="font-size:24px; font-weight:bold; color:#111827;">${otp}</p>
          <p>הקוד בתוקף ל-10 דקות.</p>
          <hr style="border:none; border-top:1px solid #e5e7eb; margin:20px 0;" />
          <small style="color:#6b7280;">אם לא ביקשת הרשמה, ניתן להתעלם מהודעה זו.</small>
        </div>
      `,
    });

    if (!emailResult.success) {
      console.error("❌ Email Service Failed:", emailResult.error);
      return res.status(500).json({ message: "Failed to send OTP email." });
    }

    return res.status(202).json({
      success: true,
      message: "Registration accepted. Please enter the code sent to your email.",
      requestId: request._id,
    });
  } catch (e) {
    console.error("❌ requestRegistration error:", e);
    res.status(500).json({ message: "Server error during registration request." });
  }
};

exports.verifyRegistrationOtp = async (req, res) => {
  safeAuthLog("verifyRegistrationOtp invoked");
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const request = await RegistrationRequest.findOne({
      email,
      status: "pending",
    }).select("+passwordHash +otpCode +otpExpires +otpAttempts");

    if (!request) {
      return res.status(404).json({ message: "Registration request not found or already completed." });
    }

    const now = Date.now();
    if (request.expiresAt && request.expiresAt.getTime() < now) {
      request.status = "expired";
      await request.save();
      return res.status(400).json({ message: "Registration request expired. Please restart registration." });
    }

    if (!request.otpCode || !request.otpExpires || request.otpExpires < now) {
      request.status = "expired";
      request.otpCode = null;
      request.otpExpires = null;
      await request.save();
      return res.status(400).json({ message: "OTP expired. Please restart registration." });
    }

    if (String(request.otpCode).trim() !== otp) {
      request.otpAttempts = (request.otpAttempts || 0) + 1;
      await request.save();
      return res.status(400).json({ message: "Invalid OTP" });
    }

    const existing = await User.findOne({
      $or: [
        email ? { email } : null,
        request.phone ? { phone: request.phone } : null,
      ].filter(Boolean),
    });

    if (existing) {
      request.status = "consumed";
      request.userId = existing._id;
      request.otpCode = null;
      request.otpExpires = null;
      await request.save();
      return res.status(409).json({ message: "A user with this email or phone already exists" });
    }

    const user = await User.create({
      name: request.name,
      email: request.email,
      phone: request.phone || null,
      passwordHash: request.passwordHash || null,
      idNumber: request.idNumber,
      birthDate: request.birthDate,
      city: request.city,
      canCharge: request.canCharge,
      familyMembers: request.familyMembers || [],
      hasPassword: !!request.passwordHash,
      temporaryPassword: false,
      role: "user",
    });

    request.status = "verified";
    request.completedAt = new Date();
    request.otpCode = null;
    request.otpExpires = null;
    request.otpAttempts = 0;
    request.userId = user._id;
    await request.save();

    return res.status(201).json({
      success: true,
      message: "Registration confirmed.",
      user: sanitizeUserForResponse(user, user),
    });
  } catch (e) {
    console.error("❌ verifyRegistrationOtp error:", e);
    res.status(500).json({ message: "Server error verifying registration code." });
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
/* ============================================================
   ✉️ Send OTP
   ============================================================ */
exports.sendOtp = async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    
    // Assuming safeAuthLog is defined in this file
    if (typeof safeAuthLog === 'function') safeAuthLog("sendOtp invoked");

    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User with this email not found" });

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save to DB
    user.otpCode = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000; // 5 minutes
    user.otpAttempts = 0;
    await user.save();

    // 🔥 USE THE SHARED SERVICE HERE
    const result = await emailService.sendEmail({
      to: email,
      subject: "קוד אימות - סדנאות כללית",
      text: `קוד האימות שלך הוא ${otp}. הקוד בתוקף ל-5 דקות.`,
      html: `
        <div dir="rtl" style="font-family:sans-serif; color: #333;">
           <h2>קוד אימות</h2>
           <p>קוד האימות שלך הוא: <strong style="font-size: 24px; color: #4F46E5;">${otp}</strong></p>
           <p>הקוד בתוקף ל-5 דקות.</p>
           <hr style="border:none; border-top:1px solid #eee; margin: 20px 0;">
           <small style="color: #666;">אם לא ביקשת קוד זה, אנא התעלם מהודעה זו.</small>
        </div>
      `,
    });

    // Check success based on the service response structure
    if (!result.success) {
      console.error("❌ Email Service Failed:", result.error);
      return res.status(500).json({ message: "Failed to send OTP email." });
    }

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
