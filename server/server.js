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
const { runAllHashAudits } = require("./audit/hashAudit");
const { migrateLegacyAdmins } = require("./services/legacyAdminMigration");
const { ACCESS_SCOPE_HEADER, ACCESS_PROOF_HEADER } = require("./utils/accessScope");
const { enforceResponseContract } = require("./contracts/responseGuards");

const app = express();
const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY_HOPS || 1);
app.set("trust proxy", TRUST_PROXY_HOPS);

const isProd = process.env.NODE_ENV === "production";

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

const { scrub } = require("./utils/logScrub");

function logToFile(level, msg) {
  try {
    const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
    fs.appendFile(logFilePath, line, () => {});
  } catch {
    /* SECURITY: ignore log persistence errors quietly */
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
 * GLOBAL CORS (must be before Helmet & routes)
 * -------------------------- */
/**
 * CORS strategy:
 * - In development (NODE_ENV !== "production") → allow all origins (easy dev).
 * - In production:
 *    - allow any origin listed in ALLOWED_ORIGINS (comma-separated)
 *    - also allow PUBLIC_URL (Render frontend) + localhost dev ports
 * - Non-browser requests (no Origin header) are always allowed.
 */
const ENV_ALLOWED_ORIGINS = parseCSV(process.env.ALLOWED_ORIGINS || "");
const DEV_DEFAULTS = parseCSV(
  process.env.DEV_ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:3000"
);
const DEPLOY_DEFAULTS = [
  process.env.PUBLIC_URL, // e.g. https://sandaot.onrender.com
];

const ALL_ALLOWED_ORIGINS = [
  ...new Set([
    ...ENV_ALLOWED_ORIGINS,
    ...DEV_DEFAULTS,
    ...DEPLOY_DEFAULTS.filter(Boolean),
  ]),
];
const CSP_ALLOWED_ORIGINS = [...new Set([...ENV_ALLOWED_ORIGINS, ...DEPLOY_DEFAULTS].filter(Boolean))];
const CAPTCHA_SCRIPT_SOURCES = [];
const CAPTCHA_FRAME_SOURCES = [];
const CAPTCHA_CONNECT_SOURCES = [];
if (process.env.RECAPTCHA_SITE_KEY) {
  CAPTCHA_SCRIPT_SOURCES.push("https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/");
  CAPTCHA_FRAME_SOURCES.push("https://www.google.com/recaptcha/");
  CAPTCHA_CONNECT_SOURCES.push("https://www.google.com/recaptcha/");
}
if (process.env.HCAPTCHA_SITE_KEY) {
  CAPTCHA_SCRIPT_SOURCES.push("https://js.hcaptcha.com", "https://hcaptcha.com");
  CAPTCHA_FRAME_SOURCES.push("https://hcaptcha.com", "https://*.hcaptcha.com");
  CAPTCHA_CONNECT_SOURCES.push("https://hcaptcha.com");
}

const corsOptions = {
  origin(origin, cb) {
    // Allow non-browser / server-side requests with no Origin
    if (!origin) return cb(null, true);

    // During development, allow everything for convenience
    if (process.env.NODE_ENV !== "production") return cb(null, true);

    if (ALL_ALLOWED_ORIGINS.includes(origin)) return cb(null, true);

    console.warn(`❌ CORS blocked request from origin: ${origin}`);
    return cb(new Error("CORS: Origin not allowed"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept","x-admin-password"
, "X-CSRF-Token"
],
  exposedHeaders: ["Content-Disposition", ACCESS_SCOPE_HEADER, ACCESS_PROOF_HEADER],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// Attach CORS globally so even 404/500 responses include the header
app.use(cors(corsOptions));

/* ----------------------------
 * Helmet (after CORS)
 * -------------------------- */
// SECURITY: enforce Helmet globally with relaxed cross-origin policy for assets
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
    frameguard: { action: "deny" },
    hsts: isProd
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
    contentSecurityPolicy: isProd
      ? {
          useDefaults: true,
          directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", ...CAPTCHA_SCRIPT_SOURCES],
            "style-src": ["'self'"],
            "img-src": ["'self'"],
            "connect-src": ["'self'", ...CSP_ALLOWED_ORIGINS, ...CAPTCHA_CONNECT_SOURCES],
            "frame-src": ["'self'", ...CAPTCHA_FRAME_SOURCES],
            "frame-ancestors": ["'none'"],
            "base-uri": ["'self'"],
            "object-src": ["'none'"],
          },
        }
      : false,
    referrerPolicy: { policy: "no-referrer" },
    hidePoweredBy: true,
  })
);

// Minimal Permissions-Policy to disable high-risk features by default
app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=(), usb=()"
  );
  next();
});

/* ----------------------------
 * Body parsing (global)
 * -------------------------- */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

// Dev-only response contract enforcement to prevent privileged field leakage.
app.use((req, res, next) => {
  if (res.__responseContractWrapped) return next();

  const originalJson = res.json.bind(res);
  res.__responseContractWrapped = true;

  res.json = (payload) => {
    if (payload && typeof payload === "object") {
      try {
        enforceResponseContract(payload, {
          context: `${req.method} ${req.originalUrl || req.url || "response"}`,
          isAdminScope: !!(req.user?.authorities?.admin),
        });
      } catch (err) {
        return next(err);
      }
    }
    return originalJson(payload);
  };

  return next();
});

/* ----------------------------
 * Database
 * -------------------------- */
const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/ClalitData";

mongoose.connection.once("open", () => {
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

// Rate limits (API only)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
api.use(globalLimiter);

// Admin whitelist for workshop write limiter
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
      const uid = String(decoded.sub || decoded.entityKey || "").toLowerCase(); // entityKey fallback is legacy-only
      if (uid && ADMIN_WHITELIST_IDS.includes(uid)) return true;
    } catch {
      /* SECURITY: suppress JWT decode errors during limiter skip */
    }
    return false;
  },
});

/* ----------------------------
 * Dev utilities (API only)
 * -------------------------- */
const devRoutesEnabled = process.env.ENABLE_DEV_ROUTES === "true";
if (!isProd && devRoutesEnabled) {
  try {
    const devRouter = require("./routes/dev");
    api.use("/dev", devRouter);
  } catch (e) {
    console.warn("⚠️ Dev routes not found (ok).");
  }
} else {
  console.info(
    "[DEV ROUTES] Skipping mount — ENABLE_DEV_ROUTES must be \"true\" and NODE_ENV must not be production."
  );
}

/* ----------------------------
 * Routers (under /api)
 * -------------------------- */
const workshopsRouter = require("./routes/workshops");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const profileRouter = require("./routes/profile");
const adminHubRoutes = require("./routes/adminHub");
const adminWorkshopsRoutes = require("./routes/adminWorkshops");

api.use("/workshops", workshopWriteLimiter, workshopsRouter);
api.use("/auth", authRouter);
api.use("/users", usersRouter);
api.use("/profile", profileRouter);
api.use("/admin/hub", adminHubRoutes);
api.use("/admin/workshops", adminWorkshopsRoutes);

// API 404
api.use((req, res, next) => {
  if (res.headersSent) return next();
  return res.status(404).json({ success: false, message: "Not found" });
});

// API error handlers
api.use(celebrateErrors());
api.use((err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN") {
    return res.status(403).json({ success: false, message: "Invalid or missing CSRF token" });
  }
  return next(err);
});
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

// Mount the API once under /api (after CORS & Helmet)
app.use("/api", api);

/* ------------------------------------------------
 * Static SPA (serve client build) — outside /api
 * MUST come after API and before app-level 404s
 * ---------------------------------------------- */
const SHOULD_SERVE_CLIENT = process.env.SERVE_CLIENT !== "false";
const CLIENT_DIST_PATH = process.env.CLIENT_DIST_PATH
  ? path.resolve(process.env.CLIENT_DIST_PATH)
  : path.join(__dirname, "../client/dist");

// Protect password reset flows from leaking origins when serving the SPA page.
app.use("/resetpassword", (req, res, next) => {
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

if (SHOULD_SERVE_CLIENT) {
  const hasDist = fs.existsSync(CLIENT_DIST_PATH);
  

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

    if (process.env.MIGRATE_LEGACY_ADMINS === "true") {
      try {
        await migrateLegacyAdmins(console);
      } catch (err) {
        console.error("[P7 MIGRATION] Failed to migrate legacy admins:", err?.message || err);
      }
    }

    startAuditScheduler();

    if (process.env.HASH_AUDIT === "true") {
      runAllHashAudits().catch((err) =>
        console.error("[AUDIT][HASH] failed to complete:", err?.message || err)
      );
    }

    const server = app.listen(PORT, HOST, () => {
      const url = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
      
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
