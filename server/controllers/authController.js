const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const User = require("../models/User");

// ---------- JWT helpers ----------
function generateAccessToken(user) {
  const expiresIn = process.env.JWT_EXPIRY || "15m";
  // אל תכניס מידע מיותר ל-payload; id + role מספיקים
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

function generateRefreshToken(user) {
  const expiresIn = process.env.JWT_REFRESH_EXPIRY || "7d";
  return jwt.sign(
    { id: user._id }, // אין צורך ב-role ב-refresh
    process.env.JWT_REFRESH_SECRET,
    { expiresIn }
  );
}

// שליחת ה-refresh כ-HttpOnly cookie כדי להגן מפני XSS
function setRefreshCookie(res, refreshToken) {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // רק ב-HTTPS בפרודקשן
    sameSite: "Strict",                             // מונע CSRF cross-site
    maxAge: parseJwtExpToMs(process.env.JWT_REFRESH_EXPIRY || "7d"),
    path: "/api/auth", // קוקה תהיה זמינה רק תחת /api/auth*
  });
}

// ממיר מחרוזת like "7d"/"15m" ל-ms כדי לשים ב-maxAge
function parseJwtExpToMs(exp) {
  // תמיכה ב-s/m/h/d
  const m = String(exp).match(/^(\d+)([smhd])$/i);
  if (!m) return 7 * 24 * 60 * 60 * 1000; // fallback 7d
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const map = { s: 1000, m: 60 * 1000, h: 3600 * 1000, d: 24 * 3600 * 1000 };
  return n * map[unit];
}

/* ============================================================
   JWT helper
   ============================================================ */
function generateJwtToken(userId) {
  // Use a shorter expiry by default for better security.  The duration
  // can be overridden via the JWT_EXPIRY env variable (e.g. "15m").
  const expiresIn = process.env.JWT_EXPIRY || '30m';
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn });
}

/* ============================================================
   Transporter — two versions
   ============================================================ */

// === ✅ Active development version ===
const logFile = path.join(__dirname, "../../otp_log.csv");
let transporter = null; // No email sending in dev mode
const isDev = true; // <-- active development mode

// === 💬 Production version (commented out) ===
// const isDev = process.env.NODE_ENV !== "production";
// let transporter = nodemailer.createTransport({
//   host: "smtp.gmail.com",
//   port: 465,
//   secure: true,
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },
//   // tls: { rejectUnauthorized: false }, // Uncomment only if Avast causes SSL inspection
// });

/* ============================================================
   Register User
   ============================================================ */
exports.registerUser = async (req, res) => {
  try {
    const { name, email, password, idNumber, birthDate, city, phone } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(400).json({ message: "User already exists" });

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const user = await User.create({
      name,
      email: email.trim().toLowerCase(),
      passwordHash,
      idNumber,
      birthDate,
      city,
      phone,
      hasPassword: !!password,
      temporaryPassword: false,
    });

    res.status(201).json({
      message: "User registered successfully.",
      user: { id: user._id, email: user.email },
    });
  } catch (e) {
    console.error("register error:", e);
    res.status(500).json({ message: "Server error during registration." });
  }
};

/* ============================================================
   Login User
   ============================================================ */
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase().trim() })
      .select("+passwordHash");
    if (!user) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(password, user.passwordHash || "");
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

    // ייצור טוקנים
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // שמירת refresh DB עם userAgent לזיהוי מכשיר
    user.refreshTokens.push({
      token: refreshToken,
      userAgent: req.headers["user-agent"] || "",
    });
    await user.save();

    // שליחת refresh ב-HttpOnly cookie
    setRefreshCookie(res, refreshToken);

    // החזרת Access ב-JSON
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
   Send OTP — logs to CSV (dev) or email (prod)
   ============================================================ */
exports.sendOtp = async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otpCode = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000;
    user.otpAttempts = 0;
    await user.save();

    if (isDev) {
      // --- Write to otp_log.csv ---
      const line = `${new Date().toISOString()},${email},${otp}\n`;
      fs.appendFileSync(logFile, line);
      console.log(`⚙️ [DEV MODE] OTP for ${email}: ${otp}`);
    } else if (transporter) {
      // --- Production email sending ---
      await transporter.sendMail({
        from: `"Workshops" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Your verification code",
        text: `Verification code: ${otp}`,
      });
      console.log(`📧 OTP sent to ${email}`);
    }

    res.json({ success: true, message: "OTP generated successfully." });
  } catch (e) {
    console.error("sendOtp error:", e);
    res.status(500).json({ message: "Failed to send OTP." });
  }
};

/* ============================================================
   Verify OTP
   ============================================================ */
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase().trim() })
      .select("+otpCode +otpExpires +otpAttempts");
    if (!user) return res.status(404).json({ message: "User not found." });

    if (!user.otpExpires || user.otpExpires < Date.now()) {
      user.otpCode = null;
      await user.save();
      return res.status(400).json({ message: "OTP expired, please request a new one." });
    }

    if (String(user.otpCode) !== String(otp)) {
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      await user.save();
      return res.status(400).json({ message: `Invalid code. Attempt ${user.otpAttempts}/5` });
    }

    // ✅ אימות OTP עבר
    user.otpCode = null;
    await user.save();

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // שמירת refresh ב-DB
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
   Update Password
   ============================================================ */
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
   Get User Profile
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


/* ============================================================
   Password Recovery via OTP
   ============================================================ */
exports.recoverPassword = async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "Email is required" });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otpCode = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes expiry for recovery
    user.otpAttempts = 0;
    await user.save();

    // Reuse nodemailer transporter from login OTP, but change subject
    let transporter;
    if (process.env.NODE_ENV === "production") {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    } else {
      transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });
    }

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.EMAIL_USER,
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
      return res.status(400).json({ message: "email, otp, newPassword required" });

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+passwordHash +otpCode +otpExpires +otpAttempts");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.otpCode || !user.otpExpires || Date.now() > user.otpExpires)
      return res.status(400).json({ message: "OTP expired" });

    if (String(otp).trim() !== String(user.otpCode).trim())
      return res.status(400).json({ message: "Invalid OTP" });

    // All good => set new password and clear OTP
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
exports.refreshAccessToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ message: "No refresh token" });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    const user = await User.findById(payload.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const session = user.refreshTokens.find((rt) => rt.token === token);
    if (!session)
      return res.status(403).json({ message: "Refresh not recognized" });

    // ✅ מנפיק Access חדש בלבד
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
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      path: "/api/auth",
    });

    if (!token) return res.json({ success: true });

    let userId = null;
    try {
      const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
      userId = payload.id;
    } catch {
      return res.json({ success: true });
    }

    const user = await User.findById(userId);
    if (!user) return res.json({ success: true });

    user.refreshTokens = user.refreshTokens.filter((rt) => rt.token !== token);
    await user.save();

    return res.json({ success: true });
  } catch (e) {
    console.error("logout error:", e);
    res.status(500).json({ message: "Server error during logout" });
  }
};
