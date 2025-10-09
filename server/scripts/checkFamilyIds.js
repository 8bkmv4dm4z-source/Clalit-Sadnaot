const mongoose = require("mongoose");
require("dotenv").config();

console.log("🚀 Starting checkFamilyIds.js...");
console.log("🌍 MONGO_URI:", process.env.MONGO_URI ? "Loaded ✅" : "❌ Missing!");

async function main() {
  try {
    console.log("⏳ Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const users = await mongoose.connection.db.collection("users").find().toArray();
    console.log(`📦 Found ${users.length} users\n`);

    users.forEach(u => {
      console.log("👤 User:", u.name || "(no name)");
      if (!u.familyMembers || u.familyMembers.length === 0) {
        console.log("   ⚪ No family members");
      } else {
        console.table(
          u.familyMembers.map(f => ({
            _id: f._id || "❌ Missing ID",
            name: f.name,
            relation: f.relation || "-",
            idNumber: f.idNumber || "-",
          }))
        );
      }
      console.log("--------------------------------------------------");
    });

    await mongoose.disconnect();
    console.log("✅ Done and disconnected.");
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

main();
