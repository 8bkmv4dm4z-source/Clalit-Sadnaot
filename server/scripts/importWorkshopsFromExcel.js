/**
 * importWorkshopsFromExcel.js
 * -----------------------------------------------------------------------------
 * Reads an Excel sheet and registers workshops through the admin API route.
 *
 * Required columns (header-insensitive, Hebrew aliases supported):
 * 1. id (מסד)
 * 2. type (סוג סדנה)
 * 3. description (תיאור)
 * 4. end date (ignored)
 * 5. amount of months (ignored)
 * 6. payment status (ignored)
 * 7. city (עיר)
 * 8. amount / כמות פעמים (sessionsCount)
 * 9. current participants amount (used as maxParticipants)
 *
 * Usage:
 *   ADMIN_TOKEN=... node server/scripts/importWorkshopsFromExcel.js \
 *     --file=./data/workshops.xlsx \
 *     --api=http://localhost:5000/api \
 *     --days=Sunday,Tuesday \
 *     --defaultStart=2025-01-01 \
 *     [--sheet=Sheet1] [--dry-run]
 *
 * Notes:
 * - The script calls POST /workshops (admin route) for each row.
 * - Missing startDate/days fall back to --defaultStart and --days.
 * - endDate is calculated by the server; this script does not send it.
 * - Unknown headers are ignored; strict validation happens server-side.
 */

const fs = require("fs");
const ExcelJS = require("exceljs");
const { safeFetch } = require("../utils/safeFetch");
require("dotenv").config();

const VALID_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const HEADER_ALIASES = {
  id: ["id", "מסד", "workshopid", "identifier"],
  type: ["type", "סוג", "סוגסדנה", "סוג סדנה"],
  description: ["description", "desc", "תיאור", "אפיון"],
  city: ["city", "עיר"],
  sessionsCount: [
    "amount",
    "כמות",
    "כמותפעמים",
    "כמות פעמים",
    "sessions",
    "meetings",
  ],
  maxParticipants: [
    "currentparticipants",
    "current participants",
    "current participants amount",
    "maxparticipants",
    "capacity",
    "משתתפים",
    "משתתפיםנוכחי",
  ],
  startDate: ["startdate", "תאריךתחלה", "התחלה", "start"],
  days: ["days", "meetingdays", "weekday", "ימים", "ימי", "ימי מפגש"],
  hour: ["hour", "time", "שעה"],
};

const DAY_KEYWORDS = [
  { tokens: ["sunday", "sun", "ראשון"], value: "Sunday" },
  { tokens: ["monday", "mon", "שני"], value: "Monday" },
  { tokens: ["tuesday", "tue", "שלישי"], value: "Tuesday" },
  { tokens: ["wednesday", "wed", "רביעי"], value: "Wednesday" },
  { tokens: ["thursday", "thu", "חמישי"], value: "Thursday" },
  { tokens: ["friday", "fri", "שישי"], value: "Friday" },
  { tokens: ["saturday", "sat", "שבת"], value: "Saturday" },
];

function parseArgs(argv = process.argv.slice(2)) {
  return argv.reduce((acc, arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    acc[key] = value === undefined ? true : value;
    return acc;
  }, {});
}

function normalizeHeader(header = "") {
  return String(header)
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05fe]+/g, "");
}

function resolveHeaderKey(rawHeader) {
  const normalized = normalizeHeader(rawHeader);
  for (const [target, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      if (normalized === normalizeHeader(alias)) return target;
    }
  }
  return null;
}

function buildHeaderMap(worksheet) {
  const headerRow = worksheet.getRow(1);
  const map = new Map();
  headerRow.eachCell((cell, colNumber) => {
    const key = resolveHeaderKey(cell.value);
    if (key) map.set(colNumber, key);
  });
  return map;
}

function parseDays(value, fallbackDays) {
  if (!value) return [...fallbackDays];
  if (Array.isArray(value)) return value.map(String);

  const parts = String(value)
    .split(/[,\n]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());

  const valid = parts.filter((d) => VALID_DAYS.includes(d));
  return valid.length ? valid : [...fallbackDays];
}

function coerceDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function extractDaysFromDescription(description) {
  if (!description) return [];
  const normalized = String(description).toLowerCase();
  const hits = new Set();

  DAY_KEYWORDS.forEach(({ tokens, value }) => {
    tokens.forEach((token) => {
      if (normalized.includes(token.toLowerCase())) hits.add(value);
    });
  });

  return Array.from(hits);
}

function formatHour(hourNum, minutes = 0) {
  const paddedHours = String(Math.max(0, Math.min(23, Math.floor(hourNum)))).padStart(2, "0");
  const paddedMinutes = String(Math.max(0, Math.min(59, Math.floor(minutes)))).padStart(2, "0");
  return `${paddedHours}:${paddedMinutes}`;
}

function extractHourFromText(text) {
  if (!text) return "";
  const match = String(text).match(/(?:at|בשעה)?\s*([01]?\d|2[0-3])(?::(\d{2}))?/i);
  if (!match) return "";

  const hourNum = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (!Number.isFinite(hourNum) || hourNum < 0 || hourNum > 23) return "";
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) return "";

  return formatHour(hourNum, minutes);
}

function coerceNumber(value) {
  if (value === undefined || value === null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function deriveTitle({ row, index, days, hour }) {
  if (days?.length) {
    const base = days.join(" & ");
    return hour ? `${base} ${hour}` : base;
  }
  if (row.description) return String(row.description).trim();
  if (row.type) return String(row.type).trim();
  if (row.id) return `Workshop ${row.id}`;
  return `Imported Workshop ${index}`;
}

async function createWorkshop({ apiBase, token, payload, dryRun }) {
  const url = `${apiBase.replace(/\/$/, "")}/workshops`;
  if (dryRun) {
    console.log("[dry-run] Would POST", url, payload);
    return { ok: true, skipped: true };
  }

  const res = await safeFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new Error(data?.message || `API error (${res.status})`);
  }

  return data;
}

async function loadRowsFromWorkbook({ file, sheet }) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const worksheet = typeof sheet === "string"
    ? workbook.getWorksheet(sheet)
    : workbook.getWorksheet(sheet || 1);

  if (!worksheet) throw new Error(`Worksheet not found: ${sheet || 1}`);

  const headerMap = buildHeaderMap(worksheet);
  const rows = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // headers

    const entry = {};
    row.eachCell((cell, colNumber) => {
      const key = headerMap.get(colNumber);
      if (!key) return;
      entry[key] = cell.value;
    });
    rows.push(entry);
  });

  return rows;
}

async function run() {
  const args = parseArgs();
  const file = args.file || args.f;
  const apiBase = args.api || process.env.API_BASE_URL || "http://localhost:5000/api";
  const token = args.token || process.env.ADMIN_TOKEN;
  const dryRun = Boolean(args["dry-run"] || args.dryRun);
  const defaultStartDate = args.defaultStart || process.env.DEFAULT_START_DATE;
  const defaultDays = parseDays(
    args.days || process.env.DEFAULT_WORKSHOP_DAYS || "Sunday",
    VALID_DAYS
  );

  if (!file) throw new Error("--file is required (path to Excel workbook)");
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  if (!token) throw new Error("ADMIN_TOKEN (JWT) is required for the admin route");

  const rows = await loadRowsFromWorkbook({ file, sheet: args.sheet });
  console.log(`📑 Loaded ${rows.length} data rows from ${file}`);

  let successCount = 0;
  let skippedCount = 0;
  let failureCount = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const descriptionDays = extractDaysFromDescription(row.description);

    const startDate =
      coerceDate(row.startDate) || coerceDate(defaultStartDate) || new Date().toISOString();
    const days = parseDays(row.days, descriptionDays.length ? descriptionDays : defaultDays);
    const sessionsCount = coerceNumber(row.sessionsCount) || 1;
    const hour = extractHourFromText(row.hour) || extractHourFromText(row.description);

    const payload = {
      title: deriveTitle({ row, index: i + 1, days, hour }),
      type: row.type || "",
      description: row.description || "",
      city: row.city || "",
      sessionsCount,
      startDate,
      days,
      hour,
      maxParticipants: coerceNumber(row.maxParticipants) ?? undefined,
      available: true,
    };

    if (!payload.city) {
      console.warn(`⚠️ Row ${i + 2} skipped: missing city`);
      skippedCount += 1;
      continue;
    }

    try {
      await createWorkshop({ apiBase, token, payload, dryRun });
      successCount += 1;
      console.log(`✅ Imported row ${i + 2}: ${payload.title}`);
    } catch (err) {
      failureCount += 1;
      console.error(`❌ Failed row ${i + 2}: ${err.message}`);
    }
  }

  console.log("\nSummary:");
  console.log(`  ✅ Success: ${successCount}`);
  console.log(`  ⚠️ Skipped: ${skippedCount}`);
  console.log(`  ❌ Failed: ${failureCount}`);
}

run().catch((err) => {
  console.error("❌ Import script failed:", err.message);
  process.exit(1);
});
