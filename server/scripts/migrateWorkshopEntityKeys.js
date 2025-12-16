/**
 * 🛠️ Workshop Import Script (Excel/CSV to MongoDB)
 * Fixes: Strong Israeli Date Parsing (No US Fallback)
 */

require("dotenv").config({ path: "../.env" });
const mongoose = require("mongoose");
const fs = require("fs");
const csv = require("csv-parser");
const path = require("path");

// =========================================================
// 1. הגדרות
// =========================================================
const CSV_FILENAME = "data.csv";
const CSV_PATH = path.join(__dirname, CSV_FILENAME);

let Workshop;
try {
  Workshop = require("../models/Workshop");
} catch (e) {
  console.error("❌ Error: Could not find '../models/Workshop.js'.");
  process.exit(1);
}

// =========================================================
// 2. פונקציות עזר
// =========================================================
const HEBREW_DAYS_MAP = {
  'ראשון': 'Sunday', 'שני': 'Monday', 'שלישי': 'Tuesday',
  'רביעי': 'Wednesday', 'חמישי': 'Thursday', 'שישי': 'Friday', 'שבת': 'Saturday'
};

/**
 * מפרק תאריך ישראלי בלבד (DD/MM/YYYY).
 * לא מאפשר פורמט אמריקאי.
 */
function parseIsraeliDate(dateStr) {
  if (!dateStr) return null;
  
  // 1. ניקוי יסודי: מוריד מרכאות, רווחים ותווים נסתרים
  let clean = dateStr.toString().replace(/['"]/g, '').trim();
  
  // 2. חיפוש תבנית של מספרים עם מפרידים (/, ., -)
  // דוגמה: 14/01/2026 או 1.1.26
  const match = clean.match(/^(\d{1,2})[/\.-](\d{1,2})[/\.-](\d{2,4})$/);

  if (!match) {
    // אם התבנית לא מתאימה, מחזירים null מיד (בלי ניחושים!)
    return null;
  }

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  let year = parseInt(match[3], 10);

  // 3. תיקון שנים מקוצרות (26 -> 2026)
  if (year < 100) year += 2000;

  // 4. בדיקת תקינות בסיסית
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // 5. יצירת תאריך UTC לשעה 12:00 בצהריים
  const isoString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00.000Z`;
  const dateObj = new Date(isoString);

  return isNaN(dateObj.getTime()) ? null : dateObj;
}

function parseSchedule(text) {
  if (!text) return { days: ['Sunday'], hour: "18:00" }; 

  const days = [];
  Object.keys(HEBREW_DAYS_MAP).forEach(hebKey => {
    if (text.includes(hebKey)) days.push(HEBREW_DAYS_MAP[hebKey]);
  });

  let hour = "18:00"; 
  const timeMatch = text.match(/(\d{1,2})[:\.](\d{2})/);
  if (timeMatch) {
    hour = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
  }

  return { days: days.length > 0 ? days : ['Sunday'], hour };
}

// =========================================================
// 3. לוגיקה ראשית
// =========================================================
async function run() {
  const args = process.argv.slice(2);
  const IS_WRITE_MODE = args.includes("--write");

  console.log(`\n==================================================`);
  console.log(`🚀 WORKSHOP IMPORT - ROBUST DATE FIX`);
  console.log(`MODE: ${IS_WRITE_MODE ? '⚠️  WRITE TO DB' : '🛡️  DRY RUN'}`);
  console.log(`==================================================\n`);

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ File missing: ${CSV_FILENAME}`);
    process.exit(1);
  }

  // חיבור DB רק במצב כתיבה (אופציונלי, אבל בטוח יותר)
  if (!process.env.MONGO_URI && !process.env.DATABASE_URL) {
    console.error("❌ Missing MONGO_URI");
    process.exit(1);
  }
  
  try {
    await mongoose.connect(process.env.MONGO_URI || process.env.DATABASE_URL);
    console.log("✅ DB Connected");
  } catch (err) {
    console.error("❌ DB Error:", err.message);
    process.exit(1);
  }

  const results = [];
  fs.createReadStream(CSV_PATH, { encoding: 'utf8' }) 
    .pipe(csv())
    .on("data", (data) => results.push(data))
    .on("end", async () => {
      await processRows(results, IS_WRITE_MODE);
    });
}

async function processRows(rows, isWriteMode) {
  let count = { success: 0, skipped: 0, failed: 0 };
  console.log(`📊 Processing ${rows.length} rows...\n`);

  for (const [index, row] of rows.entries()) {
    const rowNum = index + 2; // התאמה למספר שורה באקסל

    // קריאת שדות
    const rawGroup = row['קבוצה'];
    const rawDesc = row['אפיון'];
    const rawDate = row['תאריך התחלה'];
    const rawCity = row['יישוב'];
    const rawCoach = row['מאמנת'];
    const rawSessions = row['מספר אימונים'];
    const rawCapacity = row['מס\' משתתפים'];

    // דילוג על שורות ריקות
    if (!rawDate || !rawCity) {
      if (rawGroup) {
        console.warn(`🔸 Row ${rowNum}: Skipped (Missing Date/City)`);
        count.skipped++;
      }
      continue;
    }

    // 1. פענוח תאריך
    const startDate = parseIsraeliDate(rawDate);

    // הגנה מקריסה: אם התאריך לא פוענח, מדלגים ומדווחים
    if (!startDate) {
      console.error(`❌ Row ${rowNum} Failed: Invalid Date -> "${rawDate}"`);
      count.failed++;
      continue; // מדלג לשורה הבאה
    }

    // 2. שאר הנתונים
    const { days, hour } = parseSchedule(rawDesc);
    const sessions = parseInt(rawSessions, 10) || 12;
    const capacity = parseInt(rawCapacity, 10) || 20;

    const workshopData = {
      title: `${rawGroup} - ${rawDesc}`,
      type: rawGroup || "General",
      description: rawDesc || "",
      city: rawCity.trim(),
      address: rawCity.trim(),
      studio: "מרכז ספורט",
      coach: rawCoach ? rawCoach.trim() : "TBA",
      startDate: startDate,
      sessionsCount: sessions,
      days: days,
      hour: hour,
      maxParticipants: capacity,
      waitingListMax: 10,
      price: 0,
      available: true,
      ageGroup: "adults",
      image: "",
      participants: [],
      familyRegistrations: [],
      waitingList: []
    };

    if (isWriteMode) {
      try {
        const doc = new Workshop(workshopData);
        await doc.save();
        process.stdout.write("✅ ");
        count.success++;
      } catch (err) {
        process.stdout.write("❌ ");
        console.error(`\n   Error Row ${rowNum}: ${err.message}`);
        count.failed++;
      }
    } else {
      // הדפסה ללא קריסה (שימוש ב-toISOString בטוח כי startDate נבדק כבר)
      const dateStr = startDate.toISOString().split('T')[0];
      console.log(`[Row ${rowNum}] ${dateStr} | ${days.join('&')} ${hour} | ${workshopData.title}`);
      count.success++;
    }
  }

  console.log(`\n\n🏁 SUMMARY:`);
  console.log(`✅ Success: ${count.success}`);
  console.log(`⚠️ Skipped: ${count.skipped}`);
  console.log(`❌ Failed:  ${count.failed}`);
  console.log(`👋 Done.`);
  process.exit(0);
}

run();