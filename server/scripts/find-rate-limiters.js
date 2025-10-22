/**
 * 🔍 Find all rate-limiters and related code in the backend
 * Works in plain CommonJS Node (no "type": "module" needed)
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const root = path.join(__dirname, ".."); // go one level up from scripts/
const rateKeywords = [
  "rateLimit(",
  "express-rate-limit",
  "limiter",
  "RateLimit",
  "writeLimiter",
  "workshopWriteLimiter",
  "res.status(429)",
];


console.log("🔎 Scanning for rate limiters in:", root);

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    // 🧹 Skip useless directories
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "logs" ||
        entry.name === ".git"
      ) {
        continue;
      }
      scanDir(full);
    } else if (entry.name.endsWith(".js")) {
      const lines = fs.readFileSync(full, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const keyword of rateKeywords) {
          if (line.includes(keyword)) {
            console.log(
              `📍 Found "${keyword}" in ${full}:${i + 1}\n    ${line.trim()}`
            );
          }
        }
      });
    }
  }
}


scanDir(root);
console.log("\n✅ Done scanning.");
