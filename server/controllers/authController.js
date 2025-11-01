/**
 * authController.js — Unified Auth + OTP Controller
 * -------------------------------------------------
 * ✅ Primary email transport: Resend API (HTTPS-based, Render-friendly)
 * ✅ Fallback: Gmail App Password via Nodemailer
 * ✅ Dev Mode: logs OTPs locally to otp_log.csv
 */

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { Resend } = require("resend");
const User = require("../models/User");

/* ============================================================
   🔐 JWT helpers
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
  console.log(`✅ refreshToken cookie set | secure=${isProd}`);
}

/* ============================================================
   📤 Email Transport — Resend primary, Gmail fallback
   ============================================================ */
const isDev = process.env.NODE_ENV !== "production";
const logFile = path.join(__dirname, "../../otp_log.csv");

// --- Initialize Resend ---
let resend = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log("📩 Resend API initialized.");
} else {
  console.warn("⚠️ Missing RESEND_API_KEY — Resend disabled.");
}

// --- Optional Gmail fallback ---
let gmailTransport = null;
const allowGmail =
  process.env.USE_GMAIL === "true" &&
  process.env.NODE_ENV !== "production";

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
}

/**
 * Send an email (Resend → fallback Gmail → log)
 */
async function sendEmail({ to, subject, text, html }) {
  try {
    if (isDev) {
      const line = `${new Date().toISOString()},${to},${text}\n`;
      fs.appendFileSync(logFile, line);
      console.log(`⚙️ [DEV] Logged email for ${to}: ${text}`);
      return true;
    }

    // 1️⃣ Try Resend
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

    // 2️⃣ Try Gmail fallback
    if (gmailTransport) {
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
    console.error("registerUser error:", e);
    res.status(500).json({ message: "Server error during registration." });
  }
};

/* ============================================================
   🔑 Login User
   ============================================================ */
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({
      email: (email || "").toLowerCase().trim(),
    }).select("+passwordHash");
    if (!user)
      return res.status(400).json({ message: "Invalid email or password" });

    const match = await bcrypt.compare(password, user.passwordHash || "");
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

    return res.json({
      accessToken,
      user: { id: user._id, email: user.email, role: user.role, name: user.name },
    });
  } catch (e) {
    console.error("login error:", e);
    res.status(500).json({ message: "Server error during login" });
  }
};

/* ============================================================
   ✉️ Send OTP
   ============================================================ */
exports.sendOtp = async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "User with this email not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otpCode = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000;
    user.otpAttempts = 0;
    await user.save();

    await sendEmail({
      to: email,
      subject: "Your verification code",
      text: `Your verification code is ${otp}. It expires in 5 minutes.`,
      html: `<p>Your verification code is <b>${otp}</b>. It expires in 5 minutes.</p>`,
    });

    return res.json({ success: true, message: "OTP sent successfully." });
  } catch (e) {
    console.error("sendOtp error:", e);
    res.status(500).json({ message: "Failed to send OTP." });
  }
};

/* ============================================================
   ✅ Verify OTP
   ============================================================ */
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({
      email: (email || "").toLowerCase().trim(),
    }).select("+otpCode +otpExpires +otpAttempts");
    if (!user) return res.status(404).json({ message: "User not found." });

    if (!user.otpExpires || user.otpExpires < Date.now()) {
      user.otpCode = null;
      await user.save();
      return res.status(400).json({ message: "OTP expired." });
    }

    if (String(user.otpCode) !== String(otp)) {
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      await user.save();
      return res.status(400).json({ message: "Invalid OTP" });
    }

    user.otpCode = null;
    await user.save();

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    user.refreshTokens.push({
      token: refreshToken,
      userAgent: req.headers["user-agent"] || "",
    });
    await user.save();
    setRefreshCookie(res, refreshToken);

    return res.json({
      accessToken,
      user: { id: user._id, email: user.email, role: user.role, name: user.name },
    });
  } catch (e) {
    console.error("verifyOtp error:", e);
    res.status(500).json({ message: "Server error verifying code." });
  }
};

/* ============================================================
   🔁 Recover & Reset Password
   ============================================================ */
exports.recoverPassword = async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otpCode = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    user.otpAttempts = 0;
    await user.save();

    await sendEmail({
      to: email,
      subject: "Password Recovery",
      text: `Your recovery code is ${otp}. It expires in 10 minutes.`,
      html: `<p>Your recovery code is <b>${otp}</b>. It expires in 10 minutes.</p>`,
    });

    return res.json({ success: true, message: "Recovery OTP sent" });
  } catch (e) {
    console.error("recoverPassword error:", e);
    res.status(500).json({ message: "Server error sending recovery OTP" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword)
      return res
        .status(400)
        .json({ message: "email, otp, newPassword required" });

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+passwordHash +otpCode +otpExpires +otpAttempts");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.otpCode || !user.otpExpires || Date.now() > user.otpExpires)
      return res.status(400).json({ message: "OTP expired" });

    if (String(otp).trim() !== String(user.otpCode).trim())
      return res.status(400).json({ message: "Invalid OTP" });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.hasPassword = true;
    user.temporaryPassword = false;
    user.otpCode = null;
    user.otpExpires = null;
    user.otpAttempts = 0;
    await user.save();

    return res.json({ success: true, message: "Password reset successfully" });
  } catch (e) {
    console.error("resetPassword error:", e);
    res.status(500).json({ message: "Server error resetting password" });
  }
};

/* ============================================================
   👤 User Profile & Password Update
   ============================================================ */
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "-passwordHash -otpCode"
    );
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json(user);
  } catch (e) {
    console.error("getUserProfile error:", e);
    res.status(500).json({ message: "Server error retrieving profile." });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select("+passwordHash");
    if (!user) return res.status(404).json({ message: "User not found." });

    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match)
      return res.status(400).json({ message: "Current password incorrect." });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.hasPassword = true;
    user.temporaryPassword = false;
    await user.save();

    res.json({ success: true, message: "Password updated successfully." });
  } catch (e) {
    console.error("updatePassword error:", e);
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

    const session = user.refreshTokens.find((rt) => rt.token === token);
    if (!session)
      return res.status(403).json({ message: "Refresh not recognized" });

    const newAccess = generateAccessToken(user);
    return res.json({ accessToken: newAccess });
  } catch (e) {
    console.error("refreshAccessToken error:", e);
    res.status(500).json({ message: "Server error refreshing token" });
  }
};

exports.logout = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    const isProd = process.env.NODE_ENV === "production";
    const clearOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "Strict" : "Lax",
      path: "/",
    };

    res.clearCookie("refreshToken", clearOptions);

    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        const user = await User.findById(payload.id);
        if (user) {
          user.refreshTokens = user.refreshTokens.filter(
            (rt) => rt.token !== token
          );
          await user.save();
        }
      } catch (err) {
        console.warn("⚠️ Logout token verify failed:", err.message);
      }
    }

    console.log("✅ Logout successful — cookie cleared");
    return res.json({ success: true });
  } catch (e) {
    console.error("❌ logout error:", e);
    res.status(500).json({ message: "Server error during logout" });
  }
};
