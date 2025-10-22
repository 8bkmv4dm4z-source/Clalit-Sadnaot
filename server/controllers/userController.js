const User = require("../models/User");
const Workshop = require("../models/Workshop");

/* ============================================================
   🟢 Get current logged-in user
   ============================================================ */
exports.getMe = async (req, res) => {
  try {
    if (!req.user?._id) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findById(req.user._id).select("-passwordHash -otpCode -otpAttempts");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching user" });
  }
};

/* ============================================================
   🟢 Get all users
   ============================================================ */
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-passwordHash -otpCode -otpAttempts");
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching users" });
  }
};

/* ============================================================
   🟢 Get user or family member by ID
   ============================================================ */
exports.getUserById = async (req, res) => {
  try {
    const id = req.params.id;

    let user = await User.findById(id).select("-passwordHash -otpCode -otpAttempts");
    if (!user) {
      const parent = await User.findOne({ "familyMembers._id": id }).select("name email familyMembers");
      if (parent) {
        const member = parent.familyMembers.id(id);
        return res.json({
          ...member.toObject(),
          parentId: parent._id,
        });
      }
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching user" });
  }
};

/* ============================================================
   🟢 Unified: getEntityById (user OR family member)
   ============================================================ */
exports.getEntityById = async (req, res) => {
  try {
    const id = req.params.id;
    const user = await User.findById(id).select("-passwordHash -otpCode -otpAttempts");
    if (user) return res.json({ type: "user", entity: user });

    const parent = await User.findOne({ "familyMembers._id": id }).select("familyMembers name email");
    if (parent) {
      const member = parent.familyMembers.id(id);
      return res.json({
        type: "familyMember",
        entity: { ...member.toObject(), parentId: parent._id },
      });
    }
    return res.status(404).json({ message: "Entity not found" });
  } catch (err) {
    res.status(500).json({ message: "Server error fetching entity" });
  }
};

/* ============================================================
   🟢 Create user
   ============================================================ */
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, city, phone, birthDate, canCharge } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists" });

    const user = new User({ name, email, role, city, phone, birthDate, canCharge });
    if (password) await user.setPassword(password);
    await user.save();

    res.status(201).json({ message: "User created successfully", user });
  } catch (err) {
    res.status(500).json({ message: "Server error creating user" });
  }
};

/* ============================================================
   🟢 UNIFIED UPDATE ENTITY (user or family)
   ============================================================ */
exports.updateEntity = async (req, res) => {
  try {
    // body: { userId?, familyId?, parentUserId?, updates: {...} }
    const { userId, familyId, parentUserId, updates } = req.body;
    const requester = req.user;

    if (!userId && !familyId)
      return res.status(400).json({ message: "Missing userId or familyId" });

    if (!updates || typeof updates !== "object")
      return res.status(400).json({ message: "Missing updates payload" });

    /* =========================
       🔹 Case 1: Update main user
    ========================== */
    if (userId && !familyId) {
      if (requester.role !== "admin" && String(requester._id) !== String(userId))
        return res.status(403).json({ message: "Unauthorized" });

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const allowed = [
        "name",
        "idNumber",
        "birthDate",
        "phone",
        "city",
        "canCharge",
        "role",
        "familyMembers",
      ];

      for (const key of allowed)
        if (updates[key] !== undefined) user[key] = updates[key];

      await user.save();
      const cleanUser = user.toObject();
      delete cleanUser.passwordHash;
      delete cleanUser.otpCode;
      delete cleanUser.otpAttempts;
      return res.json({
        success: true,
        message: "User updated successfully",
        user: cleanUser,
      });
    }

    /* =========================
       🔹 Case 2: Update family member
    ========================== */
    if (familyId) {
      const targetUserId = parentUserId || userId || requester._id;

      const user = await User.findById(targetUserId);
      if (!user) return res.status(404).json({ message: "Parent user not found" });

      const member = user.familyMembers.id(familyId);
      if (!member) return res.status(404).json({ message: "Family member not found" });

      const allowed = [
        "name",
        "relation",
        "idNumber",
        "phone",
        "birthDate",
        "email",
        "city",
      ];

      for (const key of allowed)
        if (updates[key] !== undefined) member[key] = updates[key];

      await user.save();

      // 🔁 Sync updated family member info into all workshops
// 🔁 Sync with all workshops where this family member is registered
await Workshop.updateMany(
  { "familyRegistrations.familyMemberId": member._id },
  {
    $set: {
      "familyRegistrations.$[f].name": member.name,
      "familyRegistrations.$[f].relation": member.relation,
      "familyRegistrations.$[f].idNumber": member.idNumber,
      "familyRegistrations.$[f].phone": member.phone || user.phone, // fallback
      "familyRegistrations.$[f].birthDate": member.birthDate,
      "familyRegistrations.$[f].city": member.city,
      "familyRegistrations.$[f].parentEmail": user.email,
    },
  },
  {
    arrayFilters: [{ "f.familyMemberId": member._id }],
  }
);


      const cleanUser = user.toObject();
      delete cleanUser.passwordHash;
      delete cleanUser.otpCode;
      delete cleanUser.otpAttempts;

      return res.json({
        success: true,
        message: "Family member updated successfully (synced)",
        user: cleanUser,
      });
    }
  } catch (err) {
    console.error("❌ [updateEntity] Error:", err);
    res
      .status(500)
      .json({ message: "Server error updating entity", error: err.message });
  }
};

/* ============================================================
   🧾 Get workshops per user or family member
   ============================================================ */
/* ============================================================
   🧾 Get workshops per user or family member (Stable version)
   ============================================================ */
exports.getUserWorkshopsList = async (req, res) => {
  try {
    const { id } = req.params; // userId or familyMemberId
    const familyIdQuery = req.query.familyId || null;

    // בדיקה אם זה בן משפחה
    const user = await User.findById(id);
    let parentUser = null;
    let familyMember = null;

    if (!user) {
      parentUser = await User.findOne({ "familyMembers._id": id });
      if (!parentUser)
        return res.status(404).json({ message: "User or family member not found" });

      familyMember = parentUser.familyMembers.id(id);
      if (!familyMember)
        return res.status(404).json({ message: "Family member not found" });
    } else {
      parentUser = user;
    }

    const summaries = [];

    // 🟢 Case 1: Regular user (not family)
    if (user) {
      const workshops = await Workshop.find({
        $or: [
          { participants: user._id },
          { "familyRegistrations.parentUser": user._id },
        ],
      }).select("title coach day hour participants familyRegistrations");

      workshops.forEach((w) => {
        // סדנאות שבהן המשתמש עצמו רשום
        if ((w.participants || []).map(String).includes(String(user._id))) {
          summaries.push({
            workshopId: w._id,
            title: w.title,
            coach: w.coach,
            day: w.day,
            hour: w.hour,
            relation: "self",
          });
        }

        // סדנאות שבהן בן משפחה שלו רשום
        (w.familyRegistrations || []).forEach((f) => {
          if (String(f.parentUser) === String(user._id)) {
            summaries.push({
              workshopId: w._id,
              title: w.title,
              coach: w.coach,
              day: w.day,
              hour: w.hour,
              relation: `${f.name || ""}${f.relation ? ` (${f.relation})` : ""}`,
              familyMemberId: f.familyMemberId,
            });
          }
        });
      });
    }

    // 🟢 Case 2: family member directly
    if (familyMember && parentUser) {
      const workshops = await Workshop.find({
        "familyRegistrations.familyMemberId": familyMember._id,
        "familyRegistrations.parentUser": parentUser._id,
      }).select("title coach day hour familyRegistrations");

      workshops.forEach((w) => {
        summaries.push({
          workshopId: w._id,
          title: w.title,
          coach: w.coach,
          day: w.day,
          hour: w.hour,
          relation: `${familyMember.name || ""}${
            familyMember.relation ? ` (${familyMember.relation})` : ""
          }`,
          familyMemberId: familyMember._id,
        });
      });
    }

    // 🟡 Optional filter by ?familyId query param
    if (familyIdQuery) {
      return res.json(
        summaries.filter(
          (s) => String(s.familyMemberId || "") === String(familyIdQuery)
        )
      );
    }

    return res.json(summaries);
  } catch (err) {
    console.error("❌ getUserWorkshopsList error:", err);
    res
      .status(500)
      .json({ message: "Server error fetching workshops list", error: err.message });
  }
};

/* ============================================================
   🟢 Delete user
   ============================================================ */
exports.deleteUser = async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error deleting user" });
  }
};
