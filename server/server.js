// server/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const connectDB = require("./config/db"); // ✅ use the new helper

const app = express();

// --- 🔹 Basic middlewares ---
app.use(cors());
app.use(express.json());

// --- 🔹 Log file setup ---
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

// Redirect console output to file + terminal
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

// --- 🔹 Health check route ---
app.get("/", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// --- 🔹 Routers ---
app.use("/api/auth", require("./routes/auth"));
app.use("/api/workshops", require("./routes/workshops"));
app.use("/api/users", require("./routes/users"));
app.use("/api/profile", require("./routes/profile"));

// --- 🔹 Start server only after DB connection ---
const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB(); // ✅ uses the improved db.js
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
