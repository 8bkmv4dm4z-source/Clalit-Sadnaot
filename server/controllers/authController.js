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
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { Resend } = require("resend");
const User = require("../models/User");

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
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "Strict" : "Lax",
    path: "/",
    maxAge: parseJwtExpToMs(process.env.JWT_REFRESH_EXPIRY || "7d"),
  });
  console.log(`🍪 refreshToken cookie set | secure=${isProd}`);
}

/* ============================================================
   📤 Email Transport — Resend primary, Gmail fallback
   ============================================================ */
const isProd = process.env.NODE_ENV === "production";
const isDev = !isProd;
const logFile = path.join(__dirname, "../../otp_log.csv");

let resend = null;
let gmailTransport = null;

/* ============================================================
   📡 Initialize Resend (Primary, HTTPS)
   ============================================================ */
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log("📩 Resend API initialized (primary transport).");
} else {
  console.warn("⚠️ Missing RESEND_API_KEY — Resend disabled.");
}

/* ============================================================
   📧 Optional Gmail Fallback (for local/dev)
   ============================================================ */
const allowGmail =
  process.env.USE_GMAIL === "true" && process.env.NODE_ENV !== "production";

if (allowGmail && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  gmailTransport = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  gmailTransport
    .verify()
    .then(() => console.log("📨 Gmail transporter verified as fallback."))
    .catch((err) =>
      console.warn("⚠️ Gmail transporter verification failed:", err.message)
    );
} else {
  console.log("✉️ Gmail fallback disabled (USE_GMAIL=false or production).");
}

/* ============================================================
   ✉️ Send Email (Resend → Gmail → Dev log)
   ============================================================ */
async function sendEmail({ to, subject, text, html }) {
  console.log("==> sendEmail called:", { to, subject });

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
        console.log(`📬 Resend sent email to ${to}`);
        return true;
      } catch (err) {
        console.warn(`⚠️ Resend failed: ${err.message}`);
      }
    }

    // 2️⃣ Fallback: Gmail (dev/local only)
    if (gmailTransport && !isProd) {
      await gmailTransport.sendMail({
        from:
          process.env.MAIL_FROM ||
          `"Clalit Workshops" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html: html || `<p>${text}</p>`,
      });
      console.log(`📧 Gmail fallback sent email to ${to}`);
      return true;
    }

    // 3️⃣ Final fallback: Log locally in dev
    if (isDev) {
      const line = `${new Date().toISOString()},${to},${text}\n`;
      fs.appendFileSync(logFile, line);
      console.log(`⚙️ [DEV] Logged email for ${to}: ${text}`);
      return true;
    }

    console.error("❌ No email transport available — message not sent");
    return false;
  } catch (err) {
    console.error("❌ Email send error:", err.message);
    return false;
  }
}

/* ============================================================
   👤 Register User
   ============================================================ */
exports.registerUser = async (req, res) => {
  console.log("==> registerUser called:", req.body);
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

    console.log("🔍 Existing user found?", !!existing);
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

    console.log("✅ User registered:", user.email);
    return res.status(201).json({
      success: true,
      message: "User registered successfully.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        city: user.city,
        idNumber: user.idNumber,
        birthDate: user.birthDate,
        canCharge: user.canCharge,
        role: user.role,
        familyMembers: user.familyMembers,
      },
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
  console.log("==> loginUser called:", req.body);
  try {
    const { email, password } = req.body;
    const user = await User.findOne({
      email: (email || "").toLowerCase().trim(),
    }).select("+passwordHash");

    console.log("🔍 User found?", !!user);
    if (!user)
      return res.status(400).json({ message: "Invalid email or password" });

    const match = await bcrypt.compare(password, user.passwordHash || "");
    console.log("🔐 Password match:", match);
    if (!match)
      return res.status(400).json({ message: "Invalid email or password" });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    user.refreshTokens.push({
      token: refreshToken,
      userAgent: req.headers["user-agent"] || "",
    });
    await user.save();
    setRefreshCookie(res, refreshToken);

    console.log("✅ Login successful:", email);
    return res.json({
      accessToken,
      user: { id: user._id, email: user.email, role: user.role, name: user.name },
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
    console.log("==> sendOtp called with body:", req.body);

    const email = (req.body?.email || "").trim().toLowerCase();
    console.log("📩 Normalized email:", email);

    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    console.log("🔍 User found:", !!user);

    if (!user)
      return res.status(404).json({ message: "User with this email not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`⚙️ Generated OTP for ${email}:`, otp);

    user.otpCode = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000;
    user.otpAttempts = 0;
    await user.save();
    console.log("✅ OTP saved to DB.");

    const sent = await sendEmail({
      to: email,
      subject: "Your verification code",
      text: `Your verification code is ${otp}. It expires in 5 minutes.`,
      html: `<p>Your verification code is <b>${otp}</b>. It expires in 5 minutes.</p>`,
    });
    console.log("📨 sendEmail result:", sent);

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
  console.log("==> verifyOtp called:", req.body);
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({
      email: (email || "").toLowerCase().trim(),
    }).select("+otpCode +otpExpires +otpAttempts");

    console.log("🔍 User found:", !!user);
    if (!user) return res.status(404).json({ message: "User not found." });

    // 🧭 Added: handle already verified user (no OTP left)
    if (!user.otpCode && !user.otpExpires) {
      console.warn("⚠️ OTP already consumed or not generated for:", email);
      return res.status(409).json({ message: "OTP already verified or missing." });
    }

    // Expired code
    if (!user.otpExpires || user.otpExpires < Date.now()) {
      console.warn("⚠️ OTP expired for:", email);
      user.otpCode = null;
      user.otpExpires = null;
      await user.save();
      return res.status(400).json({ message: "OTP expired." });
    }

    // Wrong code
    if (String(user.otpCode) !== String(otp)) {
      console.warn("❌ Invalid OTP for:", email);
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      await user.save();
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // ✅ Valid one-time OTP
    console.log("✅ OTP verified:", email);
    user.otpCode = null;
    user.otpExpires = null;
    await user.save();

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    user.refreshTokens.push({
      token: refreshToken,
      userAgent: req.headers["user-agent"] || "",
    });
    await user.save();

    setRefreshCookie(res, refreshToken);

    console.log("🎟️ Tokens issued for:", email);
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
exports.recoverPassword = async (req, res) => {
  console.log("==> recoverPassword called:", req.body);
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    console.log("🔍 User found:", !!user);
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log("⚙️ Recovery OTP generated:", otp);
    user.otpCode = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    user.otpAttempts = 0;
    await user.save();

    const sent = await sendEmail({
      to: email,
      subject: "Password Recovery",
      text: `Your recovery code is ${otp}. It expires in 10 minutes.`,
      html: `<p>Your recovery code is <b>${otp}</b>. It expires in 10 minutes.</p>`,
    });
    console.log("📨 Recovery email result:", sent);

    return res.json({ success: true, message: "Recovery OTP sent" });
  } catch (e) {
    console.error("❌ recoverPassword error:", e);
    res.status(500).json({ message: "Server error sending recovery OTP" });
  }
};

exports.resetPassword = async (req, res) => {
  console.log("==> resetPassword called:", req.body);
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword)
      return res
        .status(400)
        .json({ message: "email, otp, newPassword required" });

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+passwordHash +otpCode +otpExpires +otpAttempts");

    console.log("🔍 User found:", !!user);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.otpCode || !user.otpExpires || Date.now() > user.otpExpires) {
      console.warn("⚠️ OTP expired for reset:", email);
      return res.status(400).json({ message: "OTP expired" });
    }

    if (String(otp).trim() !== String(user.otpCode).trim()) {
      console.warn("❌ Invalid reset OTP for:", email);
      return res.status(400).json({ message: "Invalid OTP" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.hasPassword = true;
    user.temporaryPassword = false;
    user.otpCode = null;
    user.otpExpires = null;
    user.otpAttempts = 0;
    await user.save();
    console.log("✅ Password reset successful for:", email);

    return res.json({ success: true, message: "Password reset successfully" });
  } catch (e) {
    console.error("❌ resetPassword error:", e);
    res.status(500).json({ message: "Server error resetting password" });
  }
};

/* ============================================================
   👤 User Profile & Password Update
   ============================================================ */
exports.getUserProfile = async (req, res) => {
  console.log("==> getUserProfile called for:", req.user?._id);
  try {
    const user = await User.findById(req.user._id).select(
      "-passwordHash -otpCode"
    );
    console.log("🔍 Profile found:", !!user);
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json(user);
  } catch (e) {
    console.error("❌ getUserProfile error:", e);
    res.status(500).json({ message: "Server error retrieving profile." });
  }
};

exports.updatePassword = async (req, res) => {
  console.log("==> updatePassword called:", req.body);
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select("+passwordHash");
    console.log("🔍 User found:", !!user);
    if (!user) return res.status(404).json({ message: "User not found." });

    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    console.log("🔐 Current password match:", match);
    if (!match)
      return res.status(400).json({ message: "Current password incorrect." });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.hasPassword = true;
    user.temporaryPassword = false;
    await user.save();

    console.log("✅ Password updated successfully for:", user.email);
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
  console.log("==> refreshAccessToken called");
  try {
    const token = req.cookies?.refreshToken;
    console.log("🍪 Refresh token present?", !!token);
    if (!token) return res.status(401).json({ message: "No refresh token" });

    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(payload.id);
    console.log("🔍 User found for refresh:", !!user);
    if (!user) return res.status(404).json({ message: "User not found" });

    const session = user.refreshTokens.find((rt) => rt.token === token);
    console.log("🔐 Refresh session valid?", !!session);
    if (!session)
      return res.status(403).json({ message: "Refresh not recognized" });

    const newAccess = generateAccessToken(user);
    console.log("✅ New access token generated for:", user.email);
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
  console.log("==> logout called");
  try {
    const token = req.cookies?.refreshToken;
    console.log("🍪 Refresh token found?", !!token);

    const isProd = process.env.NODE_ENV === "production";
    const clearOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "Strict" : "Lax",
      path: "/",
    };

    // Always clear cookie first
    res.clearCookie("refreshToken", clearOptions);
    console.log("✅ Cleared refreshToken cookie.");

    if (token) {
      try {
        console.log("🧾 Verifying refresh token to remove from DB...");
        const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        const user = await User.findById(payload.id);
        if (user) {
          console.log("👤 User found for logout:", user.email);
          const before = user.refreshTokens.length;
          user.refreshTokens = user.refreshTokens.filter(
            (rt) => rt.token !== token
          );
          await user.save();
          console.log(
            `🧹 Removed refresh token from DB (${before} → ${user.refreshTokens.length})`
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

    console.log("✅ Logout successful — cookie cleared and session cleaned.");
    return res.json({ success: true });
  } catch (e) {
    console.error("❌ logout error:", e);
    res.status(500).json({ message: "Server error during logout" });
  }
};

/* ============================================================
   ✅ END OF FILE
   ============================================================ */
console.log("🧩 authController.js loaded successfully.");
