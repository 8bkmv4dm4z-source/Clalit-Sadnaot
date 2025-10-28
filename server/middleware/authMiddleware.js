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

    // 👀 Safe fingerprint (first/last 6 chars)
    const fp = token ? `${token.slice(0,6)}…${token.slice(-6)}` : "(none)";

    if (!token) {
      console.warn(`[AUTH] No token provided. hdr="${authHeader}"`);
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Helpful runtime info
    const expMs = decoded.exp ? decoded.exp * 1000 : null;
    const iatMs = decoded.iat ? decoded.iat * 1000 : null;
    console.log(`[AUTH] Token OK fp=${fp} id=${decoded.id} role=${decoded.role ?? "-"} iat=${iatMs ? new Date(iatMs).toISOString() : "-"} exp=${expMs ? new Date(expMs).toISOString() : "-"}`);

    const user = await User.findById(decoded.id).select("-otpCode -otpExpires -otpAttempts");
    if (!user) {
      console.warn(`[AUTH] User not found for token fp=${fp}`);
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // Also log request origin/path to debug CORS or path issues
    console.log(`[AUTH] user=${user._id} path=${req.method} ${req.originalUrl} origin=${req.headers.origin || "-"}`);

    req.user = user;
    next();
  } catch (err) {
    // Distinguish common JWT errors
    const kind =
      err.name === "TokenExpiredError" ? "expired" :
      err.name === "JsonWebTokenError" ? "malformed/invalid" :
      "other";

    console.error(`[AUTH] JWT ${kind}: ${err.message}`);
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
