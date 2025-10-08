const User = require("../models/User");

/** 🟢 Get current logged-in user (NEW: /api/users/me) */
exports.getMe = async (req, res) => {
  try {
    console.log("🔍 [getMe] Fetching current user via token:", req.user?._id);

    if (!req.user?._id) {
      return res.status(401).json({ message: "Unauthorized - no user in token" });
    }

    // ❌ לא צריך populate, כי familyMembers הם subdocuments
    const user = await User.findById(req.user._id).select(
      "-passwordHash -otpCode -otpAttempts"
    );

    if (!user) {
      console.warn("⚠️ [getMe] User not found in DB");
      return res.status(404).json({ message: "User not found" });
    }

    console.log("✅ [getMe] Returning user:", user.name);
    res.json(user);
  } catch (err) {
    console.error("❌ [getMe] Error fetching current user:", err);
    res.status(500).json({ message: "Server error fetching current user" });
  }
};

/** 🟢 Get all users */
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-passwordHash -otpCode -otpAttempts");
    res.json(users);
  } catch (err) {
    console.error("❌ Error fetching users:", err);
    res.status(500).json({ message: "Server error fetching users" });
  }
};

/** 🟢 Get user by ID */
exports.getUserById = async (req, res) => {
  try {
    console.log("📥 [getUserById] ID:", req.params.id);
    const user = await User.findById(req.params.id).select(
      "-passwordHash -otpCode -otpAttempts"
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("❌ Error fetching user:", err);
    res.status(500).json({ message: "Server error fetching user" });
  }
};

/** 🟢 Create user */
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, city, phone, birthDate, canCharge } =
      req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists" });

    const user = new User({ name, email, role, city, phone, birthDate, canCharge });
    if (password) await user.setPassword(password);
    await user.save();

    res.status(201).json({ message: "User created successfully", user });
  } catch (err) {
    console.error("❌ Error creating user:", err);
    res.status(500).json({ message: "Server error creating user" });
  }
};

/** 🟢 Update user (supports familyMembers subdocuments) */
exports.updateUser = async (req, res) => {
  console.log("📩 [updateUser] Incoming request to update user");

  try {
    const userId = req.params.id;
    const requester = req.user;

    console.log("👤 [updateUser] Requester:", requester?.email || "unknown");
    console.log("🎯 [updateUser] Target userId:", userId);
    console.log("📦 [updateUser] Body received:", JSON.stringify(req.body, null, 2));

    if (!requester || (requester.role !== "admin" && requester._id.toString() !== userId)) {
      console.warn("🚫 [updateUser] Unauthorized update attempt");
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { password, email, ...updates } = req.body;
    console.log("🧩 [updateUser] Parsed updates:", updates);

    const user = await User.findById(userId);
    if (!user) {
      console.warn("⚠️ [updateUser] User not found:", userId);
      return res.status(404).json({ message: "User not found" });
    }

    console.log("✅ [updateUser] Found user in DB:", user.name);

    // בדיקת מייל כפול
    if (email && email !== user.email) {
      console.log("📧 [updateUser] Checking for duplicate email:", email);
      const existing = await User.findOne({ email });
      if (existing) {
        console.warn("🚫 [updateUser] Email already in use:", email);
        return res.status(400).json({ message: "Email already in use" });
      }
      user.email = email;
    }

    // עדכון סיסמה
    if (password && password.trim() !== "") {
      console.log("🔐 [updateUser] Setting new password...");
      await user.setPassword(password);
    }

    const allowedFields = [
      "name",
      "idNumber",
      "birthDate",
      "phone",
      "city",
      "canCharge",
      "role",
      "familyMembers",
    ];

    console.log("🧾 [updateUser] Allowed fields:", allowedFields);

    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        console.log(`✏️ [updateUser] Updating field "${key}" ->`, updates[key]);
        if (key === "familyMembers" && Array.isArray(updates.familyMembers)) {
          console.log("👨‍👩‍👧 [updateUser] Updating familyMembers array");
          user.familyMembers = updates.familyMembers.map((m, i) => {
            console.log(`  ↳ member[${i}]`, m);
            return {
              name: m.name || "",
              relation: m.relation || "",
              idNumber: m.idNumber || "",
              phone: m.phone || "",
              birthDate: m.birthDate || "",
            };
          });
        } else {
          user[key] = updates[key];
        }
      }
    }

    console.log("💾 [updateUser] Saving updated user to DB...");
    await user.save();
    console.log("✅ [updateUser] User saved successfully!");

    const cleanUser = user.toObject();
    delete cleanUser.passwordHash;
    delete cleanUser.otpCode;
    delete cleanUser.otpAttempts;

    console.log("📤 [updateUser] Returning cleaned user:", {
      name: cleanUser.name,
      email: cleanUser.email,
      familyCount: cleanUser.familyMembers?.length || 0,
    });

    res.json({
      message: "User updated successfully",
      user: cleanUser,
    });
  } catch (err) {
    console.error("❌ [updateUser] Unexpected error:", err);
    res.status(500).json({
      message: "Server error updating user",
      error: err.message,
      stack: err.stack,
    });
  }
};

/** 🟢 Delete user */
exports.deleteUser = async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting user:", err);
    res.status(500).json({ message: "Server error deleting user" });
  }
};
