/**
 * 🗑️ TEMP USER CLEANER
 * Purpose: Delete users whose email starts with the letter 'u'.
 * Logic: Regex /^u/i (Starts with U, case-insensitive).
 * * USAGE:
 * node deleteTempUsers.js            (Dry Run - Lists users to be deleted)
 * node deleteTempUsers.js --delete   (Destructive - Actually deletes them)
 */

require("dotenv").config({ path: "../.env" });
const mongoose = require("mongoose");

// Load User Model
let User;
try {
  User = require("../models/User");
} catch (e) {
  console.error("❌ Error: Could not find '../models/User.js'.", e);
  process.exit(1);
}

// =========================================================
// 🚀 RUNNER
// =========================================================
async function run() {
  const args = process.argv.slice(2);
  const IS_DELETE_MODE = args.includes("--delete");

  console.log(`\n==================================================`);
  console.log(`🗑️  USER DELETION TOOL`);
  console.log(`    Filter: Email starts with 'u' (case insensitive)`);
  console.log(`    Mode: ${IS_DELETE_MODE ? '⚠️  DELETING DATA' : '🛡️  DRY RUN (Safe)'}`);
  console.log(`==================================================\n`);

  try {
    await mongoose.connect(process.env.MONGO_URI || process.env.DATABASE_URL);
    console.log("✅ DB Connected");
  } catch (err) {
    console.error("❌ DB Error:", err.message);
    process.exit(1);
  }

  // 🔍 THE FILTER
  // ^ = Start of string, u = the letter u, i = case insensitive
  const filter = { email: { $regex: /^u/i } }; 

  try {
    // 1. FIND THEM
    const usersFound = await User.find(filter).select("email name _id");
    const count = usersFound.length;

    if (count === 0) {
      console.log("🤷 No users found starting with 'u'.");
      process.exit(0);
    }

    // 2. LIST THEM (So you can check for real people like 'Uri')
    console.log(`Found ${count} users matching the criteria:\n`);
    usersFound.forEach((u, i) => {
        console.log(`   ${i+1}. [${u.email}]  (${u.name || "No Name"})`);
    });
    console.log("\n--------------------------------------------------");

    // 3. DELETE THEM (Only if flag is present)
    if (IS_DELETE_MODE) {
      console.log(`\n⚠️  Deleting ${count} users...`);
      const result = await User.deleteMany(filter);
      console.log(`✅ Successfully deleted ${result.deletedCount} users.`);
    } else {
      console.log(`\n🛡️  DRY RUN COMPLETE.`);
      console.log(`   To actually delete these users, run:`);
      console.log(`   node deleteTempUsers.js --delete`);
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    mongoose.connection.close();
  }
}

run();
