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
    if (!decoded?.sub && !decoded?.id) {
      console.warn("[AUTH] Token missing subject or id");
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    /*
     * Resolve the authenticated user by its hashed entity identifier.  In the
     * codex/fix-security-leak-in-/profile-api branch the JWT payload uses
     * `sub` to store the user's `entityKey` rather than the raw Mongo
     * ObjectId.  Some older tokens created on the main branch may still
     * embed the ObjectId as `id`.  To support both flows while keeping
     * security guarantees, we first try to resolve the principal using
     * User.findByEntityKey (which matches either `entityKey` or
     * `hashedId` and ensures those fields are set), and then fall back to
     * User.findById for legacy tokens.  The projection excludes OTP fields
     * and includes role and id integrity hashes and authorities to enforce
     * integrity checks later.
     */
    let user = null;
    if (decoded.sub) {
      user = await User.findByEntityKey(decoded.sub, {
        projection: "-otpCode -otpExpires -otpAttempts +roleIntegrityHash +idNumberHash +authorities",
      });
    } else if (decoded.id) {
      // 🔙 Legacy fallback: support older tokens containing `id` from the main branch.
      user = await User.findById(decoded.id).select(
        "-otpCode -otpExpires -otpAttempts +roleIntegrityHash +idNumberHash +authorities"
      );
    }
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
