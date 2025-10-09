const jwt = require("jsonwebtoken");
const Workshop = require("../models/Workshop");
const User = require("../models/User");

/**
 * ============================================================
 * Workshop Controller (Clean Version)
 * ============================================================
 * - Unified user + family registration.
 * - Auto-detect user if Authorization header exists.
 * - Populates all participant info including idNumber.
 */

/* ------------------------------------------------------------
   🧩 Helper: attach user if token provided (optional auth)
------------------------------------------------------------ */
async function attachUserIfPresent(req) {
  try {
    const auth = req.headers?.authorization || "";
    if (!auth.startsWith("Bearer ")) return;
    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded.userId;
    if (!userId) return;
    const user = await User.findById(userId).select("_id role name email");
    if (user) req.user = user;
  } catch (err) {
    // לא חובה לזרוק שגיאה – אם אין טוקן, פשוט ממשיכים כאורח
  }
}

/* ------------------------------------------------------------
   🟢 GET /api/workshops — עם מידע למשתמש המחובר
------------------------------------------------------------ */
/* ------------------------------------------------------------
   🟢 GET /api/workshops — עם מידע למשתמש המחובר
------------------------------------------------------------ */
exports.getAllWorkshops = async (req, res) => {
  try {
    await attachUserIfPresent(req);

    const { q, field, ...others } = req.query;
    const filter = {};

    if (q) {
      const allowed = [
        "title", "type", "ageGroup", "city",
        "coach", "day", "hour", "description",
      ];
      const regex = new RegExp(String(q), "i");
      if (field && allowed.includes(field) && field !== "all") {
        filter[field] = { $regex: regex };
      } else {
        filter.$or = allowed.map((f) => ({ [f]: { $regex: regex } }));
      }
    }

    const whitelist = ["type", "ageGroup", "city", "coach", "day", "hour", "available"];
    Object.entries(others).forEach(([k, v]) => {
      if (whitelist.includes(k) && v !== "") {
        filter[k] = k === "available" ? String(v).toLowerCase() === "true" : v;
      }
    });

    const workshops = await Workshop.find(filter)
      .populate("participants", "name email idNumber")
      .populate("familyRegistrations.parentUser", "name email idNumber")
      .populate("familyRegistrations.familyMemberId", "name relation idNumber phone birthDate");

    console.log("📦 getAllWorkshops -> workshops count:", workshops.length);

    const userId = req.user?._id?.toString();

    const workshopsWithFlags = workshops.map((ws) => {
      const wsObj = ws.toObject();
      console.log("🔍 Raw familyRegistrations for", ws.title);
ws.familyRegistrations.forEach((f, i) => {
  console.log(i, {
    parentUser: f.parentUser,
    familyMemberId: f.familyMemberId,
    name: f.name,
  });
});

      // 🧩 החלק הקריטי שתוקן
      const userFamilyRegistrations = ws.familyRegistrations
        .filter((f) => f.parentUser?._id?.toString() === userId)
        .map((f) => {
          // נוודא שנחזיר תמיד string אמיתי
          const id =
            f.familyMemberId?._id?.toString() ||
            (typeof f.familyMemberId === "string" ? f.familyMemberId : null);
          return id;
        })
        .filter(Boolean); // ✅ מנקה null, undefined, או ''

      const isUserRegistered = ws.participants.some(
        (p) => p._id.toString() === userId
      );

      // 🪵 לוג דיאגנוסטי
      console.log("📋 Workshop:", {
        title: ws.title,
        isUserRegistered,
        familyIds: userFamilyRegistrations,
      });

      return {
        ...wsObj,
        userFamilyRegistrations,
        isUserRegistered,
      };
    });

    console.log(
      "✅ Final workshopsWithFlags table:",
      workshopsWithFlags.map((w) => ({
        _id: w._id,
        title: w.title,
        isUserRegistered: w.isUserRegistered,
        familyIds: w.userFamilyRegistrations,
      }))
    );

    res.json(workshopsWithFlags);
  } catch (err) {
    console.error("❌ Error fetching workshops:", err);
    res.status(500).json({ message: "Server error fetching workshops" });
  }
};


/* ------------------------------------------------------------
   🧩 GET /api/workshops/registered — get all workshop IDs the user
      (or their family members) is registered for.  This returns
      an array of workshop ObjectId strings.  It requires a valid
      JWT and will return a 401 if none is provided.  The logic
      checks both direct participant registrations and any
      familyRegistrations where the parentUser matches the
      requesting user.
------------------------------------------------------------ */
exports.getRegisteredWorkshops = async (req, res) => {
  try {
    // Ensure user is authenticated via the auth middleware.  If
    // no user is attached then return unauthorized.  We rely on
    // middleware to populate req.user.
    const userId = req.user?._id?.toString();
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Find all workshops where either the user is directly in
    // participants or they have a family member registered.  We
    // select only the _id field to reduce payload size.
    const list = await Workshop.find({
      $or: [
        { participants: userId },
        { "familyRegistrations.parentUser": userId },
      ],
    }).select("_id");

    const ids = list.map((w) => w._id.toString());
    return res.json(ids);
  } catch (err) {
    console.error("❌ Error fetching registered workshops:", err);
    return res.status(500).json({ message: "Server error fetching registrations" });
  }
};

/* ------------------------------------------------------------
   🟢 GET /api/workshops/:id
------------------------------------------------------------ */
exports.getWorkshopById = async (req, res) => {
  try {
    const ws = await Workshop.findById(req.params.id).populate("participants", "name email idNumber");
    if (!ws) return res.status(404).json({ message: "Workshop not found" });
    res.json(ws);
  } catch {
    res.status(400).json({ message: "Invalid workshop ID" });
  }
};

/* ------------------------------------------------------------
   🟡 POST /api/workshops  (Admin)
------------------------------------------------------------ */
exports.createWorkshop = async (req, res) => {
  try {
    const ws = await Workshop.create(req.body);
    res.status(201).json(ws);
  } catch (err) {
    console.error("❌ Error creating workshop:", err);
    res.status(400).json({ message: err.message });
  }
};

/* ------------------------------------------------------------
   🟠 PUT /api/workshops/:id  (Admin)
------------------------------------------------------------ */
exports.updateWorkshop = async (req, res) => {
  try {
    const existing = await Workshop.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Workshop not found" });

    const allowed = [
      "title",
      "type",
      "ageGroup",
      "city",
      "studio",
      "coach",
      "day",
      "hour",
      "available",
      "description",
      "price",
      "image",
      "maxParticipants",
    ];

    const data = {};
    for (const key of allowed) if (key in req.body) data[key] = req.body[key];

    data.participants = existing.participants;
    data.participantsCount = existing.participants.length;

    const ws = await Workshop.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    }).populate("participants", "name email idNumber");

    res.json({ message: "Workshop updated successfully", workshop: ws });
  } catch (err) {
    console.error("❌ Error updating workshop:", err);
    res.status(400).json({ message: "Failed to update workshop" });
  }
};

/* ------------------------------------------------------------
   🔴 DELETE /api/workshops/:id
------------------------------------------------------------ */
exports.deleteWorkshop = async (req, res) => {
  try {
    const ws = await Workshop.findByIdAndDelete(req.params.id);
    if (!ws) return res.status(404).json({ message: "Workshop not found" });
    res.json({ message: "Workshop deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting workshop:", err);
    res.status(400).json({ message: "Failed to delete workshop" });
  }
};

/* ------------------------------------------------------------
   🧩 GET /api/workshops/:id/participants
------------------------------------------------------------ */
exports.getWorkshopParticipants = async (req, res) => {
  try {
    const w = await Workshop.findById(req.params.id)
      .populate("participants", "name email phone city birthDate canCharge idNumber");

    if (!w) return res.status(404).json({ message: "Workshop not found" });

    const participants = (w.participants || []).map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      city: u.city,
      birthDate: u.birthDate,
      canCharge: u.canCharge,
      idNumber: u.idNumber || "-",
      isFamily: false,
    }));

    const familyRegistrations = (w.familyRegistrations || []).map((f) => ({
      _id: f.familyMemberId,
      familyMemberId: f.familyMemberId,
      parentUser: f.parentUser,
      name: f.name,
      relation: f.relation,
      idNumber: f.idNumber || "-",
      phone: f.phone,
      birthDate: f.birthDate,
      isFamily: true,
    }));

    res.json({ participants, familyRegistrations });
  } catch (err) {
    console.error("❌ getWorkshopParticipants error:", err);
    res.status(500).json({ message: "Server error fetching participants" });
  }
};

/* ============================================================
   🧩 UNIFIED REGISTRATION HANDLERS (User + Family)
============================================================ */

/**
 * POST /api/workshops/:id/register-entity
 */
exports.registerEntityToWorkshop = async (req, res) => {
  console.log("📩 [registerEntityToWorkshop] body:", req.body);
  console.log("👤 Auth user:", req.user?._id);

  try {
    const { familyId } = req.body;
    const workshop = await Workshop.findById(req.params.id);
    if (!workshop)
      return res.status(404).json({ message: "Workshop not found" });

    console.log("🧩 Before registration → familyRegistrations count:", workshop.familyRegistrations.length);

    // 🧩 Case 1: Registering a family member
    if (familyId) {
      const parent = await User.findById(req.user._id);
      const member = parent.familyMembers.id(familyId);

      if (!member) {
        console.warn("⚠️ Family member not found in parent:", familyId);
        return res.status(404).json({ message: "Family member not found" });
      }

      console.log("👨‍👩‍👧 Found member:", {
        _id: member._id,
        name: member.name,
        relation: member.relation,
      });

      // ✅ Prevent duplicate registration
      const alreadyRegistered = workshop.familyRegistrations.some(
        (r) =>
          r.familyMemberId?.toString() === familyId &&
          r.parentUser?.toString() === req.user._id.toString()
      );

      if (alreadyRegistered) {
        console.warn("⚠️ Family member already registered:", familyId);
        return res.status(400).json({
          success: false,
          message: "Family member already registered to this workshop",
        });
      }

      // ✅ Push new registration
      workshop.familyRegistrations.push({
        parentUser: parent._id,
        familyMemberId: member._id,
        name: member.name,
        relation: member.relation,
        idNumber: member.idNumber,
        phone: member.phone,
        birthDate: member.birthDate,
      });

      console.log("✅ Added new family registration:", {
        parentUser: parent._id.toString(),
        familyMemberId: member._id.toString(),
        name: member.name,
      });
    }

    // 🧩 Case 2: Registering the main user
    else {
      const alreadyUser = workshop.participants.some(
        (p) => p.toString() === req.user._id.toString()
      );
      if (alreadyUser) {
        console.warn("⚠️ User already registered:", req.user._id);
        return res.status(400).json({
          success: false,
          message: "User already registered to this workshop",
        });
      }
      workshop.participants.push(req.user._id);
      console.log("✅ Added main user:", req.user._id);
    }

    await workshop.save();

    console.log("💾 After save → familyRegistrations:", 
      workshop.familyRegistrations.map((f) => ({
        familyMemberId: f.familyMemberId,
        parentUser: f.parentUser,
        name: f.name,
      }))
    );

    const populated = await Workshop.findById(workshop._id)
      .populate("participants", "name email idNumber")
      .populate(
        "familyRegistrations.familyMemberId",
        "name relation idNumber phone birthDate"
      )
      .populate("familyRegistrations.parentUser", "name email idNumber");

    console.log("🎯 Populated familyRegistrations count:", populated.familyRegistrations.length);

    res.json({ success: true, workshop: populated });
  } catch (err) {
    console.error("🔥 registerEntityToWorkshop error:", err);
    res.status(500).json({ message: "Server error during registration" });
  }
};


/**
 * DELETE /api/workshops/:id/unregister-entity
 */
exports.unregisterEntityFromWorkshop = async (req, res) => {
  try {
    const { id } = req.params;
    const { familyId } = req.body;
    const userId = req.user._id;

    const workshop = await Workshop.findById(id);
    if (!workshop)
      return res
        .status(404)
        .json({ success: false, message: "Workshop not found" });

    // 🧩 Case 1: Main user unregister
    if (!familyId) {
      const before = workshop.participants.length;
      workshop.participants = workshop.participants.filter(
        (u) => u.toString() !== userId.toString()
      );

      if (before === workshop.participants.length) {
        return res
          .status(400)
          .json({ success: false, message: "User was not registered" });
      }
    }

    // 🧩 Case 2: Family member unregister
    else {
      // Find matching family registration owned by this user
      const familyRegs = workshop.familyRegistrations.filter(
        (f) =>
          f.familyMemberId?.toString() === familyId.toString() &&
          f.parentUser?.toString() === userId.toString()
      );

      if (familyRegs.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Family registration not found or not owned by user",
        });
      }

      // Remove all matching duplicates just in case
      workshop.familyRegistrations = workshop.familyRegistrations.filter(
        (f) =>
          !(
            f.familyMemberId?.toString() === familyId.toString() &&
            f.parentUser?.toString() === userId.toString()
          )
      );
    }

    // ✅ Update counts safely
    workshop.participantsCount =
      (workshop.participants?.length || 0) +
      (workshop.familyRegistrations?.length || 0);

    await workshop.save();

    const populated = await Workshop.findById(id)
      .populate("participants", "name email idNumber")
      .populate(
        "familyRegistrations.familyMemberId",
        "name relation idNumber phone birthDate"
      )
      .populate("familyRegistrations.parentUser", "name email idNumber");

    res.json({
      success: true,
      message: "Entity unregistered successfully",
      workshop: populated,
    });
  } catch (err) {
    console.error("🔥 unregisterEntityFromWorkshop error:", err);
    res.status(500).json({
      success: false,
      message: "Server error during unregistration",
    });
  }
};

