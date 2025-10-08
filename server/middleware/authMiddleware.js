// server/middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * 🔒 Middleware: Authenticate user via JWT
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select(
      "-otpCode -otpExpires -otpAttempts"
    );

    if (!user) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("❌ Authentication error:", err.message);
    return res.status(401).json({ message: "Unauthorized", error: err.message });
  }
};

/**
 * 🔑 Middleware: Authorize only admins
 */
const authorizeAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    return next();
  }
  return res.status(403).json({ message: "Admin access only" });
};

// ✅ Correct export
module.exports = { authenticate, authorizeAdmin };
