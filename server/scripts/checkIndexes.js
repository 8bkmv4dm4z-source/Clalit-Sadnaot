// server/scripts/checkIndexes.js
const mongoose = require("mongoose");
require("dotenv").config({ path: "./server/.env" });

(async () => {
  try {
    console.log("⏳ Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const db = mongoose.connection.db;
    if (!db) throw new Error("Database not connected.");

    // list all collections and their indexes
    const collections = await db.listCollections().toArray();

    for (const col of collections) {
      console.log(`\n📁 Collection: ${col.name}`);
      const indexCursor = db.collection(col.name).listIndexes();
      const indexes = await indexCursor.toArray();
      console.log(indexes);
    }

    await mongoose.disconnect();
    console.log("\n🔌 Disconnected.");
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
})();
