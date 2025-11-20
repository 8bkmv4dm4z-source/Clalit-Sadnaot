/**
 * server.js — Express backend for Clalit Workshops
 * ------------------------------------------------
 * Purpose
 * - Secure API server (Express + MongoDB via Mongoose)
 * - Works with local LAN launcher (HOST/PORT/CORS from env)
 * - Security/CORS/RLs are applied ONLY to /api/** routes
 *
 * Data Flow
 * Client (React) → Context → /api/** → Controllers → MongoDB → Refetch → Context → UI
 */

require("dotenv").config();

const path = require("path");
const fs = require("fs");
const os = require("os");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const compression = require("compression");
const mongoSanitize = require("express-mongo-sanitize");
const sanitizeBody = require("./middleware/sanitizeBody");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const { errors: celebrateErrors, CelebrateError } = require("celebrate");
const jwt = require("jsonwebtoken");
const { startAuditScheduler } = require("./services/auditService");

const app = express();
app.set("trust proxy", 1);

// SECURITY FIX: enforce Helmet globally with relaxed cross-origin policy for assets
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
  })
);

/* ----------------------------
 * Helpers
 * -------------------------- */
const parseCSV = (csv) =>
  (csv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
const logFilePath = path.join(logsDir, "server.log");

const scrub = (s = "") =>
  String(s)
    .replace(/Bearer\s+[A-Za-z0-9\.\-_]+/g, "Bearer ***")
    .replace(
      /(\"(password|pass|token|secret|authorization|otp|code)\"\s*:\s*\")([^"]+)/gi,
      '$1***'
    );

function logToFile(level, msg) {
  try {
    const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
    fs.appendFile(logFilePath, line, () => {});
  } catch {
    /* SECURITY FIX: ignore log persistence errors quietly */
  }
}

["log", "info", "warn", "error"].forEach((m) => {
  const orig = console[m];
  console[m] = (...args) => {
    const msg = args
      .map((a) => (typeof a === "object" ? scrub(JSON.stringify(a)) : scrub(a)))
      .join(" ");
    logToFile(m.toUpperCase(), msg);
    orig.apply(console, args);
  };
});

/* ----------------------------
 * Body parsing (global)
 * -------------------------- */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

/* ----------------------------
 * Database
 * -------------------------- */
const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/ClalitData";

mongoose.connection.once("open", () => {
  console.log(`✅ Connected to cluster: ${mongoose.connection.host}`);
  console.log(`📂 Active database: ${mongoose.connection.name}`);
});
mongoose.connection.on("error", (err) => {
  console.error("Mongo connection error:", err?.message || err);
});

/* ============================================================
 * API router — all security/CORS/limits are scoped to /api/**
 * ========================================================== */
const api = express.Router();

api.use(hpp());
api.use(sanitizeBody);
api.use(mongoSanitize());
api.use(compression());

// NOTE: Unified CORS configuration — applied globally below before mounting routes.
// We intentionally don't mount separate CORS middleware on the `api` router to
// avoid duplicated/contradicting lists. The configuration below reads
// ALLOWED_ORIGINS from env and falls back to a safe developer-friendly default.


// Rate limits (API only)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
api.use(globalLimiter);

// Write limiter for workshops (with admin JWT/email whitelist)
const ADMIN_WHITELIST_IDS = parseCSV(process.env.ADMIN_WHITELIST_IDS).map((s) =>
  s.toLowerCase()
);
const ADMIN_WHITELIST_EMAILS = parseCSV(
  process.env.ADMIN_WHITELIST_EMAILS
).map((s) => s.toLowerCase());

const workshopWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => {
    try {
      const auth = req.headers?.authorization || "";
      if (!auth.startsWith("Bearer ")) return false;
      const token = auth.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const uid = String(decoded.id || decoded.userId || "").toLowerCase();
      const email = String(decoded.email || "").toLowerCase();
      if (uid && ADMIN_WHITELIST_IDS.includes(uid)) return true;
      if (email && ADMIN_WHITELIST_EMAILS.includes(email)) return true;
    } catch {
      /* SECURITY FIX: suppress JWT decode errors during limiter skip */
    }
    return false;
  },
});

/* ----------------------------
 * Dev utilities (API only)
 * -------------------------- */
if (process.env.NODE_ENV !== "production") {
  try {
    api.use("/dev", require("./routes/dev"));
  } catch (e) {
    console.warn("⚠️ Dev routes not found (ok).");
  }
}

/* ----------------------------
 * Routers (under /api)
 * -------------------------- */
const workshopsRouter = require("./routes/workshops");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const profileRouter = require("./routes/profile");

api.use("/workshops", workshopWriteLimiter, workshopsRouter);
api.use("/auth", authRouter);
api.use("/users", usersRouter);
api.use("/profile", profileRouter);

// API 404
api.use((req, res, next) => {
  if (res.headersSent) return next();
  return res.status(404).json({ success: false, message: "Not found" });
});

// API error handlers
api.use(celebrateErrors());
api.use((err, req, res, _next) => {
  if (err instanceof CelebrateError) {
    return res.status(400).json({ success: false, message: "Validation error" });
  }
  const status = err.status || err.statusCode || 500;
  const payload =
    process.env.NODE_ENV === "production"
      ? { success: false, message: "Server error" }
      : { success: false, message: err.message || "Server error" };
  if (status >= 500) console.error("Unhandled error:", err);
  return res.status(status).json(payload);
});

// Mount the API once

// ----------------------------
// Unified CORS configuration (global)
// - Reads allowed origins from process.env.ALLOWED_ORIGINS (comma-separated)
// - Falls back to a small developer whitelist (localhost ports)
// - In non-production, we allow all origins to simplify local development
// ----------------------------
const ENV_ALLOWED_ORIGINS = parseCSV(process.env.ALLOWED_ORIGINS || "");
const DEV_DEFAULTS = ["http://localhost:5173", "http://localhost:3000"];
const ALL_ALLOWED_ORIGINS = [...new Set([...(ENV_ALLOWED_ORIGINS || []), ...DEV_DEFAULTS])];

const corsOptions = {
  origin(origin, cb) {
    // allow non-browser requests (curl, server-to-server) which don't set Origin
    if (!origin) return cb(null, true);

    // during development allow all origins for convenience
    if (process.env.NODE_ENV !== "production") return cb(null, true);

    if (ALL_ALLOWED_ORIGINS.includes(origin)) return cb(null, true);

    console.warn(`❌ CORS blocked request from: ${origin}`);
    return cb(new Error("CORS: Origin not allowed"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  exposedHeaders: ["Content-Disposition"],
};

app.use(cors(corsOptions));

// Then mount `/api`
app.use("/api", api);

/* ------------------------------------------------
 * Static SPA (serve client build) — outside /api
 * MUST come after API and before app-level 404s
 * ---------------------------------------------- */
const SHOULD_SERVE_CLIENT = process.env.SERVE_CLIENT !== "false";
const CLIENT_DIST_PATH = process.env.CLIENT_DIST_PATH
  ? path.resolve(process.env.CLIENT_DIST_PATH)
  : path.join(__dirname, "../client/dist");

if (SHOULD_SERVE_CLIENT) {
  const hasDist = fs.existsSync(CLIENT_DIST_PATH);
  console.log(
    "[STATIC] expecting build at:",
    CLIENT_DIST_PATH,
    "exists?",
    hasDist
  );

  if (hasDist) {
    app.use(express.static(CLIENT_DIST_PATH));
  } else {
    console.warn(
      "[STATIC] dist folder missing — set CLIENT_DIST_PATH or run `npm run build` to enable refresh fallbacks."
    );
  }

  const fallbackCandidates = [
    path.join(CLIENT_DIST_PATH, "index.html"),
    path.join(__dirname, "../client/index.html"),
  ];
  const fallbackIndex = fallbackCandidates.find((candidate) =>
    fs.existsSync(candidate)
  );

  if (fallbackIndex) {
    console.log("[STATIC] SPA fallback enabled from:", fallbackIndex);
    app.get(/^\/(?!api).*/, (_req, res, next) => {
      res.sendFile(fallbackIndex, (err) => {
        if (err) next(err);
      });
    });
  } else {
    console.warn(
      "[STATIC] index.html fallback missing — direct refreshes will fail until the client build is generated."
    );
  }
}

/* ------------------------------------------------
 * App-level 404 for any other unmatched (rare)
 * ---------------------------------------------- */
app.use((req, res, next) => {
  if (res.headersSent) return next();
  return res.status(404).json({ success: false, message: "Not found" });
});

/* ------------------------------------------------
 * Start
 * ---------------------------------------------- */
const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "0.0.0.0";

(async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      autoIndex: true,
      serverSelectionTimeoutMS: 10000,
    });

    startAuditScheduler();

    const server = app.listen(PORT, HOST, () => {
      const url = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
      console.log(`🚀 Server listening on ${HOST}:${PORT}`);
      console.log(`🔗 Open: ${url}`);
    });

    const shutdown = (sig) => () => {
      console.warn(`\n${sig} received — shutting down...`);
      server.close(() => {
        mongoose.connection.close(false).then(() => process.exit(0));
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on("SIGTERM", shutdown("SIGTERM"));
    process.on("SIGINT", shutdown("SIGINT"));
  } catch (err) {
    console.error("❌ Failed to start server:", err?.message || err);
    process.exit(1);
  }
})();
