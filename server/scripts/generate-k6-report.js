/**
 * generate-k6-report.js — robust NDJSON-safe version (ESM compatible)
 * -------------------------------------------------------------------
 * Works with large K6 outputs (newline-delimited JSON)
 * and auto-opens the HTML report on Windows/macOS.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process"; // ✅ ESM import replaces require()

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const input = path.resolve(__dirname, "../tests/results/loadtest.json");
const output = path.resolve(__dirname, "../tests/results/loadtest.html");

console.log("📊 Generating K6 HTML report...");
console.log(`   Input:  ${input}`);
console.log(`   Output: ${output}`);

// 🧩 Ensure file exists
if (!fs.existsSync(input)) {
  console.error("❌ Missing loadtest.json. Run 'npm run test:load' first.");
  process.exit(1);
}

/* 🧩 Normalize NDJSON → valid JSON array */
function normalizeJsonIfNeeded(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").trimStart();

  // Try normal JSON first
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.metrics) {
      console.log("✅ Detected standard K6 summary JSON — skipping normalization");
      return;
    }
  } catch {
    // Will try NDJSON next
  }

  console.log("⚙️ Detected NDJSON (multiple JSON lines) — converting...");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch {
        console.warn(`⚠️ Skipping invalid line ${i + 1}`);
        return null;
      }
    })
    .filter(Boolean);

  fs.writeFileSync(filePath, JSON.stringify(lines, null, 2));
  console.log(`✅ Converted NDJSON → valid JSON array (${lines.length} records)`);
}

normalizeJsonIfNeeded(input);

try {
  const mod = await import("k6-html-reporter");
  const fn =
    mod?.generateSummaryReport ||
    mod?.default?.generateSummaryReport ||
    mod?.generateReport ||
    mod?.default;

  if (typeof fn !== "function") {
    console.error("❌ Could not find valid report generator in k6-html-reporter");
    console.error("Exported keys:", Object.keys(mod));
    process.exit(1);
  }

  await fn({
    jsonFile: input,
    output: output,
    reportOptions: {
      title: "📈 Galil Workshops Load Test",
      summaryTimeUnit: "ms",
      includeTestRunId: false,
      summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)"],
    },
  });

  console.log("✅ Report generated successfully!");
  console.log(`📄 Open: ${output}`);

  // ✅ ESM-safe file opener
  if (process.platform === "win32") {
    exec(`start "" "${output}"`);
  } else if (process.platform === "darwin") {
    exec(`open "${output}"`);
  } else {
    exec(`xdg-open "${output}"`);
  }
} catch (err) {
  console.error("❌ Failed to generate report:", err);
  process.exit(1);
}
