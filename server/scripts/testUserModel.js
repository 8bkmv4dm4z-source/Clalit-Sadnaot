const mongoose = require("mongoose");
const User = require("../models/User");
require("dotenv").config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const u = new User({
      name: "Test User",
      email: "test@example.com",
    });

    await u.setPassword("123456");
    await u.save();

    console.log("✅ Created user:", u);

    const isMatch = await u.validatePassword("123456");
    console.log("🔐 Password valid?", isMatch);

    await mongoose.disconnect();
  } catch (err) {
    console.error("❌ Error:", err);
  }
})();
