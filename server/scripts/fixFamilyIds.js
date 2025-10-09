// scripts/fixFamilyIds.js
const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
require("dotenv").config();

// ודא שה־.env שלך כולל MONGO_URI
const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!uri) {
  console.error("❌ Missing MONGO_URI in .env");
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(uri);
    console.log("✅ Connected to MongoDB");

    const users = await mongoose.connection.db.collection("users").find().toArray();

    let updatedCount = 0;

    for (const user of users) {
      if (!user.familyMembers) continue;

      let changed = false;
      const updatedFamily = user.familyMembers.map((fm) => {
        if (!fm._id) {
          fm._id = new ObjectId();
          changed = true;
        }
        return fm;
      });

      if (changed) {
        await mongoose.connection.db
          .collection("users")
          .updateOne({ _id: user._id }, { $set: { familyMembers: updatedFamily } });
        console.log("🛠 Fixed user:", user._id.toString());
        updatedCount++;
      }
    }

    console.log(`🎯 Done. Fixed ${updatedCount} users.`);
    mongoose.disconnect();
  } catch (err) {
    console.error("🔥 Error:", err);
    process.exit(1);
  }
})();
