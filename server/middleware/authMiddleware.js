// server/middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * 🔒 Middleware: Authenticate user via JWT
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

    if (!token) {
      // SECURITY FIX: avoid echoing raw headers back into the logs
      console.warn("[AUTH] No token provided.");
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("-otpCode -otpExpires -otpAttempts");
    if (!user) {
      console.warn("[AUTH] User not found for provided token");
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    req.user = user;
    next();
  } catch (err) {
    // Distinguish common JWT errors
    const kind =
      err.name === "TokenExpiredError" ? "expired" :
      err.name === "JsonWebTokenError" ? "malformed/invalid" :
      "other";

    // SECURITY FIX: sanitize error logging to avoid leaking token fragments
    console.error(`[AUTH] JWT ${kind}:`, err.message);
    return res.status(401).json({ message: "Unauthorized" });
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
