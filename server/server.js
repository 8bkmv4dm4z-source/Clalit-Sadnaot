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
const connectDB = require("./config/db"); // ✅ use the new helper
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const compression = require("compression");
const mongoSanitize = require("express-mongo-sanitize");
const cookieParser = require("cookie-parser");

const app = express();
app.disable("x-powered-by");

/* ----------------------------------------
 * 🔹 בסיס
 * -------------------------------------- */
// חשוב לזיהוי IP נכון מאחורי פרוקסי
app.enable("trust proxy");

// JSON parsing
app.use(express.json());

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
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per 15 min
  standardHeaders: true, // adds RateLimit-* headers
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});
app.use(globalLimiter);
app.use(cookieParser());

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
 * 🌐 CORS
 * -------------------------------------- */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};
app.use(cors(corsOptions));

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
  // הגנה מופעלת רק על פעולות כתיבה
  const method = req.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return next();

  // החרגה לאדמין / לבנים
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

// ⚠️ חשוב: למקד את המגבלה רק על כתיבות של workshops
app.use("/api/workshops", workshopWriteLimiter, workshopsRouter);

// שאר הנתיבים ללא מגביל גלובלי
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/profile", profileRouter);

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
