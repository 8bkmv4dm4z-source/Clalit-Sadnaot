/**
 * MongoDB Connection Helper (Stable + Safe)
 * -----------------------------------------
 * - Loads connection string from .env (MONGODB_URI)
 * - Handles reconnect attempts and logs connection events
 * - Exits process only on fatal errors (initial connection)
 */

const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      throw new Error("Missing MONGODB_URI in .env file");
    }

    // Connect to MongoDB
    const conn = await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000, // wait max 10s
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Handle runtime disconnects
    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️ MongoDB disconnected. Attempting to reconnect...");
    });

    mongoose.connection.on("reconnected", () => {
      console.log("🔁 MongoDB reconnected successfully.");
    });

  } catch (error) {
    console.error("❌ Error connecting to MongoDB:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
