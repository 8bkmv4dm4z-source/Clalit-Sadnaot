// server/middleware/sanitizeBody.js
/**
 * sanitizeBody.js — Lightweight global sanitization middleware
 * ------------------------------------------------------------
 * - Runs before validation (Joi/Celebrate).
 * - Cleans all string fields in req.body, req.query, and req.params.
 * - Prevents HTML/script injection and template literals.
 */

const { logInputSanitized } = require("../services/SecurityEventLogger");

function deepSanitize(obj) {
  if (Array.isArray(obj)) {
    return obj.map(deepSanitize);
  } else if (obj && typeof obj === "object") {
    for (const key in obj) {
      obj[key] = deepSanitize(obj[key]);
    }
    return obj;
  } else if (typeof obj === "string") {
    return obj
      .replace(/[<>]/g, "")       // remove HTML tags
      .replace(/[{}`$]/g, "")     // remove template injections
      .replace(/\s{3,}/g, " ")    // normalize spaces
      .trim();
  } else {
    return obj;
  }
}

function snapshotStrings(obj) {
  if (!obj || typeof obj !== "object") return null;
  try {
    return JSON.stringify(obj);
  } catch {
    return null;
  }
}

module.exports = function sanitizeBody(req, _res, next) {
  const beforeBody = req.body ? snapshotStrings(req.body) : null;

  if (req.body) req.body = deepSanitize(req.body);
  if (req.query) req.query = deepSanitize(req.query);
  if (req.params) req.params = deepSanitize(req.params);

  if (beforeBody && beforeBody !== snapshotStrings(req.body)) {
    logInputSanitized(req, { source: "body" });
  }

  next();
};
