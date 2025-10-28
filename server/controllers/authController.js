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
  const useSecure = String(process.env.COOKIE_SECURE || "").toLowerCase() === "true";
  const sameSite = (process.env.COOKIE_SAMESITE || "Lax"); // "Lax" is fine for same-site ports

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: useSecure,   // set COOKIE_SECURE=false in .env for LAN/http
    sameSite,            // "Lax" for LAN; if you ever use "None" you must set secure=true
    path: "/",
    maxAge: parseJwtExpToMs(process.env.JWT_REFRESH_EXPIRY || "7d"),
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
// Configure a reusable SMTP transporter using environment variables.  This
// transporter is used for all outgoing emails (OTP, password recovery
// etc.).  See README for the required SMTP_* keys in .env.  We avoid
// logging sensitive credentials or message contents.
const smtpTransport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});
// When developing locally you may still want to log OTP codes to a
// local CSV file for convenience.  Toggle this flag via the
// OTP_LOGGING environment variable.  When OTP_LOGGING=false the
// codes are not persisted locally.
const otpLoggingEnabled = String(process.env.OTP_LOGGING || "true").toLowerCase() !== "false";

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

    // ✅ Force role to "user" — no client override allowed
    const role = "user";

    // ✅ Require at least one contact method
    if (!email && !phone)
      return res.status(400).json({ message: "Email or phone is required" });

    const cleanEmail = email?.trim().toLowerCase();

    // ✅ Prevent duplicates by email or phone
    const existing = await User.findOne({
      $or: [
        cleanEmail ? { email: cleanEmail } : null,
        phone ? { phone } : null,
      ].filter(Boolean),
    });

    if (existing) {
      return res
        .status(400)
        .json({ message: "A user with this email or phone already exists" });
    }

    // ✅ Hash password securely
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    // ✅ Validate and normalize family members
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

    // ✅ Create new user document
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
      role, // <— enforced here
    });

    // ✅ Return clean response (no password hash)
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
    res.status(500).json({
      message: "Server error during registration.",
      error: e.message,
    });
  }
};



/* ============================================================
   Login User
   ============================================================ */
exports.loginUser = async (req, res) => {
    console.log("[DEBUG loginUser] incoming body:", req.body);

  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase().trim() })
      .select("+passwordHash");
    if (!user) {
  console.log(`[AUTH] ❌ No user found for ${email}`);
  return res.status(400).json({ message: "Invalid email or password" });
}
const match = await bcrypt.compare(password, user.passwordHash || "");

if (!match) {
  console.log(`[AUTH] ❌ Wrong password for ${email}`);
  return res.status(400).json({ message: "Invalid email or password" });
}

console.log(`[AUTH] ✅ Login success for ${email}`);

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

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
    console.log("sendOtp called with:", req.body);

    const emailRaw = req.body?.email;
    console.log("[DEBUG] raw email field:", emailRaw, "typeof:", typeof emailRaw);

    const email = (emailRaw || "").trim().toLowerCase();
    console.log("[DEBUG] normalized email:", JSON.stringify(email));

    if (!email) {
      console.log("[DEBUG] returning 400 - no email");
      return res.status(400).json({ message: "Email is required" });
    }

    // Check DB lookup explicitly
    let user;
    try {
      user = await User.findOne({ email }).exec();
      console.log("[DEBUG] User.findOne returned:", !!user);
    } catch (dbErr) {
      console.error("[DEBUG] User.findOne threw:", dbErr);
      return res.status(500).json({ message: "DB error during lookup" });
    }

    if (!user) {
      console.log("[DEBUG] returning 404 - user not found for:", email);
      return res.status(404).json({ message: "User with this email not found" });
    }

    // Generate and store OTP (unchanged)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otpCode = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000;
    user.otpAttempts = 0;
    await user.save();
    console.log("[DEBUG] OTP saved on user:", user._id);

    // Optionally write the OTP to a local log file for debugging.
    if (otpLoggingEnabled) {
      try {
        const line = `${new Date().toISOString()},${email},${otp}\n`;
        fs.appendFileSync(logFile, line);
        console.log(`⚙️ OTP for ${email}: ${otp} (logged)`);
      } catch (err) {
        console.warn("⚠️ Failed to write OTP to log:", err.message);
      }
    }
    // Send the OTP via email using the configured SMTP transport.  If
    // sending fails we still return success to avoid enumerating
    // user existence.
    try {
      await smtpTransport.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to: email,
        subject: "קוד אימות", // Hebrew subject for the client
        text: `קוד האימות שלך הוא ${otp}`,
        html: `<p dir="rtl">קוד האימות שלך הוא <b>${otp}</b></p>`,
      });
      console.log(`📧 OTP email sent to ${email}`);
    } catch (err) {
      console.error("⚠️ Failed to send OTP email:", err.message);
    }

    return res.json({ success: true, message: "OTP generated successfully." });
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
    //Passed
    user.otpCode = null;
    await user.save();


    //Aquire tokens
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

    // Always use environment-provided SMTP settings for sending recovery
    // emails.  The SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS values
    // should be defined in the .env file.  We avoid relying on
    // provider-specific services (e.g. Gmail) directly in code.
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
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
      secure: isProd ? true : false,
      sameSite: isProd ? "Strict" : "Lax",
      path: "/", // חייב להיות זהה
    };

    // 🧹 ניקוי העוגייה מהדפדפן
    res.clearCookie("refreshToken", clearOptions);

    // 🧩 אם יש טוקן, מנקים גם מה־DB
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

