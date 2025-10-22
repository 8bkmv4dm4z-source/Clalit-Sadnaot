// routes/dev.js
const express = require("express");
const router = express.Router();
const User = require("../models/User");

router.delete("/cleanup-user", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    const user = await User.findOneAndDelete({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    console.log(`[DEV CLEANUP] Deleted ${email}`);
    res.status(200).json({ message: "Deleted" });
  } catch (err) {
    console.error("[DEV CLEANUP ERROR]", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
