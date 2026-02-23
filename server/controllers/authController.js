/**
 * authController.js — Unified Auth + OTP Controller (Resend Only)
 * -------------------------------------------------------------
 * ✅ Priority: Uses Resend (sadnaot.online) exclusively.
 * ✅ Logs: Keeps all your existing safeAuthLog logic.
 */

const jwt = require("jsonwebtoken");
const nodeCrypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Resend } = require("resend");
const User = require("../models/User");
const RegistrationRequest = require("../models/RegistrationRequest");
const emailService = require('../services/emailService');
const { safeAuditLog } = require("../services/SafeAuditLog");
const { logOtpLockout } = require("../services/SecurityEventLogger");
const { hashId } = require("../utils/hashId");
const { toOwnerUser } = require("../contracts/userContracts");
const { AuditEventTypes } = require("../services/AuditEventRegistry");
const {
  hashPassword,
  verifyPassword,
  upgradeHashIfNeeded,
  isBcryptHash,
} = require("../utils/passwordHasher");
const {
  tokensMatch,
  buildRefreshSession,
  normalizeRefreshSessions,
  rotateRefreshToken,
} = require("../services/refreshTokenService");
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

const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || "refreshToken";
const REFRESH_COOKIE_SAMESITE =
  process.env.REFRESH_COOKIE_SAMESITE || "Strict"; // prefer Strict, allow override to None/Lax if needed
const REFRESH_COOKIE_SECURE =
  process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
const ACCESS_COOKIE_NAME = process.env.ACCESS_COOKIE_NAME || "accessToken";
const ACCESS_COOKIE_SAMESITE =
  process.env.ACCESS_COOKIE_SAMESITE || REFRESH_COOKIE_SAMESITE;
const ACCESS_COOKIE_SECURE =
  process.env.ACCESS_COOKIE_SECURE === "true" || REFRESH_COOKIE_SECURE;
const REFRESH_TOKEN_CAP = Number(process.env.REFRESH_TOKEN_CAP || 5);
const OTP_SEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCK_MS = 10 * 60 * 1000;

const REQUIRED_ENV_VARS = [
  "JWT_SECRET",
  "JWT_EXPIRY",
  "JWT_REFRESH_SECRET",
  "JWT_REFRESH_EXPIRY",
  "PUBLIC_ID_SECRET",
];

const warnEnv = (message) => {
  if (process.env.NODE_ENV !== "test") {
    console.warn(message);
  }
};

function validateAuthEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (!process.env.REFRESH_COOKIE_NAME) {
    warnEnv(
      `Using default refresh cookie name "${REFRESH_COOKIE_NAME}". Set REFRESH_COOKIE_NAME to override.`
    );
  }

  if (!process.env.REFRESH_COOKIE_SAMESITE) {
    warnEnv("REFRESH_COOKIE_SAMESITE not set; defaulting to Strict.");
  }

  if (!process.env.REFRESH_COOKIE_SECURE && process.env.NODE_ENV !== "production") {
    warnEnv("REFRESH_COOKIE_SECURE not set; cookies will be secure in production by default.");
  }

  if (!process.env.CLIENT_URL && !process.env.PUBLIC_CLIENT_URL) {
    warnEnv("CLIENT_URL/Public client URL missing; password reset links will fallback to localhost.");
  }
}
validateAuthEnv();

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

function ensureJwtExpiry(envKey) {
  // P7: Tokens must be time-bound; issuing without exp is forbidden.
  const value = process.env[envKey];
  if (!value) throw new Error(`${envKey} missing`);
  if (!/^[0-9]+[smhd]$/i.test(value)) throw new Error(`${envKey} must be a duration string like 15m`);
  return value;
}

function generateAccessToken(user) {
  // JWTs remain identity-only; no roles/permissions allowed in claims.
  const expiresIn = ensureJwtExpiry("JWT_EXPIRY");
  const entityKey = resolveEntityKeyForJwt(user);
  return jwt.sign({ sub: entityKey, jti: createJti() }, process.env.JWT_SECRET, {
    expiresIn,
  });
}

function createJti() {
  if (typeof nodeCrypto.randomUUID === "function") return nodeCrypto.randomUUID();
  return nodeCrypto.randomBytes(16).toString("hex");
}

function generateRefreshToken(user) {
  // Refresh tokens follow the same expiry discipline to prevent immortal sessions.
  const expiresIn = ensureJwtExpiry("JWT_REFRESH_EXPIRY");
  const entityKey = resolveEntityKeyForJwt(user);
  return jwt.sign({ sub: entityKey, jti: createJti() }, process.env.JWT_REFRESH_SECRET, {
    expiresIn,
  });
}

function parseJwtExpToMs(exp) {
  const m = String(exp).match(/^(\d+)([smhd])$/i);
  if (!m) throw new Error("JWT expiry must include a numeric value and unit (s|m|h|d)");
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * map[unit];
}

const getRefreshTtlMs = () => parseJwtExpToMs(ensureJwtExpiry("JWT_REFRESH_EXPIRY"));
const REFRESH_TOKEN_TTL_MS = getRefreshTtlMs();

function setRefreshCookie(res, refreshToken) {
  const refreshExpiry = ensureJwtExpiry("JWT_REFRESH_EXPIRY");
  const cookieOptions = {
    httpOnly: true,
    secure: REFRESH_COOKIE_SECURE,
    sameSite: REFRESH_COOKIE_SAMESITE,
    path: "/",
    maxAge: parseJwtExpToMs(refreshExpiry),
  };

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, cookieOptions);
  safeAuthLog(`refreshToken cookie set | secure=${cookieOptions.secure} | sameSite=${cookieOptions.sameSite}`);
}

function setAccessCookie(res, accessToken) {
  const accessExpiry = ensureJwtExpiry("JWT_EXPIRY");
  const cookieOptions = {
    httpOnly: true,
    secure: ACCESS_COOKIE_SECURE,
    sameSite: ACCESS_COOKIE_SAMESITE,
    path: "/",
    maxAge: parseJwtExpToMs(accessExpiry),
  };

  res.cookie(ACCESS_COOKIE_NAME, accessToken, cookieOptions);
  safeAuthLog(`accessToken cookie set | secure=${cookieOptions.secure} | sameSite=${cookieOptions.sameSite}`);
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: REFRESH_COOKIE_SECURE,
    sameSite: REFRESH_COOKIE_SAMESITE,
    path: "/",
  });
}

function clearAccessCookie(res) {
  res.clearCookie(ACCESS_COOKIE_NAME, {
    httpOnly: true,
    secure: ACCESS_COOKIE_SECURE,
    sameSite: ACCESS_COOKIE_SAMESITE,
    path: "/",
  });
}

function pruneRefreshSessions(user, { now = new Date() } = {}) {
  if (!user) return { prunedExpired: 0, prunedCap: 0 };
  const { sessions, prunedExpired, prunedCap } = normalizeRefreshSessions(user.refreshTokens, {
    refreshTtlMs: REFRESH_TOKEN_TTL_MS,
    maxSessions: REFRESH_TOKEN_CAP,
    now,
  });
  user.refreshTokens = sessions;
  if (prunedExpired || prunedCap) {
    safeAuthLog(
      `refresh sessions pruned | expired=${prunedExpired} capped=${prunedCap} user=${user.entityKey || "unknown"}`
    );
  }
  return { prunedExpired, prunedCap };
}

function recordRefreshToken(user, rawToken, userAgent = "", { now = new Date() } = {}) {
  if (!user || !rawToken) return;
  const session = buildRefreshSession(rawToken, {
    userAgent,
    refreshTtlMs: REFRESH_TOKEN_TTL_MS,
    now,
  });
  user.refreshTokens = user.refreshTokens || [];
  user.refreshTokens.unshift(session);
  pruneRefreshSessions(user, { now });
}

/* ============================================================
   📤 Email Configuration (Resend Only)
   ============================================================ */
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
  return nodeCrypto.createHash("sha256").update(String(rawToken)).digest("hex");
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
  if (typeof nodeCrypto.randomUUID === "function") return nodeCrypto.randomUUID();

  const buf = nodeCrypto.randomBytes(16);
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
  const safeBody = { ...body };
  delete safeBody.role; // Explicitly discard any client-supplied role

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

async function sendRegistrationConfirmationEmail({ to, name }) {
  if (!to) return false;

  const recipientName = String(name || "").trim();
  const greeting = recipientName ? `שלום ${recipientName},` : "שלום,";

  const result = await emailService.sendEmail({
    to,
    subject: "ההרשמה הושלמה בהצלחה - סדנאות כללית",
    text:
      `${greeting}\n\n` +
      "ההרשמה שלך למערכת הושלמה בהצלחה.\n" +
      "כעת ניתן להתחבר ולהתחיל להשתמש בחשבון.\n\n" +
      "אם לא ביצעת הרשמה זו, מומלץ לעדכן סיסמה ולפנות לתמיכה.",
    html: `
      <div dir="rtl" style="font-family:sans-serif; color:#1f2937;">
        <h2 style="color:#0f766e;">ההרשמה הושלמה בהצלחה</h2>
        <p>${greeting}</p>
        <p>החשבון שלך נוצר בהצלחה וכעת ניתן להתחבר למערכת.</p>
        <p style="margin-top:16px;">אם לא ביצעת הרשמה זו, מומלץ לעדכן סיסמה ולפנות לתמיכה.</p>
      </div>
    `,
  });

  if (!result?.success) {
    console.warn("⚠️ Registration confirmation email dispatch failed:", result?.error || "unknown error");
    return false;
  }

  return true;
}

async function sendOtpEmailMessage({
  to,
  otp,
  ttlMinutes,
  subject,
  heading,
  greetingName = "",
  bodyLeadText = "יש להזין את הקוד הבא:",
}) {
  const greeting = greetingName ? `<p>שלום ${greetingName},</p>` : "";

  const result = await emailService.sendEmail({
    to,
    subject,
    text: `קוד האימות שלך הוא ${otp}. הקוד בתוקף ל-${ttlMinutes} דקות.`,
    html: `
      <div dir="rtl" style="font-family:sans-serif; color:#1f2937;">
        <h2 style="color:#4F46E5;">${heading}</h2>
        ${greeting}
        <p>${bodyLeadText}</p>
        <p style="font-size:24px; font-weight:bold; color:#111827;">${otp}</p>
        <p>הקוד בתוקף ל-${ttlMinutes} דקות.</p>
        <hr style="border:none; border-top:1px solid #e5e7eb; margin:20px 0;" />
        <small style="color:#6b7280;">אם לא ביקשת קוד זה, ניתן להתעלם מהודעה זו.</small>
      </div>
    `,
  });

  if (!result?.success) {
    console.error("❌ Email Service Failed:", result?.error || "unknown error");
    return false;
  }

  return true;
}

/* ============================================================
   🛠 Export Helpers (Fixed)
   ============================================================ */
exports.generateAccessToken = generateAccessToken;
exports.generateRefreshToken = generateRefreshToken;
exports.setRefreshCookie = setRefreshCookie;
exports.setAccessCookie = setAccessCookie;
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

    await sendRegistrationConfirmationEmail({
      to: user.email,
      name: user.name,
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

    const emailSent = await sendOtpEmailMessage({
      to: payload.email,
      otp,
      ttlMinutes: 10,
      subject: "קוד אימות הרשמה - סדנאות כללית",
      heading: "אימות הרשמה",
      greetingName: payload.name || "",
      bodyLeadText: "להשלמת ההרשמה למערכת יש להזין את הקוד הבא:",
    });

    if (!emailSent) {
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

    await sendRegistrationConfirmationEmail({
      to: user.email,
      name: user.name,
    });

    return res.status(201).json({
      success: true,
      message: "Registration confirmed.",
      user: toOwnerUser(user),
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
    recordRefreshToken(user, refreshToken, req.headers["user-agent"] || "");
    await user.save();
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);

    safeAuthLog("loginUser succeeded");
    return res.json({
      user: toOwnerUser(user),
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
        logOtpLockout(req, { subjectKey, reason: "otp_lockout_active" });
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
    const emailSent = await sendOtpEmailMessage({
      to: email,
      otp,
      ttlMinutes: 5,
      subject: "קוד אימות - סדנאות כללית",
      heading: "קוד אימות",
      bodyLeadText: "קוד האימות שלך הוא:",
    });

    if (!emailSent) {
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
    const subjectKey =
      user.entityKey || (user._id ? hashId("user", String(user._id)) : null);

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
          logOtpLockout(req, { subjectKey, reason: "otp_lockout", attempts: user.otpAttempts });
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
    recordRefreshToken(user, refreshToken, req.headers["user-agent"] || "");
    await user.save();

    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);

  return res.json({
    user: toOwnerUser(user),
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
    clearAccessCookie(res);
    clearRefreshCookie(res);

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
    // Self-profile endpoint must use the owner-facing contract to avoid admin-shaped payloads.
    res.json(toOwnerUser(user));
  } catch {
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
    clearAccessCookie(res);
    clearRefreshCookie(res);
    res.json({ success: true, message: "Password updated successfully." });
  } catch {
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
    if (!token) {
      clearAccessCookie(res);
      return res.status(401).json({ message: "No refresh token" });
    }

    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const entityKey = payload.sub || payload.entityKey; // entityKey fallback supports legacy tokens only
    if (!entityKey) {
      clearAccessCookie(res);
      clearRefreshCookie(res);
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    const user = await User.findOne({ entityKey }).select("+authorities");
    if (!user) return res.status(404).json({ message: "User not found" });

    const now = new Date();
    const lastPasswordChange = user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : null;
    if (lastPasswordChange) {
      const issuedAtMs = (payload.iat || 0) * 1000;
      if (issuedAtMs && issuedAtMs < lastPasswordChange) {
        user.refreshTokens = [];
        await user.save();
        clearAccessCookie(res);
        clearRefreshCookie(res);
        return res.status(403).json({ message: "Session invalidated. Please login again." });
      }
    }

    const rotated = rotateRefreshToken(user.refreshTokens, {
      token,
      newToken: generateRefreshToken(user),
      userAgent: req.headers["user-agent"] || "",
      refreshTtlMs: REFRESH_TOKEN_TTL_MS,
      maxSessions: REFRESH_TOKEN_CAP,
      now,
    });

    if (rotated.reuseDetected) {
      safeAuthLog(`🔴 refresh reuse detected | user=${user.entityKey || "unknown"}`);
      user.refreshTokens = [];
      await user.save();
      clearAccessCookie(res);
      clearRefreshCookie(res);
      return res.status(403).json({
        message: "Session invalidated. Please login again.",
      });
    }

    if (!rotated.sessions || rotated.sessions.length === 0) {
      user.refreshTokens = [];
      await user.save();
      clearAccessCookie(res);
      clearRefreshCookie(res);
      return res.status(401).json({ message: "Refresh session expired. Please login again." });
    }

    user.refreshTokens = rotated.sessions;
    const accessToken = generateAccessToken(user);
    await user.save();
    setAccessCookie(res, accessToken);
    if (rotated.newSession?.rawToken) {
      setRefreshCookie(res, rotated.newSession.rawToken);
    } else {
      clearRefreshCookie(res);
    }

    safeAuthLog(
      `🔄 refresh rotated | user=${user.entityKey || "unknown"} capped=${rotated.prunedCap || 0} expired=${rotated.prunedExpired || 0}`
    );

    return res.json({ success: true });
  } catch {
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
    
    clearAccessCookie(res);
    clearRefreshCookie(res);

    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        const entityKey = payload.sub || payload.entityKey; // legacy support
        const user = await User.findOne({ entityKey }).select(
          "+authorities"
        );
        if (user) {
          user.refreshTokens = user.refreshTokens.filter(
            (rt) => !tokensMatch(rt, token)
          );
          pruneRefreshSessions(user);
          await user.save();
        }
      } catch {
        // Token might be expired, just ignore
      }
    }
    return res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Server error during logout" });
  }
};
