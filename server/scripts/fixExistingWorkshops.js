/**
 * 🛠️ WORKSHOP FIXER (NO DEFAULT NAME)
 * * LOGIC:
 * 1. Reverse Order: Cuts Time & Days first.
 * 2. No Defaults: If no specific activity name is found, the title starts with "Day...".
 * 3. Studio: Defaults to "-" unless a specific keyword (Park, Studio) is found.
 */

require("dotenv").config({ path: "../.env" });
const mongoose = require("mongoose");
const fs = require("fs");
const csv = require("csv-parser");
const path = require("path");

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
// ⚙️ HELPERS
// =========================================================

const HEBREW_DAYS_MAP = {
  'ראשון': 'Sunday', 'שני': 'Monday', 'שלישי': 'Tuesday',
  'רביעי': 'Wednesday', 'חמישי': 'Thursday', 'שישי': 'Friday', 'שבת': 'Saturday'
};

const ENG_TO_HEB_SHORT = {
  'Sunday': 'א', 'Monday': 'ב', 'Tuesday': 'ג', 'Wednesday': 'ד',
  'Thursday': 'ה', 'Friday': 'ו', 'Saturday': 'ש'
};

const REVERSED_KEYWORDS = ['ןושאר', 'ינש', 'ישיליש', 'יעיבר', 'ישימח'];

function fixHebrewDirection(text) {
  if (!text) return "";
  let cleanText = text.toString().trim();
  const isReversed = REVERSED_KEYWORDS.some(k => cleanText.includes(k));
  return isReversed ? cleanText.split("").reverse().join("") : cleanText;
}

// =========================================================
// 🧠 NAME EXTRACTION LOGIC
// =========================================================
function extractActivityName(description, category) {
    let clean = description.trim();

    // 1. CUT OFF TIME
    const timeIndex = clean.search(/\d{1,2}[:\.]\d{2}/);
    if (timeIndex > -1) {
        clean = clean.substring(0, timeIndex).trim();
    }

    // 2. CUT OFF DAYS
    Object.keys(HEBREW_DAYS_MAP).forEach(day => {
        const dayIndex = clean.indexOf(day);
        if (dayIndex > -1) {
            clean = clean.substring(0, dayIndex).trim();
        }
    });

    // 3. CLEANUP SUFFIXES
    clean = clean.replace(/\s+[ב]?[-]?$/i, '').trim(); 
    clean = clean.replace(/[-]$/, '').trim(); 
    clean = clean.replace(/\s+[א-ת][']?$/i, '').trim(); // Remove stray letters like "ד" or "ב'"

    // 4. REMOVE CATEGORY PREFIX
    if (clean.startsWith(category)) {
        clean = clean.replace(category, '').trim();
    }

    // 5. REMOVE LEADING PUNCTUATION
    clean = clean.replace(/^[-:\s]+/, '').trim();

    // 6. FINAL CHECK (Changed: Returns "" instead of category)
    if (!clean || clean.length < 2) {
        return ""; // <--- RETURNS EMPTY IF NO NAME FOUND
    }

    return clean;
}

function parseScheduleAndDetails(description, startDate) {
  const normalizedText = fixHebrewDirection(description);
  
  // Detect Days
  let days = [];
  Object.keys(HEBREW_DAYS_MAP).forEach(hebKey => {
    if (normalizedText.includes(hebKey)) days.push(HEBREW_DAYS_MAP[hebKey]);
  });
  if (days.length === 0 && startDate) {
    days.push(startDate.toLocaleDateString('en-US', { weekday: 'long' }));
  }
  days = [...new Set(days)];

  // Detect Studio (Default to "-")
  let studio = "-"; 
  if (normalizedText.includes("פארק")) studio = "פארק";
  if (normalizedText.includes("סטודיו")) studio = "סטודיו";
  if (normalizedText.includes("מכון פיזיו")) studio = "מכון פיזיו";
  if (normalizedText.includes("סורוקה")) studio = "סורוקה";
  if (normalizedText.includes("מתנס") || normalizedText.includes('מתנ"ס')) studio = "מתנ\"ס";
  if (normalizedText.includes("נווה נוי")) studio = "נווה נוי";
  if (normalizedText.includes("נווה זאב")) studio = "נווה זאב";

  return { days, cleanDescription: normalizedText, detectedStudio: studio };
}

function parseSmartDate(dateStr) {
    if (!dateStr) return null;
    const clean = dateStr.toString().replace(/['"]/g, '').trim();
    const parts = clean.split(/[/\.-]/);
    if (parts.length !== 3) return null;
  
    let day, month, year;
    if (parts[0].length === 4) { 
      year = parseInt(parts[0], 10); month = parseInt(parts[1], 10); day = parseInt(parts[2], 10);
    } else { 
      day = parseInt(parts[0], 10); month = parseInt(parts[1], 10); year = parseInt(parts[2], 10);
    }
  
    if (year < 100) year += 2000;
    const isoString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00.000Z`;
    const dateObj = new Date(isoString);
    return isNaN(dateObj.getTime()) ? null : dateObj;
  }

// =========================================================
// 🚀 MAIN RUNNER
// =========================================================
async function run() {
  const args = process.argv.slice(2);
  const IS_WRITE_MODE = args.includes("--write");

  console.log(`\n==================================================`);
  console.log(`🛠️  WORKSHOP FIXER (NO DEFAULTS)`);
  console.log(`MODE: ${IS_WRITE_MODE ? '⚠️  UPDATING DB' : '🛡️  DRY RUN'}`);
  console.log(`==================================================\n`);

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
      await processUpdates(results, IS_WRITE_MODE);
    });
}

async function processUpdates(rows, isWriteMode) {
  let count = { updated: 0, notFound: 0, skipped: 0 };

  for (const [index, row] of rows.entries()) {
    const rawGroup = row['קבוצה']; 
    const rawDesc = row['אפיון'];   
    const rawDate = row['תאריך התחלה']; 
    const rawCoach = row['מאמנת'];
    
    if (!rawDate || !rawDesc) { count.skipped++; continue; }

    const startDate = parseSmartDate(rawDate);
    if (!startDate) { count.skipped++; continue; }

    // 1. RECREATE OLD TITLE (To find the document)
    const { cleanDescription } = parseScheduleAndDetails(rawDesc, startDate);
    const cleanType = rawGroup ? fixHebrewDirection(rawGroup).trim() : "כללי";
    const oldTitleToCheck = `${cleanType} - ${cleanDescription}`; 

    // 2. CREATE NEW DATA
    const { days, detectedStudio } = parseScheduleAndDetails(rawDesc, startDate);
    const cleanCoach = rawCoach ? fixHebrewDirection(rawCoach).trim() : "צוות המרכז";
    const hebrewDaysString = days.map(d => ENG_TO_HEB_SHORT[d]).join(',');

    // Extract Name
    const activityName = extractActivityName(cleanDescription, cleanType);
    
    // 🧠 SMART TITLE FORMATTING
    let newTitle = "";
    if (activityName && activityName.length > 1) {
        // e.g. "פילאטיס, יום א בהנחיית ימית"
        newTitle = `${activityName}, יום ${hebrewDaysString} בהנחיית ${cleanCoach}`;
    } else {
        // e.g. "יום א,ג בהנחיית עדי חזן" (No comma at start)
        newTitle = `יום ${hebrewDaysString} בהנחיית ${cleanCoach}`;
    }

    // 3. EXECUTE
    if (isWriteMode) {
      const result = await Workshop.updateOne(
        { title: oldTitleToCheck },
        { 
          $set: { 
            title: newTitle,
            description: cleanDescription,
            studio: detectedStudio
          }
        }
      );

      if (result.matchedCount > 0) {
        process.stdout.write("✅ ");
        count.updated++;
      } else {
        process.stdout.write("❓ ");
        count.notFound++;
      }
    } else {
      console.log(`OLD: "${cleanDescription}"`);
      console.log(`NEW: "${newTitle}"`); 
      console.log(`-----------------------------------`);
      count.updated++;
    }
  }

  console.log(`\n\n🏁 SUMMARY:`);
  console.log(`✅ Processed: ${count.updated}`);
  console.log(`❓ Not Found: ${count.notFound}`);
  console.log(`👋 Done.`);
  process.exit(0);
}

run();