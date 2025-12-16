/**
 * 🛠️ Workshop Import Script (Fixed Title & Studio)
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
// 1. CONFIGURATION & MAPS
// =========================================================

const HEBREW_DAYS_MAP = {
  'ראשון': 'Sunday', 'שני': 'Monday', 'שלישי': 'Tuesday',
  'רביעי': 'Wednesday', 'חמישי': 'Thursday', 'שישי': 'Friday', 'שבת': 'Saturday'
};

// 🆕 NEW: Map for Title Generation (English -> Hebrew Shorthand)
const ENG_TO_HEB_SHORT = {
  'Sunday': 'א', 'Monday': 'ב', 'Tuesday': 'ג', 'Wednesday': 'ד',
  'Thursday': 'ה', 'Friday': 'ו', 'Saturday': 'ש'
};

const HEBREW_AGE_MAP = {
  "children": "ילדים",
  "youth": "נוער",
  "seniors": "גיל הזהב",
  "adults": "מבוגרים"
};

const REVERSED_KEYWORDS = ['ןושאר', 'ינש', 'ישיליש', 'יעיבר', 'ישימח'];

function fixHebrewDirection(text) {
  if (!text) return "";
  let cleanText = text.toString().trim();
  const isReversed = REVERSED_KEYWORDS.some(k => cleanText.includes(k));
  return isReversed ? cleanText.split("").reverse().join("") : cleanText;
}

function detectAgeGroupKey(text) {
  const t = text.toLowerCase();
  if (t.includes("ילדים") || t.includes("טף") || t.includes("גן")) return "children";
  if (t.includes("נוער") || t.includes("נערים") || t.includes("נערות")) return "youth";
  if (t.includes("גיל הזהב") || t.includes("בונה עצם") || t.includes("סניור")) return "seniors";
  return "adults"; 
}

/**
 * 🧠 INTELLIGENT PARSER
 */
function parseScheduleAndDetails(description, startDate) {
  const normalizedText = fixHebrewDirection(description);
  
  // --- Days ---
  let days = [];
  Object.keys(HEBREW_DAYS_MAP).forEach(hebKey => {
    if (normalizedText.includes(hebKey)) {
      days.push(HEBREW_DAYS_MAP[hebKey]);
    }
  });

  if (days.length === 0 && startDate) {
    const weekday = startDate.toLocaleDateString('en-US', { weekday: 'long' });
    days.push(weekday);
  }
  days = [...new Set(days)];

  // --- Hour ---
  let hour = "18:00"; 
  const timeMatch = normalizedText.match(/(\d{1,2})[:\.](\d{2})/);
  if (timeMatch) {
    hour = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
  }

  // --- Studio ---
  // 🟢 FIX 1: Default studio is now "-" instead of "מרכז ספורט"
  let studio = "-"; 
  
  if (normalizedText.includes("פארק")) studio = "פארק";
  if (normalizedText.includes("סטודיו")) studio = "סטודיו";
  if (normalizedText.includes("מכון פיזיו")) studio = "מכון פיזיו";
  if (normalizedText.includes("סורוקה")) studio = "סורוקה";
  if (normalizedText.includes("מתנס") || normalizedText.includes('מתנ"ס')) studio = "מתנ\"ס";
  if (normalizedText.includes("נווה נוי")) studio = "נווה נוי";
  if (normalizedText.includes("נווה זאב")) studio = "נווה זאב";

  return { days, hour, cleanDescription: normalizedText, detectedStudio: studio };
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
// 3. MAIN RUNNER
// =========================================================
async function run() {
  const args = process.argv.slice(2);
  const IS_WRITE_MODE = args.includes("--write");

  console.log(`\n==================================================`);
  console.log(`🚀 WORKSHOP IMPORT (Fixed Title & Studio)`);
  console.log(`MODE: ${IS_WRITE_MODE ? '⚠️  WRITE TO DB' : '🛡️  DRY RUN'}`);
  console.log(`==================================================\n`);

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ File missing: ${CSV_FILENAME}`);
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
    const rowNum = index + 2;

    const rawGroup = row['קבוצה']; 
    const rawDesc = row['אפיון'];   
    const rawDate = row['תאריך התחלה']; 
    const rawCity = row['יישוב'];   
    const rawCoach = row['מאמנת']; 
    const rawCapacity = row['מס\' משתתפים']; 
    const rawSessions = row['מספר אימונים']; 

    if (!rawDate || !rawCity) {
      if (rawGroup) count.skipped++;
      continue;
    }

    const startDate = parseSmartDate(rawDate);
    if (!startDate) {
      count.failed++;
      continue;
    }

    const { days, hour, cleanDescription, detectedStudio } = parseScheduleAndDetails(rawDesc, startDate);
    
    const cleanCity = fixHebrewDirection(rawCity).trim();
    const cleanCoach = rawCoach ? fixHebrewDirection(rawCoach).trim() : "צוות המרכז";
    const cleanType = rawGroup ? fixHebrewDirection(rawGroup).trim() : "כללי";
    
    // 🟢 FIX 2: Generate Hebrew Shorthand Days (e.g., "Monday, Thursday" -> "ב,ה")
    const hebrewDaysString = days.map(d => ENG_TO_HEB_SHORT[d]).join(',');

    // 🟢 FIX 3: New Title Format
    // Format: "פונקציונלי, יום ב,ה בהנחיית ניר יטח"
    const title = `${cleanType}, יום ${hebrewDaysString} בהנחיית ${cleanCoach}`;
    
    const ageKey = detectAgeGroupKey(cleanDescription); 
    const ageGroupHebrew = HEBREW_AGE_MAP[ageKey] || "מבוגרים"; 

    const workshopData = {
      title: title,               // 🆕 New formatted title
      type: cleanType,
      description: cleanDescription, // ✅ Original description (אפיון) goes here
      city: cleanCity,
      address: cleanCity,
      studio: detectedStudio,     // ✅ Will be "-" if no specific studio found
      coach: cleanCoach,
      startDate: startDate,
      days: days, 
      hour: hour, 
      sessionsCount: parseInt(rawSessions, 10) || 12,
      maxParticipants: parseInt(rawCapacity, 10) || 20, 
      
      ageGroup: ageGroupHebrew,
      
      waitingListMax: 10,
      price: 0,
      available: true,
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
      // LOG
      console.log(`[Row ${rowNum}] ${title} | Studio: ${detectedStudio}`);
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