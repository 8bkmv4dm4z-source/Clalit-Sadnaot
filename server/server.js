// server/server.js
require("dotenv").config();
if (!process.env.JWT_SECRET) {
  console.error("❌ Missing JWT_SECRET. Exiting...");
  process.exit(1);
}

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose"); 

const connectDB = require("./config/db"); // ✅ use the new helper
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const compression = require("compression");
const mongoSanitize = require("express-mongo-sanitize");
const cookieParser = require("cookie-parser");

const app = express();
console.log("🌐 NODE_ENV =", process.env.NODE_ENV);
console.log("Limiter active:", process.env.NODE_ENV !== "loadtest");
mongoose.connection.once("open", () => {
  console.log(`✅ Connected to cluster: ${mongoose.connection.host}`);
  console.log(`📂 Active database: ${mongoose.connection.name}`);
});
if (process.env.NODE_ENV !== "production") {
  app.use("/api/dev", require("./routes/dev"));
}
app.disable("x-powered-by");

/* ----------------------------------------
 * 🔹 בסיס
 * -------------------------------------- */
//enable when behind a proxy (e.g. Heroku, Vercel, Nginx)
app.set("trust proxy", 1); // ✅ רק hop אחד (Render/Proxy אחד)

// JSON parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const logPath = "./server_env.log";
const envInfo = `\n[${new Date().toISOString()}] 🚀 NODE_ENV = ${process.env.NODE_ENV}\nCWD = ${process.cwd()}\n`;
fs.appendFileSync(logPath, envInfo);

console.log("🧭 Environment info written to", logPath);

// 🔐 Security headers (minimal Helmet replacement)
// 🔐 Helmet — הגנות ברירת מחדל דרך כותרות HTTP
app.use(
  helmet({
    // CSP נוסיף בשלב ייעודי כדי לא לשבור את ה-UI בזמן פיתוח
    contentSecurityPolicy: false,
  })
);
app.use(hpp());

app.use(compression());

/* ----------------------------------------
 * 🚦 Global Rate Limit  ✅ NEW SECTION
 * -------------------------------------- */
/*hey*/

/* ----------------------------------------
 * 🚦 Global Rate Limit (Load-Test-Safe)
 * -------------------------------------- */

const IS_LOADTEST = process.env.NODE_ENV === "loadtest";

const WHITELISTED_IPS = [
  "127.0.0.1",     // local IPv4
  "::1",           // local IPv6
  "192.168.1.100", // LAN IP (for cross-device testing)
];

let generalLimiter;
if (IS_LOADTEST) {
  console.warn("⚠️  Global rate limiter disabled due to loadtest mode");
  generalLimiter = (req, res, next) => next();
} else {
  generalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,            // 100 req/min per IP
    message: { message: "Too many requests, slow down." },
    handler: (req, res) => {
      req.app.emit("rate-limit-hit", {
        type: "auth-general",
        ip: req.ip,
        path: req.originalUrl,
        when: new Date().toISOString(),
      });
      res.status(429).json({ message: "Too many requests" });
    },
    skip: (req) => WHITELISTED_IPS.includes(req.ip),
  });
}

app.use(generalLimiter);

app.use(cookieParser());
const sanitizeBody = require("./middleware/sanitizeBody");
app.use(sanitizeBody); // Cleans req.body, req.query, req.params

app.use(mongoSanitize());

// 🧼 Basic sanitization to mitigate MongoDB operator injection
// function sanitize(obj) {
//   if (obj && typeof obj === "object") {
//     Object.keys(obj).forEach((key) => {
//       if (key.startsWith("$") || key.includes(".")) {
//         delete obj[key];
//       } else {
//         sanitize(obj[key]);
//       }
//     });
//   }
// }
// app.use((req, _res, next) => {
//   sanitize(req.body);
//   sanitize(req.query);
//   next();
// });
/* ----------------------------------------
 * 🌐 CORS (Safe + Controlled)
 * -------------------------------------- */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no Origin (like curl, Postman, k6 local tests)
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Instead of throwing, return a controlled 403-style error
    const msg = `CORS blocked: ${origin} is not in allowed origins`;
    console.warn(`[CORS] ❌ ${msg}`);
    return callback(new Error(msg), false);
  },
  credentials: true,
  optionsSuccessStatus: 204, // Ensure preflights return 204 instead of 200
};

// Middleware wrapper for cleaner error handling
app.use((req, res, next) => {
  cors(corsOptions)(req, res, (err) => {
    if (err && err.message.startsWith("CORS blocked")) {
      return res.status(403).json({ message: err.message });
    }
    next(err);
  });
});

/* ----------------------------------------
 * 🧾 לוגים לקובץ
 * -------------------------------------- */
const logDir = path.join(__dirname, "logs");
const logFile = path.join(logDir, "server.log");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logStream = fs.createWriteStream(logFile, { flags: "a" });
const log = (type, msg) => {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${type}] ${msg}\n`;
  process.stdout.write(line);
  logStream.write(line);
};

// mirror console to file
["log", "info", "warn", "error"].forEach((method) => {
  const original = console[method];
  console[method] = (...args) => {
    const message = args
      .map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : a))
      .join(" ");
    log(method.toUpperCase(), message);
    original.apply(console, args);
  };
});

/* ----------------------------------------
 * ✅ בריאות
 * -------------------------------------- */
app.get("/", (_req, res) => res.json({ ok: true, ts: Date.now() }));

/* ----------------------------------------
 * 🚦 Rate limit חכם לכתיבות בלבד (Workshops)
 *  - מזהה אדמין / רשימת לבנים מה־JWT ומחריג.
 *  - עובד רק על POST/PUT/PATCH/DELETE של /api/workshops/*
 * -------------------------------------- */

// רשימות לבנים מה־env (אופציונלי)
const ADMIN_WHITELIST_IDS = (process.env.ADMIN_WHITELIST_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ADMIN_WHITELIST_EMAILS = (process.env.ADMIN_WHITELIST_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// בדיקת החרגה מתוך ה־JWT בלי גישה ל־DB
function isWhitelistedReq(req) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return false;

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload) return false;

    if (payload.role === "admin") return true;
    if (payload._id && ADMIN_WHITELIST_IDS.includes(String(payload._id))) return true;
    if (
      payload.email &&
      ADMIN_WHITELIST_EMAILS.includes(String(payload.email).toLowerCase())
    )
      return true;

    return false;
  } catch {
    return false;
  }
}

// ממפה מפתח לפי IP+נתיב כדי לתת גמישות
const writeRateMap = Object.create(null);
const WRITE_WINDOW_MS = 60 * 1000; // 1 דקה
const WRITE_MAX = 20; // עד 20 פעולות בדקה למשתמש/IP

function workshopWriteLimiter(req, res, next) {
  // ✅ Skip limiter completely during load tests
  if (IS_LOADTEST) return next();

  const method = req.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return next();

  if (isWhitelistedReq(req)) return next();

  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const key = `${ip}:${req.baseUrl}${req.path}`;
  const now = Date.now();

  const rec = writeRateMap[key] || { count: 0, start: now };
  if (now - rec.start > WRITE_WINDOW_MS) {
    rec.count = 0;
    rec.start = now;
  }
  rec.count += 1;
  writeRateMap[key] = rec;

  if (rec.count > WRITE_MAX) {
    console.warn("[RateLimit] blocked", {
      key,
      ip,
      path: req.originalUrl,
      method,
    });
    return res
      .status(429)
      .json({ message: "Too many requests, please try again later." });
  }

  return next();
}


/* ----------------------------------------
 * 🔀 Routers
 * -------------------------------------- */
const workshopsRouter = require("./routes/workshops");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const profileRouter = require("./routes/profile");
if (process.env.NODE_ENV !== "production") {
  app.use("/api/dev", require("./routes/dev"));
}

// ⚠️ חשוב: למקד את המגבלה רק על כתיבות של workshops
app.use("/api/workshops", workshopWriteLimiter, workshopsRouter);

// שאר הנתיבים ללא מגביל גלובלי
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/profile", profileRouter);
const { errors } = require("celebrate");
app.use(errors());
// 🧩 Error handling middleware — כולל Celebrate + Joi פירוט מלא
app.use((err, req, res, next) => {
  console.error("❌ Server error:", err);

  // Celebrate / Joi validation errors
  if (err.joi) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details: err.joi.details?.map((d) => ({
        path: d.path,
        message: d.message,
      })),
    });
  }

  // Celebrate 15+ style errors (Map of segments)
  if (err.name === "CelebrateError") {
    const details = [];
    for (const [segment, joiError] of err.details.entries()) {
      details.push(
        ...joiError.details.map((d) => ({
          segment,
          path: d.path,
          message: d.message,
        }))
      );
    }
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      details,
    });
  }

  // כל שאר השגיאות
  return res.status(err.status || 500).json({
    success: false,
    message: err.message || "Server error",
  });
});

/* ----------------------------------------
 * 🚀 Start
 * -------------------------------------- */
const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB();
    process.on("unhandledRejection", (r) =>
      console.error("UNHANDLED REJECTION:", r)
    );
    process.on("uncaughtException", (e) =>
      console.error("UNCAUGHT EXCEPTION:", e)
    );

    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  }
})();

