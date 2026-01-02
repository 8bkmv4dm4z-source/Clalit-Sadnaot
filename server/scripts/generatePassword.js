/**
 * generatePasswords.js
 * --------------------------------------------------
 * Utility script that automatically generates random
 * passwords for users that currently have no passwordHash.
 *
 * Usage:
 *   node server/scripts/generatePasswords.js
 *
 * Notes:
 * - The generated passwords are printed to console and saved to CSV.
 * - You should share them securely with the respective users.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { hashPassword } = require("../utils/passwordHasher");
const User = require("../models/User");

/* ==========================================================
   1. Utility: Random password generator
   ========================================================== */
function generatePassword(length = 10) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$!?";
  return Array.from({ length }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("");
}

/* ==========================================================
   2. CSV Writer helper
   ========================================================== */
function saveToCSV(data) {
  const headers = "Name,Email,New Password\n";
  const rows = data
    .map((r) => `${r.name || "-"},${r.email},${r.password}`)
    .join("\n");

  const csvPath = path.join(__dirname, "generated_passwords.csv");
  fs.writeFileSync(csvPath, headers + rows);
  console.log(`📄 Saved CSV to: ${csvPath}`);
}

/* ==========================================================
   3. Main Script
   ========================================================== */
async function run() {
  console.log("🔐 Connecting to MongoDB...");

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected successfully.\n");

    // Find users without passwordHash
    const users = await User.find({
      $or: [{ passwordHash: { $exists: false } }, { passwordHash: "" }],
    });

    if (!users.length) {
      console.log("🎉 All users already have passwords.");
      process.exit(0);
    }

    console.log(`🧾 Found ${users.length} user(s) missing passwords:\n`);

    const results = [];

    for (const user of users) {
      const newPassword = generatePassword(10);
      const passwordHash = await hashPassword(newPassword);

      user.passwordHash = passwordHash;
      await user.save();

      results.push({
        email: user.email,
        name: user.name || "—",
        password: newPassword,
      });
    }

    console.log("✅ Passwords generated and saved successfully!\n");

    console.table(
      results.map((r) => ({
        Name: r.name,
        Email: r.email,
        "New Password": r.password,
      }))
    );

    saveToCSV(results);

    console.log("\n⚠️ Please store these passwords securely.\n");
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔒 MongoDB connection closed.");
  }
}

/* ==========================================================
   4. Execute
   ========================================================== */
run();
