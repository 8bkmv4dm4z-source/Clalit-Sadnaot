/**
 * authController.js — Unified Auth + OTP Controller (Full Logs)
 * -------------------------------------------------------------
 * ✅ Primary email transport: Resend API (Render-friendly)
 * ✅ Fallback: Gmail App Password via Nodemailer (if USE_GMAIL=true)
 * ✅ Dev Mode: logs OTPs locally to otp_log.csv
 * ✅ Added full logs for every controller method for easy debugging
 */

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { Resend } = require("resend");
const User = require("../models/User");
const { sanitizeUserForResponse } = require("../utils/sanitizeUser");

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
  const sameSite = "Lax";
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
   📤 Email Transport — Resend primary, Gmail fallback
   ============================================================ */
const isProd = process.env.NODE_ENV === "production";
const isDev = !isProd;
const logFile = path.join(__dirname, "../../otp_log.csv");

let resend = null;
let gmailTransport = null;
let defaultResend = null;
let defaultGmailTransport = null;

const PASSWORD_RESET_TOKEN_MINUTES = Math.max(
  Number(process.env.PASSWORD_RESET_TOKEN_MINUTES || 30),
  5
);
const PASSWORD_RESET_TOKEN_TTL_MS = PASSWORD_RESET_TOKEN_MINUTES * 60 * 1000;
const DEFAULT_CLIENT_RESET_FALLBACK =
  process.env.CLIENT_RESET_FALLBACK || "http://localhost:5173";

function hashResetToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
}

// SECURITY NOTE: see README.md "Security Hardening Highlights" for context on
// hashed refresh tokens and compatibility behaviour.
function hashRefreshToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken || "")).digest("hex");
}

function tokensMatch(storedToken, candidateToken) {
  if (!storedToken || !candidateToken) return false;

  const stored = Buffer.from(String(storedToken));
  const candidateHashed = Buffer.from(hashRefreshToken(candidateToken));

  const safeEqual = (a, b) => {
    if (a.length !== b.length) return false;
    try {
      return crypto.timingSafeEqual(a, b);
    } catch (err) {
      console.warn("⚠️ timingSafeEqual failed:", err.message);
      return false;
    }
  };

  if (safeEqual(stored, candidateHashed)) return true;

  const candidateRaw = Buffer.from(String(candidateToken));
  return safeEqual(stored, candidateRaw);
}

function resolveClientBaseUrl(req) {
  const envUrl =
    process.env.PASSWORD_RESET_BASE_URL ||
    process.env.CLIENT_APP_URL ||
    process.env.PUBLIC_CLIENT_URL ||
    process.env.PUBLIC_URL ||
    process.env.FRONTEND_URL;

  if (envUrl) return envUrl.replace(/\/$/, "");

  const origin = req?.headers?.origin;
  if (origin) return origin.replace(/\/$/, "");

  const host = req?.get?.("host");
  if (host) {
    const proto =
      req?.headers?.["x-forwarded-proto"]?.split(",")[0]?.trim() ||
      req?.protocol ||
      "http";
    return `${proto}://${host}`.replace(/\/$/, "");
  }

  return DEFAULT_CLIENT_RESET_FALLBACK;
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

  const html = `<p>לקוח יקר/ה,</p>
    <p>בקשת לאיפוס סיסמה התקבלה עבור המשתמש <strong>${email}</strong>.</p>
    <p><a href="${resetUrl.toString()}" style="color:#2563eb;font-weight:bold;">לחצו כאן כדי לאפס את הסיסמה</a></p>
    <p>ניתן גם להקליד את הקוד החד-פעמי: <strong>${otp}</strong></p>
    <p>הקישור והקוד יהיו זמינים למשך ${prettyMinutes}. אם לא ביקשתם איפוס, ניתן להתעלם מהודעה זו.</p>`;

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
   📡 Initialize Resend (Primary, HTTPS)
   ============================================================ */
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log("📩 Resend API initialized (primary transport).");
} else {
  console.warn("⚠️ Missing RESEND_API_KEY — Resend disabled.");
}
defaultResend = resend;

/* ============================================================
   📧 Optional Gmail Fallback (for local/dev)
   ============================================================ */
const allowGmail = process.env.USE_GMAIL === "true";

if (allowGmail && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  gmailTransport = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  if (isProd) {
    console.log(
      "📨 Gmail fallback configured without verification (skipped in production)."
    );
  } else {
    const timeoutMs = Number(process.env.GMAIL_VERIFY_TIMEOUT_MS || 5000);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Verification timeout")), timeoutMs)
    );

    Promise.race([gmailTransport.verify(), timeout])
      .then(() =>
        console.log(
          `📨 Gmail transporter verified as fallback (${isProd ? "prod" : "dev"}).`
        )
      )
      .catch((err) =>
        console.warn("⚠️ Gmail transporter verification skipped:", err.message)
      );
  }
} else {
  const reason = allowGmail
    ? "missing EMAIL_USER/EMAIL_PASS"
    : "USE_GMAIL not set to true";
  console.log(`✉️ Gmail fallback disabled (${reason}).`);
}
defaultGmailTransport = gmailTransport;

/* ============================================================
   ✉️ Send Email (Resend → Gmail → Dev log)
   ============================================================ */
async function sendEmail({ to, subject, text, html }) {
  safeAuthLog("sendEmail invoked");

  try {
    // 1️⃣ Primary: Resend (works in production)
    if (resend) {
      try {
        await resend.emails.send({
          from:
            process.env.MAIL_FROM ||
            "Clalit Workshops <onboarding@resend.dev>",
          to,
          subject,
          html: html || `<p>${text}</p>`,
        });
        safeAuthLog("sendEmail delivered via Resend");
        return true;
      } catch (err) {
        console.warn(`⚠️ Resend failed: ${err.message}`);
      }
    }

    // 2️⃣ Fallback: Gmail (dev/local only)
    if (gmailTransport) {
      await gmailTransport.sendMail({
        from:
          process.env.MAIL_FROM ||
          `"Clalit Workshops" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html: html || `<p>${text}</p>`,
      });
      safeAuthLog("sendEmail delivered via Gmail fallback");
      return true;
    }

    // 3️⃣ Final fallback: Log locally in dev
    if (isDev) {
      const line = `${new Date().toISOString()},${to},${text}\n`;
      fs.appendFileSync(logFile, line);
      safeAuthLog("sendEmail logged locally");
      return true;
    }

    console.error("❌ No email transport available — message not sent");
    return false;
  } catch (err) {
    console.error("❌ Email send error:", err.message);
    return false;
  }
}

function setResendInstance(instance) {
  resend = instance;
}

function setGmailTransport(instance) {
  gmailTransport = instance;
}

function resetTransports() {
  resend = defaultResend;
  gmailTransport = defaultGmailTransport;
}

/* ============================================================
   👤 Register User
   ============================================================ */
exports.registerUser = async (req, res) => {
  // SECURITY FIX: removed raw payload logging during registration
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

    safeAuthLog(`registerUser existing=${existing ? "yes" : "no"}`);
    if (existing)
      return res
        .status(400)
        .json({ message: "A user with this email or phone already exists" });

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
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
  // SECURITY FIX: removed sensitive login payload logging
  safeAuthLog("loginUser invoked");
  try {
    const { email, password } = req.body;
    const user = await User.findOne({
      email: (email || "").toLowerCase().trim(),
    }).select("+passwordHash");

    safeAuthLog(`loginUser userFound=${user ? "yes" : "no"}`);
    if (!user)
      return res.status(400).json({ message: "Invalid email or password" });

    const match = await bcrypt.compare(password, user.passwordHash || "");
    safeAuthLog(`loginUser passwordMatch=${match ? "yes" : "no"}`);
    if (!match)
      return res.status(400).json({ message: "Invalid email or password" });

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
   ✉️ Send OTP (with full logs)
   ============================================================ */
exports.sendOtp = async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    safeAuthLog("sendOtp invoked");

    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    safeAuthLog(`sendOtp userFound=${user ? "yes" : "no"}`);

    if (!user)
      return res.status(404).json({ message: "User with this email not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.otpCode = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000;
    user.otpAttempts = 0;
    await user.save();
    safeAuthLog("sendOtp otpPersisted");

    const sent = await sendEmail({
      to: email,
      subject: "Your verification code",
      text: `Your verification code is ${otp}. It expires in 5 minutes.`,
      html: `<p>Your verification code is <b>${otp}</b>. It expires in 5 minutes.</p>`,
    });
    console.log("✅ OTP email sent to:", email, " | Code:", otp);
    safeAuthLog(`sendOtp dispatched=${sent ? "yes" : "no"}`);

    if (!sent)
      return res.status(500).json({ message: "Failed to send OTP email." });

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

    safeAuthLog(`verifyOtp userFound=${user ? "yes" : "no"}`);
    if (!user) return res.status(404).json({ message: "User not found." });

    // 🧭 Added: handle already verified user (no OTP left)
    if (!user.otpCode && !user.otpExpires) {
      console.warn("⚠️ OTP already consumed for account");
      return res.status(409).json({ message: "OTP already verified or missing." });
    }

    // Expired code
    if (!user.otpExpires || user.otpExpires < Date.now()) {
      console.warn("⚠️ OTP expired for account");
      user.otpCode = null;
      user.otpExpires = null;
      await user.save();
      return res.status(400).json({ message: "OTP expired." });
    }

    // Wrong code
    if (String(user.otpCode).trim() !== normalizedOtp) {
      console.warn("❌ Invalid OTP submitted");
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      await user.save();
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // ✅ Valid one-time OTP
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

    safeAuthLog("verifyOtp tokensIssued");
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
   🔁 Recover & Reset Password (with logs)
   ============================================================ */
async function handlePasswordResetRequest(req, res) {
  const emailRaw = req.body?.email;
  safeAuthLog("requestPasswordReset invoked");
  try {
    const email = (emailRaw || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email }).select(
      "+passwordResetTokenHash +passwordResetTokenExpires"
    );
    safeAuthLog(`requestPasswordReset userFound=${user ? "yes" : "no"}`);

    const genericResponse = {
      success: true,
      message: "אם החשבון קיים, נשלח קישור לאיפוס סיסמה. בדקו את תיבת המייל.",
    };

    if (!user) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return res.json(genericResponse);
    }

    const { otp, rawToken, hashedToken, expiresAt } =
      createPasswordResetArtifacts();

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
      subject: "Password reset instructions",
      text: payload.text,
      html: payload.html,
    });

    if (!sent) {
      console.warn("⚠️ Password reset email dispatch failed");
      return res
        .status(500)
        .json({ message: "Failed to send password reset email" });
    }

    safeAuthLog("requestPasswordReset dispatched");
    return res.json(genericResponse);
  } catch (e) {
    console.error("❌ requestPasswordReset error:", e);
    return res
      .status(500)
      .json({ message: "Server error sending reset instructions" });
  }
}

exports.recoverPassword = handlePasswordResetRequest;
exports.requestPasswordReset = handlePasswordResetRequest;

exports.resetPassword = async (req, res) => {
  safeAuthLog("resetPassword invoked");
  try {
    const { email, otp, newPassword, token } = req.body;
    if (!email || !newPassword) {
      return res
        .status(400)
        .json({ message: "email and newPassword required" });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select(
      "+passwordHash +otpCode +otpExpires +otpAttempts +passwordResetTokenHash +passwordResetTokenExpires"
    );

    safeAuthLog(`resetPassword userFound=${user ? "yes" : "no"}`);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const now = Date.now();
    let verified = false;

    if (token) {
      const normalizedToken = String(token).trim().toLowerCase();
      const hashed = hashResetToken(normalizedToken);
      if (
        !user.passwordResetTokenHash ||
        !user.passwordResetTokenExpires ||
        now > user.passwordResetTokenExpires
      ) {
        console.warn("⚠️ Reset token expired");
        return res.status(400).json({ message: "Reset token expired" });
      }
      if (hashed !== user.passwordResetTokenHash) {
        console.warn("❌ Invalid reset token");
        return res.status(400).json({ message: "Invalid reset token" });
      }
      verified = true;
    }

    if (!verified) {
      if (!otp) {
        return res.status(400).json({ message: "OTP or token required" });
      }
      if (!user.otpCode || !user.otpExpires || now > user.otpExpires) {
        console.warn("⚠️ OTP expired for reset");
        return res.status(400).json({ message: "OTP expired" });
      }
      if (String(otp).trim() !== String(user.otpCode).trim()) {
        console.warn("❌ Invalid reset OTP");
        return res.status(400).json({ message: "Invalid OTP" });
      }
      verified = true;
    }

    if (!verified) {
      return res.status(400).json({ message: "OTP or token required" });
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
    safeAuthLog("resetPassword succeeded");

    return res.json({ success: true, message: "Password reset successfully" });
  } catch (e) {
    console.error("❌ resetPassword error:", e);
    return res
      .status(500)
      .json({ message: "Server error resetting password" });
  }
};

/* ============================================================
   👤 User Profile & Password Update
   ============================================================ */
exports.getUserProfile = async (req, res) => {
  safeAuthLog("getUserProfile invoked");
  try {
    const user = await User.findById(req.user._id).select(
      "-passwordHash -otpCode"
    );
    safeAuthLog(`getUserProfile found=${user ? "yes" : "no"}`);
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json(sanitizeUserForResponse(user, req.user));
  } catch (e) {
    console.error("❌ getUserProfile error:", e);
    res.status(500).json({ message: "Server error retrieving profile." });
  }
};

exports.updatePassword = async (req, res) => {
  safeAuthLog("updatePassword invoked");
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select("+passwordHash");
    safeAuthLog(`updatePassword userFound=${user ? "yes" : "no"}`);
    if (!user) return res.status(404).json({ message: "User not found." });

    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    safeAuthLog(`updatePassword match=${match ? "yes" : "no"}`);
    if (!match)
      return res.status(400).json({ message: "Current password incorrect." });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.hasPassword = true;
    user.temporaryPassword = false;
    await user.save();

    safeAuthLog("updatePassword succeeded");
    res.json({ success: true, message: "Password updated successfully." });
  } catch (e) {
    console.error("❌ updatePassword error:", e);
    res.status(500).json({ message: "Server error updating password." });
  }
};

/* ============================================================
   🔁 Token Refresh & Logout
   ============================================================ */
exports.refreshAccessToken = async (req, res) => {
  safeAuthLog("refreshAccessToken invoked");
  try {
    const token = req.cookies?.refreshToken;
    safeAuthLog(`refreshAccessToken hasToken=${token ? "yes" : "no"}`);
    if (!token) return res.status(401).json({ message: "No refresh token" });

    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(payload.id);
    safeAuthLog(`refreshAccessToken userFound=${user ? "yes" : "no"}`);
    if (!user) return res.status(404).json({ message: "User not found" });

    const session = user.refreshTokens.find((rt) => tokensMatch(rt.token, token));
    safeAuthLog(`refreshAccessToken session=${session ? "yes" : "no"}`);
    if (!session)
      return res.status(403).json({ message: "Refresh not recognized" });

    const newAccess = generateAccessToken(user);
    safeAuthLog("refreshAccessToken issued");
    return res.json({ accessToken: newAccess });
  } catch (e) {
    console.error("❌ refreshAccessToken error:", e);
    res.status(500).json({ message: "Server error refreshing token" });
  }
};

/* ============================================================
   🚪 Logout (Full Logs)
   ============================================================ */
exports.logout = async (req, res) => {
  safeAuthLog("logout invoked");
  try {
    const token = req.cookies?.refreshToken;
    safeAuthLog(`logout hasToken=${token ? "yes" : "no"}`);

    const isProd = process.env.NODE_ENV === "production";
    const sameSite = "Lax";
    const clearOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite,
      path: "/",
    };

    // Always clear cookie first
    res.clearCookie("refreshToken", clearOptions);
    safeAuthLog("logout clearedCookie");

    if (token) {
      try {
        safeAuthLog("logout verifyingToken");
        const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        const user = await User.findById(payload.id);
        if (user) {
          const before = user.refreshTokens.length;
          user.refreshTokens = user.refreshTokens.filter(
            (rt) => !tokensMatch(rt.token, token)
          );
          await user.save();
          safeAuthLog(
            `logout tokenRemoved before=${before} after=${user.refreshTokens.length}`
          );
        } else {
          console.warn("⚠️ Logout: User not found for provided token.");
        }
      } catch (err) {
        console.warn("⚠️ Logout token verify failed:", err.message);
      }
    } else {
      console.warn("⚠️ No refresh token cookie to clear.");
    }

    safeAuthLog("logout completed");
    return res.json({ success: true });
  } catch (e) {
    console.error("❌ logout error:", e);
    res.status(500).json({ message: "Server error during logout" });
  }
};

/* ============================================================
   ✅ END OF FILE
   ============================================================ */
exports.__test = {
  sendEmail,
  setResendInstance,
  setGmailTransport,
  resetTransports,
};

safeAuthLog("authController loaded");
