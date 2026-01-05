/**
 * authController.js — Unified Auth + OTP Controller (Resend Only)
 * -------------------------------------------------------------
 * ✅ Priority: Uses Resend (sadnaot.online) exclusively.
 * ✅ Logs: Keeps all your existing safeAuthLog logic.
 */

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Resend } = require("resend");
const User = require("../models/User");
const RegistrationRequest = require("../models/RegistrationRequest");
const emailService = require('../services/emailService');
const { safeAuditLog } = require("../services/SafeAuditLog");
const { hashId } = require("../utils/hashId");
const { sanitizeUserForResponse: sanitizeUserForResponseScoped } = require("../utils/sanitizeUser");
const { AuditEventTypes } = require("../services/AuditEventRegistry");
const {
  hashPassword,
  verifyPassword,
  upgradeHashIfNeeded,
  isBcryptHash,
} = require("../utils/passwordHasher");
// SECURITY FIX: centralize sanitized logging for auth flows
const DEV_AUTH_LOG = process.env.NODE_ENV !== "production";
const safeAuthLog = (message) => {
  if (DEV_AUTH_LOG) {
    console.info(`[AUTH] ${message}`);
  }
};

// Enumeration-safe responses (OTP + registration flows)
const GENERIC_OTP_SEND_RESPONSE = Object.freeze({
  success: true,
  message: "If the account is eligible, a verification code has been sent.",
});

const GENERIC_OTP_VERIFY_FAILURE = Object.freeze({
  message: "Invalid or expired verification code. Request a new code and try again.",
});

const GENERIC_REGISTRATION_ACCEPTED = Object.freeze({
  success: true,
  message: "If the registration is eligible, we started verification. Check your email for next steps.",
});

const GENERIC_REGISTRATION_VERIFY_FAILURE = Object.freeze({
  message: "Registration could not be completed. Request a new code or use password reset if you already have an account.",
});

const enumerationDelay = () =>
  new Promise((resolve) => setTimeout(resolve, 150 + Math.floor(Math.random() * 200)));

const REFRESH_COOKIE_NAME = "refreshToken";
const REFRESH_COOKIE_SAMESITE =
  process.env.REFRESH_COOKIE_SAMESITE || "Strict"; // prefer Strict, allow override to None/Lax if needed
const REFRESH_COOKIE_SECURE =
  process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
const REFRESH_TOKEN_CAP = Number(process.env.REFRESH_TOKEN_CAP || 5);
const OTP_SEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCK_MS = 10 * 60 * 1000;

/* ============================================================
   🔐 JWT Helpers
   ============================================================ */
function resolveEntityKeyForJwt(user) {
  if (!user) throw new Error("Missing user for token generation");

  // Persist the canonical entityKey on the user document if it exists only as a hashedId.
  const key =
    user.entityKey ||
    user.hashedId ||
    (user._id ? hashId("user", String(user._id)) : null);

  if (!key) throw new Error("Missing entityKey for token generation");

  if (!user.entityKey) user.entityKey = key;
  if (!user.hashedId) user.hashedId = key;

  return key;
}

function generateAccessToken(user) {
  const expiresIn = process.env.JWT_EXPIRY || "15m";
  const entityKey = resolveEntityKeyForJwt(user);
  return jwt.sign({ sub: entityKey, entityKey }, process.env.JWT_SECRET, {
    expiresIn,
  });
}

function createJti() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function generateRefreshToken(user) {
  const expiresIn = process.env.JWT_REFRESH_EXPIRY || "7d";
  const entityKey = resolveEntityKeyForJwt(user);
  return jwt.sign({ sub: entityKey, entityKey, jti: createJti() }, process.env.JWT_REFRESH_SECRET, {
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

const REFRESH_TOKEN_TTL_MS = parseJwtExpToMs(process.env.JWT_REFRESH_EXPIRY || "7d");

function setRefreshCookie(res, refreshToken) {
  const cookieOptions = {
    httpOnly: true,
    secure: REFRESH_COOKIE_SECURE,
    sameSite: REFRESH_COOKIE_SAMESITE,
    path: "/",
    maxAge: parseJwtExpToMs(process.env.JWT_REFRESH_EXPIRY || "7d"),
  };

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, cookieOptions);
  safeAuthLog(`refreshToken cookie set | secure=${cookieOptions.secure} | sameSite=${cookieOptions.sameSite}`);
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: REFRESH_COOKIE_SECURE,
    sameSite: REFRESH_COOKIE_SAMESITE,
    path: "/",
  });
}

function pruneRefreshSessions(user) {
  if (!user || !Array.isArray(user.refreshTokens)) return;
  const now = Date.now();

  const filtered = user.refreshTokens
    .filter((rt) => {
      if (!rt?.token) return false;
      const createdAt = rt.createdAt ? new Date(rt.createdAt).getTime() : 0;
      if (!createdAt) return true; // keep if timestamp missing to avoid accidental lockouts
      return now - createdAt < REFRESH_TOKEN_TTL_MS;
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  user.refreshTokens = filtered.slice(0, REFRESH_TOKEN_CAP);
}

function recordRefreshToken(user, hashedToken, userAgent = "") {
  if (!user || !hashedToken) return;
  user.refreshTokens = user.refreshTokens || [];
  user.refreshTokens.unshift({
    token: hashedToken,
    userAgent,
    createdAt: new Date(),
  });
  pruneRefreshSessions(user);
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

function buildPasswordResetPayload({ baseUrl, email, token, minutes }) {
  const resetUrl = new URL("/resetpassword", baseUrl);
  resetUrl.searchParams.set("token", token);

  const prettyMinutes = minutes >= 60
    ? `${Math.round(minutes / 60)} שעות`
    : `${minutes} דקות`;

  const text =
    `קישור מאובטח לאיפוס סיסמה: ${resetUrl.toString()}\n\n` +
    `לצורך אבטחה תתבקש/י לאמת את מספר הטלפון המשויך לחשבון. אין צורך בקוד OTP או בהעתקת אסימונים מהקישור.\n\n` +
    `הקישור יהיה זמין למשך ${prettyMinutes}. אם לא ביקשת איפוס, ניתן להתעלם מהודעה זו.`;

  const html = `<div dir="rtl" style="text-align:right; font-family:sans-serif;">
    <p>לקוח יקר/ה,</p>
    <p>בקשה לאיפוס סיסמה התקבלה עבור המשתמש <strong>${email}</strong>.</p>
    <p><a href="${resetUrl.toString()}" style="color:#2563eb;font-weight:bold;">לחצו כאן כדי לאפס את הסיסמה</a></p>
    <p>במסך האיפוס נבקש לאשר את מספר הטלפון המשויך לחשבון לצורך אימות זהות. אין צורך בהזנת OTP.</p>
    <p>הקישור יהיה זמין למשך ${prettyMinutes}. אם לא ביקשתם איפוס, ניתן להתעלם מהודעה זו.</p>
    </div>`;

  return { text, html, resetUrl: resetUrl.toString() };
}

function generateResetToken() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const buf = crypto.randomBytes(16);
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;

  const hex = buf.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`;
}

function createPasswordResetArtifacts() {
  const rawToken = generateResetToken();
  const hashedToken = hashResetToken(rawToken);
  const expiresAt = Date.now() + PASSWORD_RESET_TOKEN_TTL_MS;
  return { rawToken, hashedToken, expiresAt };
}

const normalizeDigits = (value = "") => String(value || "").replace(/\D/g, "");
function sanitizeUserForResponse(user, loggedInUser) {
  return sanitizeUserForResponseScoped(user, loggedInUser, { scope: "profile" });
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
  const { role, ...safeBody } = body; // Explicitly discard any client-supplied role

  const normalizedEmail = String(safeBody.email || "").trim().toLowerCase();
  const normalizedPhone = String(safeBody.phone || "").trim();
  const normalizedCity = String(safeBody.city || "").trim();

  const payload = {
    name: String(safeBody.name || "").trim(),
    email: normalizedEmail,
    password: safeBody.password,
    phone: normalizedPhone,
    idNumber: String(safeBody.idNumber || "").trim(),
    birthDate: safeBody.birthDate || "",
    city: normalizedCity,
    canCharge: !!safeBody.canCharge,
  };

  payload.familyMembers = normalizeFamilyMembers(safeBody.familyMembers, {
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
exports.pruneRefreshSessions = pruneRefreshSessions;
exports.recordRefreshToken = recordRefreshToken;
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
  pruneRefreshSessions,
  recordRefreshToken,
};

/* ============================================================
   👤 Register User
   ============================================================ */
/**
 * Identity:
 *   - Creates new principals and issues entityKey-based authentication tokens.
 * Storage:
 *   - Uses Mongo _id only after creation for linking registration requests; not for auth.
 * Notes:
 *   - Enumeration-safe responses avoid leaking whether _id exists.
 */
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

    if (existing) {
      await enumerationDelay();
      return res.status(202).json(GENERIC_REGISTRATION_ACCEPTED);
    }

    const passwordHash = payload.password ? await hashPassword(payload.password) : null;

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

    await safeAuditLog({
      eventType: AuditEventTypes.USER_REGISTERED,
      subjectType: "user",
      subjectKey: user.entityKey,
      actorKey: user.entityKey,
      metadata: { source: "self_signup" },
    });

    safeAuthLog("registerUser succeeded");
    return res.status(202).json(GENERIC_REGISTRATION_ACCEPTED);
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

/**
 * Identity:
 *   - Starts registration tied to email/entityKey flow; no _id-based auth decisions.
 * Storage:
 *   - Persists request documents with Mongo _id internally while keeping responses opaque.
 * Notes:
 *   - Enumeration-safe responses prevent leaking account existence.
 */
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
      await enumerationDelay();
      return res.status(202).json(GENERIC_REGISTRATION_ACCEPTED);
    }

    const passwordHash = payload.password ? await hashPassword(payload.password) : null;
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

    const now = Date.now();

    if (request) {
      if (request.meta?.otpLastSent && now - request.meta.otpLastSent < OTP_SEND_COOLDOWN_MS) {
        return res.status(429).json({ message: "Please wait before requesting another code." });
      }
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

    request.meta = {
      ...(request.meta || {}),
      ip: req.ip,
      userAgent: req.headers["user-agent"] || "",
      otpLastSent: now,
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

    return res.status(202).json(GENERIC_REGISTRATION_ACCEPTED);
  } catch (e) {
    console.error("❌ requestRegistration error:", e);
    res.status(500).json({ message: "Server error during registration request." });
  }
};

/**
 * Identity:
 *   - Completes registration via email/OTP, issuing entityKey-backed records.
 * Storage:
 *   - Uses Mongo _id to persist new user and link to registration request only after OTP validation.
 * Notes:
 *   - Keeps responses opaque; no ObjectIds returned to clients.
 */
exports.verifyRegistrationOtp = async (req, res) => {
  safeAuthLog("verifyRegistrationOtp invoked");
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();

    if (!email || !otp) {
      await enumerationDelay();
      return res.status(400).json(GENERIC_REGISTRATION_VERIFY_FAILURE);
    }

    const request = await RegistrationRequest.findOne({
      email,
      status: "pending",
    }).select("+passwordHash +otpCode +otpExpires +otpAttempts");

    if (!request) {
      await enumerationDelay();
      return res.status(400).json(GENERIC_REGISTRATION_VERIFY_FAILURE);
    }

    const now = Date.now();
    if (request.expiresAt && request.expiresAt.getTime() < now) {
      request.status = "expired";
      await request.save();
      await enumerationDelay();
      return res.status(400).json(GENERIC_REGISTRATION_VERIFY_FAILURE);
    }

    if (!request.otpCode || !request.otpExpires || request.otpExpires < now) {
      request.status = "expired";
      request.otpCode = null;
      request.otpExpires = null;
      await request.save();
      await enumerationDelay();
      return res.status(400).json(GENERIC_REGISTRATION_VERIFY_FAILURE);
    }

    if (String(request.otpCode).trim() !== otp) {
      request.otpAttempts = (request.otpAttempts || 0) + 1;
      await request.save();
      await enumerationDelay();
      return res.status(400).json(GENERIC_REGISTRATION_VERIFY_FAILURE);
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
      await enumerationDelay();
      return res.status(400).json(GENERIC_REGISTRATION_VERIFY_FAILURE);
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
/**
 * Identity:
 *   - Authenticates via email/password and issues tokens keyed by entityKey.
 * Storage:
 *   - Uses Mongo _id only for persistence (refresh tokens, role hashes) after login.
 * Notes:
 *   - Does not expose _id; relies on entityKey/hashedId for JWT subjects.
 */
exports.loginUser = async (req, res) => {
  safeAuthLog("loginUser invoked");
  try {
    const { email, password } = req.body;
    const user = await User.findOne({
      email: (email || "").toLowerCase().trim(),
    }).select("+passwordHash +authorities");

    if (!user) return res.status(400).json({ message: "Invalid email or password" });

    const match = await verifyPassword(password, user.passwordHash || "");
    if (!match) return res.status(400).json({ message: "Invalid email or password" });

    if (isBcryptHash(user.passwordHash || "")) {
      await upgradeHashIfNeeded(user, password, user.passwordHash);
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    recordRefreshToken(user, hashRefreshToken(refreshToken), req.headers["user-agent"] || "");
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
/**
 * Identity:
 *   - Authenticates OTP requests by email and logs against entityKey/hashedId.
 * Storage:
 *   - Uses Mongo _id only to derive hash fallback for logging; no access control depends on it.
 * Notes:
 *   - Enumeration-safe responses keep account existence concealed.
 */
exports.sendOtp = async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    
    // Assuming safeAuthLog is defined in this file
    if (typeof safeAuthLog === 'function') safeAuthLog("sendOtp invoked");

    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email }).select("+otpLastSent +otpLockUntil +otpAttempts");
    if (!user) {
      await enumerationDelay();
      return res.json(GENERIC_OTP_SEND_RESPONSE);
    }

    const now = Date.now();
    const subjectKey =
      user.entityKey || (user._id ? hashId("user", String(user._id)) : null);

    if (user.otpLockUntil && user.otpLockUntil > now) {
      if (subjectKey) {
        await safeAuditLog({
          eventType: AuditEventTypes.SECURITY,
          subjectType: "user",
          subjectKey,
          actorKey: subjectKey,
          metadata: { reason: "otp_lockout_active" },
        });
      }
      return res.status(429).json({ message: "Too many OTP attempts. Try again later." });
    }

    if (user.otpLastSent && now - user.otpLastSent < OTP_SEND_COOLDOWN_MS) {
      return res.status(429).json({ message: "Please wait before requesting another code." });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save to DB
    user.otpCode = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000; // 5 minutes
    user.otpAttempts = 0;
    user.otpLastSent = now;
    user.otpLockUntil = 0;
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

    return res.json(GENERIC_OTP_SEND_RESPONSE);

  } catch (e) {
    console.error("❌ sendOtp error:", e);
    res.status(500).json({ message: "Failed to send OTP." });
  }
};

/* ============================================================
   ✅ Verify OTP
   ============================================================ */
/**
 * Identity:
 *   - Validates OTP for entityKey-bearing users; subjectKey uses entityKey/hash for auditing.
 * Storage:
 *   - Uses Mongo _id only inside user lookup and audit logging after validation.
 * Notes:
 *   - Tokens issued afterward rely on entityKey, not _id.
 */
exports.verifyOtp = async (req, res) => {
  safeAuthLog("verifyOtp invoked");
  try {
    const { email, otp } = req.body;
    const normalizedEmail = (email || "").toLowerCase().trim();
    const normalizedOtp = String(otp ?? "").trim();

    if (!normalizedEmail || !normalizedOtp) {
      await enumerationDelay();
      return res.status(400).json(GENERIC_OTP_VERIFY_FAILURE);
    }

  const user = await User.findOne({
    email: normalizedEmail,
  }).select("+otpCode +otpExpires +otpAttempts +otpLockUntil +otpLastSent +authorities");

    if (!user) {
      await enumerationDelay();
      return res.status(400).json(GENERIC_OTP_VERIFY_FAILURE);
    }

    const now = Date.now();
    if (user.otpLockUntil && user.otpLockUntil > now) {
      return res.status(429).json({ message: "Too many OTP attempts. Try again later." });
    }

    // Handle consumed/missing OTP
    if (!user.otpCode && !user.otpExpires) {
      await enumerationDelay();
      return res.status(400).json(GENERIC_OTP_VERIFY_FAILURE);
    }

    // Expired
    if (!user.otpExpires || user.otpExpires < Date.now()) {
      user.otpCode = null;
      user.otpExpires = null;
      await user.save();
      await enumerationDelay();
      return res.status(400).json(GENERIC_OTP_VERIFY_FAILURE);
    }

    // Wrong code
    if (String(user.otpCode).trim() !== normalizedOtp) {
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
        user.otpLockUntil = now + OTP_LOCK_MS;
        user.otpCode = null;
        user.otpExpires = null;
        if (subjectKey) {
          await safeAuditLog({
            eventType: AuditEventTypes.SECURITY,
            subjectType: "user",
            subjectKey,
            actorKey: subjectKey,
            metadata: { reason: "otp_lockout", attempts: user.otpAttempts },
          });
        }
      }
      await user.save();
      await enumerationDelay();
      return res.status(400).json(GENERIC_OTP_VERIFY_FAILURE);
    }

    // Valid
    safeAuthLog("verifyOtp succeeded");
    user.otpCode = null;
    user.otpExpires = null;
    await user.save();

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    recordRefreshToken(user, hashRefreshToken(refreshToken), req.headers["user-agent"] || "");
    await user.save();

    setRefreshCookie(res, refreshToken);

  return res.json({
    accessToken,
    user: sanitizeUserForResponse(user, user),
  });
  } catch (e) {
    console.error("❌ verifyOtp error:", e);
    res.status(500).json({ message: "Server error verifying code." });
  }
};

/* ============================================================
   🔁 Recover & Reset Password
   ============================================================ */
/**
 * Identity:
 *   - Initiates reset using email and entityKey-derived tokens; no _id-based auth.
 * Storage:
 *   - Stores hashed reset token tied to Mongo _id internally.
 * Notes:
 *   - Responses remain generic to avoid leaking account presence.
 */
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

    const { rawToken, hashedToken, expiresAt } = createPasswordResetArtifacts();

    user.otpCode = null;
    user.otpExpires = 0;
    user.otpAttempts = 0;
    user.passwordResetTokenHash = hashedToken;
    user.passwordResetTokenExpires = expiresAt;
    user.passwordResetTokenIssuedAt = new Date();
    await user.save();

    const baseUrl = resolveClientBaseUrl(req);
    const payload = buildPasswordResetPayload({
      baseUrl,
      email,
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

/**
 * Identity:
 *   - Validates reset tokens derived from entityKey/hashed identifiers; no _id-based auth.
 * Storage:
 *   - Uses Mongo _id internally to locate and update the user record once token verified.
 * Notes:
 *   - Keeps responses opaque and clears reset tokens post-use.
 */
exports.resetPassword = async (req, res) => {
  safeAuthLog("resetPassword invoked");
  try {
    const { newPassword, token, phoneAnswer } = req.body || {};
    if (!newPassword || !token || !phoneAnswer) {
      return res
        .status(400)
        .json({ message: "Token, phone verification, and new password are required" });
    }

    const hashedToken = hashResetToken(String(token).trim());
    const user = await User.findOne({
      passwordResetTokenHash: hashedToken,
    }).select(
      "+passwordHash +otpCode +otpExpires +otpAttempts +passwordResetTokenHash +passwordResetTokenExpires"
    );

    if (!user) {
      return res.status(400).json({ message: "Invalid reset token" });
    }

    const now = Date.now();
    if (!user.passwordResetTokenExpires || now > user.passwordResetTokenExpires) {
      return res.status(400).json({ message: "Reset token expired" });
    }

    const providedDigits = normalizeDigits(phoneAnswer);
    const userDigits = normalizeDigits(user.phone);
    const expected = userDigits ? userDigits.slice(-Math.min(4, userDigits.length)) : "";
    if (!expected) {
      return res
        .status(400)
        .json({ message: "Phone verification unavailable for this account. Contact support." });
    }
    if (!providedDigits || providedDigits.slice(-expected.length) !== expected) {
      return res.status(400).json({ message: "Phone verification failed" });
    }

    user.passwordHash = await hashPassword(newPassword);
    user.hasPassword = true;
    user.temporaryPassword = false;
    user.passwordChangedAt = new Date();
    user.refreshTokens = [];
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
/**
 * Identity:
 *   - Requires authenticated principal via entityKey-bearing JWT.
 * Storage:
 *   - Looks up user by entityKey; Mongo _id stays internal.
 * Notes:
 *   - Responds with sanitized profile without exposing ObjectIds.
 */
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findOne({ entityKey: req.user.entityKey }).select("-passwordHash -otpCode");
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json(sanitizeUserForResponse(user, req.user));
  } catch (e) {
    res.status(500).json({ message: "Server error retrieving profile." });
  }
};

/**
 * Identity:
 *   - Authenticated users update their own password using entityKey from JWT.
 * Storage:
 *   - Uses Mongo _id implicitly via entityKey lookup and persists hashed password.
 * Notes:
 *   - Does not expose _id; verifies current password before mutation.
 */
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findOne({ entityKey: req.user.entityKey }).select("+passwordHash");
    if (!user) return res.status(404).json({ message: "User not found." });

    const match = await verifyPassword(currentPassword, user.passwordHash);
    if (!match) return res.status(400).json({ message: "Current password incorrect." });

    user.passwordHash = await hashPassword(newPassword);
    user.hasPassword = true;
    user.temporaryPassword = false;
    user.passwordChangedAt = new Date();
    user.refreshTokens = [];
    await user.save();
    res.json({ success: true, message: "Password updated successfully." });
  } catch (e) {
    res.status(500).json({ message: "Server error updating password." });
  }
};

/* ============================================================
   🔁 Token Refresh & Logout
   ============================================================ */
/**
 * Identity:
 *   - Refreshes access tokens using entityKey as JWT subject.
 * Storage:
 *   - Uses Mongo _id only when pruning refresh token arrays after validation.
 * Notes:
 *   - Rejects tokens without entityKey subjects; keeps ObjectIds out of responses.
 */
exports.refreshAccessToken = async (req, res) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) return res.status(401).json({ message: "No refresh token" });

    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const entityKey = payload.sub || payload.entityKey;
    if (!entityKey) {
      clearRefreshCookie(res);
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    const user = await User.findOne({ entityKey }).select(
      "+authorities"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.passwordChangedAt) {
      const issuedAtMs = (payload.iat || 0) * 1000;
      if (issuedAtMs && issuedAtMs < new Date(user.passwordChangedAt).getTime()) {
        user.refreshTokens = [];
        await user.save();
        clearRefreshCookie(res);
        return res.status(403).json({ message: "Session invalidated. Please login again." });
      }
    }

    const session = user.refreshTokens.find((rt) => tokensMatch(rt.token, token));
    if (!session) {
      // Reuse detection: presented token is valid JWT but not in the persisted family.
      user.refreshTokens = [];
      await user.save();
      clearRefreshCookie(res);
      return res.status(403).json({
        message: "Session invalidated. Please login again.",
      });
    }

    // Rotate refresh token: remove the old one, add a new hash, and return new access.
    const accessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);
    const hashedNew = hashRefreshToken(newRefreshToken);

    user.refreshTokens = user.refreshTokens.filter((rt) => !tokensMatch(rt.token, token));
    recordRefreshToken(user, hashedNew, req.headers["user-agent"] || "");
    await user.save();
    setRefreshCookie(res, newRefreshToken);

    return res.json({ accessToken });
  } catch (e) {
    res.status(500).json({ message: "Server error refreshing token" });
  }
};

/**
 * Identity:
 *   - Logs out the entityKey-authenticated user by clearing refresh token lineage.
 * Storage:
 *   - Uses Mongo _id only via entityKey lookup to mutate stored refresh tokens.
 * Notes:
 *   - Clears cookie regardless of lookup outcome to avoid leaking token validity.
 */
exports.logout = async (req, res) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    
    clearRefreshCookie(res);

    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        const entityKey = payload.sub || payload.entityKey;
        const user = await User.findOne({ entityKey }).select(
          "+authorities"
        );
        if (user) {
          user.refreshTokens = user.refreshTokens.filter(
            (rt) => !tokensMatch(rt.token, token)
          );
          pruneRefreshSessions(user);
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
