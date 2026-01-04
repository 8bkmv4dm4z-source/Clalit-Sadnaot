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
    if (!decoded?.sub) {
      console.warn("[AUTH] Token missing subject");
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const user = await User.findOne({ entityKey: decoded.sub }).select(
      "-otpCode -otpExpires -otpAttempts +roleIntegrityHash +idNumberHash +authorities"
    );
    if (!user) {
      console.warn("[AUTH] User not found for provided token");
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    if (user.passwordChangedAt) {
      const issuedAt = (decoded.iat || 0) * 1000;
      if (issuedAt && issuedAt < new Date(user.passwordChangedAt).getTime()) {
        console.warn("[AUTH] Token issued before password change");
        return res.status(401).json({ message: "Invalid or expired token" });
      }
    }

    if (!user.isRoleIntegrityValid()) {
      console.warn("[AUTH] Role integrity hash mismatch", { id: user._id, role: user.role });
      return res.status(403).json({ message: "Role integrity check failed" });
    }

    if (!user.entityKey || typeof user.entityKey !== "string") {
      console.warn("[AUTH] Missing entityKey for authenticated principal", {
        id: user._id,
        role: user.role,
      });
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    if (!user.roleIntegrityHash || !user.idNumberHash) {
      try {
        user.refreshIntegrityHashes();
        await user.save({ validateBeforeSave: false });
      } catch (err) {
        console.warn("[AUTH] Unable to refresh integrity hashes", err.message);
      }
    }

    user.authorities = user.authorities || {};
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
const hasAuthority = (user, key) => !!user?.authorities?.[key];

const requireAuthority = (authorityKey) => (req, res, next) => {
  if (hasAuthority(req.user, authorityKey)) return next();
  return res.status(403).json({ message: "Admin access only" });
};

const authorizeAdmin = requireAuthority("admin");

// ✅ Correct export
module.exports = { authenticate, authorizeAdmin, requireAuthority, hasAuthority };
