const jwt = require("jsonwebtoken");
const Workshop = require("../models/Workshop");
const User = require("../models/User");
const ExcelJS = require("exceljs");
const nodemailer = require("nodemailer");

/* ------------------------------------------------------------
   🔧 Internal helper: automatically promote from the waiting list
------------------------------------------------------------ */
async function autoPromoteFromWaitlist(workshop) {
  try {
    let promoted = false;
    // Loop while there is space and entries waiting
    while (workshop.canAddParticipant() && Array.isArray(workshop.waitingList) && workshop.waitingList.length > 0) {
      const entry = workshop.waitingList.shift();
      if (!entry) break;
      // If we have a familyMemberId then this is a family registration
      if (entry.familyMemberId) {
        workshop.familyRegistrations.push({
          parentUser: entry.parentUser,
          familyMemberId: entry.familyMemberId,
          name: entry.name,
          relation: entry.relation,
          idNumber: entry.idNumber,
          phone: entry.phone,
          birthDate: entry.birthDate,
        });
      } else {
        // Otherwise treat as a main user registration
        workshop.participants.push(entry.parentUser);
      }
      promoted = true;
    }
    if (promoted) {
      // Save once if we made changes
      await workshop.save();
    }
  } catch (err) {
    console.error("⚠️ autoPromoteFromWaitlist error:", err);
  }
}
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
  console.log("➡️  GET /api/workshops hit at", new Date().toISOString());

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

  // ✅ Ensure address & city exist even in old documents
  wsObj.city = wsObj.city || "";
  wsObj.address = wsObj.address || "";

  console.log("🔍 Raw familyRegistrations for", ws.title);
  ws.familyRegistrations.forEach((f, i) => {
    console.log(i, {
      parentUser: f.parentUser,
      familyMemberId: f.familyMemberId,
      name: f.name,
    });
  });

  const userFamilyRegistrations = ws.familyRegistrations
    .filter((f) => f.parentUser?._id?.toString() === userId)
    .map((f) => {
      const id =
        f.familyMemberId?._id?.toString() ||
        (typeof f.familyMemberId === "string" ? f.familyMemberId : null);
      return id;
    })
    .filter(Boolean);

  const isUserRegistered = ws.participants.some(
    (p) => p._id.toString() === userId
  );

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
   🧩 GET /api/workshops/registered
   ------------------------------------------------------------
   Returns an array of workshop IDs for which the authenticated user
   is directly registered.  Previously this endpoint also returned
   workshops where a family member was registered, which led the
   frontend to incorrectly mark the user as registered for workshops
   they were not actually enrolled in.  To avoid this confusion
   the logic now only checks the participants array.  Family
   registrations remain accessible via the `userFamilyRegistrations`
   field returned from the `getAllWorkshops` endpoint.
------------------------------------------------------------ */
exports.getRegisteredWorkshops = async (req, res) => {
  try {
    // Ensure the request is authenticated.  The auth middleware
    // attaches `req.user`; if it is missing then the user is
    // unauthorized.
    const userId = req.user?._id?.toString();
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Only select workshops where the user is a direct participant.
    // Do not include workshops where the user only has a family
    // member registered.  This prevents the frontend from treating
    // those workshops as if the user themself were registered.
    const list = await Workshop.find({ participants: userId }).select(
      "_id"
    );
    const ids = list.map((w) => w._id.toString());
    return res.json(ids);
  } catch (err) {
    console.error(
      "❌ Error fetching registered workshops (participants only):",
      err
    );
    return res
      .status(500)
      .json({ message: "Server error fetching registrations" });
  }
};

/* ------------------------------------------------------------
   🟢 GET /api/workshops/:id
------------------------------------------------------------ */
exports.getWorkshopById = async (req, res) => {
  try {
    const ws = await Workshop.findById(req.params.id).populate("participants", "name email idNumber");
    console.log("📋 RAW familyRegistrations:",
  JSON.stringify(ws.familyRegistrations, null, 2));

    if (!ws) return res.status(404).json({ message: "Workshop not found" });
    res.json(ws);
  } catch {
    res.status(400).json({ message: "Invalid workshop ID" });
  }
};

/* ------------------------------------------------------------
   🟡 POST /api/workshops  (Admin)
------------------------------------------------------------ */
/* ------------------------------------------------------------
   🟡 POST /api/workshops  (Admin)
   ------------------------------------------------------------
   Creates a new workshop with support for:
   - Multiple meeting days (days[])
   - sessionsCount replacing weeksDuration
   - Auto-calculated endDate based on sessionsCount & startDate
   - Optional inactiveDates (holidays)
------------------------------------------------------------ */
exports.updateWorkshop = async (req, res) => {
  try {
    const existing = await Workshop.findById(req.params.id);
    if (!existing)
      return res.status(404).json({ message: "Workshop not found" });

    // ✅ Allowed fields for update
    const allowed = [
      "title", "type", "ageGroup", "city", "address", "studio", "coach",
      "days", "hour", "available", "description", "price",
      "image", "maxParticipants", "waitingListMax", "autoEnrollOnVacancy",
      "sessionsCount", "startDate", "inactiveDates"
    ];

    const updates = {};
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key];
    }

    // ✅ If city or address were changed → soft validation only
    if ("city" in updates || "address" in updates) {
      const city = updates.city ?? existing.city;
      const address = updates.address ?? existing.address;

      if (!city || !address) {
        return res.status(400).json({
          message: "City and address are required for update",
        });
      }

      try {
        const validationUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
          city
        )}&street=${encodeURIComponent(address)}&country=Israel&format=json`;

        const resp = await fetch(validationUrl, {
          headers: { "User-Agent": "Clalit-Workshops-App" },
        });
        const result = await resp.json();

        if (!Array.isArray(result) || result.length === 0) {
          console.warn(`⚠ Address not found for city "${city}" — saving anyway`);
          // לא מחזירים שגיאה — רק רושמים אזהרה
        }
      } catch (e) {
        console.warn("⚠ Address validation service unavailable — skipping check");
      }
    }

    // ✅ Normalize days and inactiveDates
    const daysMap = {
      "ראשון": "Sunday",
      "שני": "Monday",
      "שלישי": "Tuesday",
      "רביעי": "Wednesday",
      "חמישי": "Thursday",
      "שישי": "Friday",
      "שבת": "Saturday",
    };

    if (updates.days) {
      if (!Array.isArray(updates.days)) updates.days = [updates.days];
      updates.days = updates.days.map((d) => daysMap[d] || d);
    }

    if (updates.sessionsCount && isNaN(updates.sessionsCount)) {
      return res.status(400).json({ message: "sessionsCount must be a number" });
    }

    if (updates.inactiveDates) {
      if (!Array.isArray(updates.inactiveDates)) {
        updates.inactiveDates = [updates.inactiveDates];
      }
      updates.inactiveDates = updates.inactiveDates
        .map((d) => new Date(d))
        .filter((d) => !isNaN(d.getTime()));
    }

    // ✅ Apply updates
    Object.assign(existing, updates);

    existing.markModified("days");
    existing.markModified("inactiveDates");
    existing.markModified("startDate");
    existing.markModified("sessionsCount");

    await existing.save();

    // ✅ Return updated populated workshop
    const ws = await Workshop.findById(existing._id)
      .populate("participants", "name email idNumber")
      .populate("familyRegistrations.parentUser", "name email idNumber")
      .populate("familyRegistrations.familyMemberId", "name relation idNumber phone birthDate")
      .populate("waitingList.parentUser", "name email");

    console.log("📅 Workshop updated:", {
      title: ws.title,
      city: ws.city,
      address: ws.address,
      days: ws.days,
      sessionsCount: ws.sessionsCount,
      startDate: ws.startDate,
      endDate: ws.endDate,
    });

    res.json({
      message: "Workshop updated successfully",
      workshop: ws,
    });
  } catch (err) {
    console.error("❌ Error updating workshop:", err);
    res.status(400).json({ message: "Failed to update workshop" });
  }
};



/* ============================================================
   🆕 Create a new workshop
   ============================================================ */
exports.createWorkshop = async (req, res) => {
  try {
    const data = { ...req.body };

    // ✅ Validate required fields
    if (!data.city || !data.address) {
      return res.status(400).json({ message: "City and address are required" });
    }

    // ✅ Soft validate the address using OpenStreetMap
    try {
      const validationUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
        data.city
      )}&street=${encodeURIComponent(data.address)}&country=Israel&format=json`;

      const response = await fetch(validationUrl, {
        headers: { "User-Agent": "Clalit-Workshops-App" },
      });
      const validationData = await response.json();

      if (!Array.isArray(validationData) || validationData.length === 0) {
        console.warn(`⚠ Address not found for city "${data.city}" — saving anyway`);
        // לא חוסמים שמירה
      }
    } catch (e) {
      console.warn("⚠ Address validation service unavailable — skipping check");
    }

    // ✅ Normalize and validate other fields
    const daysMap = {
      "ראשון": "Sunday",
      "שני": "Monday",
      "שלישי": "Tuesday",
      "רביעי": "Wednesday",
      "חמישי": "Thursday",
      "שישי": "Friday",
      "שבת": "Saturday",
    };

    if (!Array.isArray(data.days)) {
      data.days = data.days ? [data.days] : [];
    }
    data.days = data.days.map((d) => daysMap[d] || d);

    if (data.days.length === 0) {
      return res.status(400).json({ message: "At least one valid day is required" });
    }

    if (!data.startDate) {
      return res.status(400).json({ message: "startDate is required" });
    }

    if (!data.sessionsCount || isNaN(data.sessionsCount)) {
      return res.status(400).json({ message: "sessionsCount must be a valid number" });
    }

    if (data.inactiveDates) {
      if (!Array.isArray(data.inactiveDates)) {
        data.inactiveDates = [data.inactiveDates];
      }
      data.inactiveDates = data.inactiveDates
        .map((d) => new Date(d))
        .filter((d) => !isNaN(d.getTime()));
    } else {
      data.inactiveDates = [];
    }

    // ✅ Save to DB
    const ws = await Workshop.create(data);

    console.log("📅 Workshop created:", {
      title: ws.title,
      city: ws.city,
      address: ws.address,
      days: ws.days,
      sessionsCount: ws.sessionsCount,
      startDate: ws.startDate,
      endDate: ws.endDate,
    });

    res.status(201).json(ws);
  } catch (err) {
    console.error("❌ Error creating workshop:", err);
    res
      .status(400)
      .json({ message: err.message || "Failed to create workshop" });
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
// controllers/workshopController.js
exports.getWorkshopParticipants = async (req, res) => {
  try {
    const workshop = await Workshop.findById(req.params.id)
      .populate("participants", "name email phone city birthDate idNumber canCharge")
      .populate("familyRegistrations.parentUser", "name email phone city canCharge _id")
      .populate("familyRegistrations.familyMemberId", "name relation idNumber phone birthDate email city _id")
      .lean();

    if (!workshop) return res.status(404).json({ message: "Workshop not found" });

    // Normalize direct participants
    const participants = (workshop.participants || []).map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email || "",
      phone: u.phone || "",
      city: u.city || "",
      birthDate: u.birthDate || null,
      idNumber: u.idNumber || "",
      canCharge: !!u.canCharge,
      isFamily: false,
    }));

    // Normalize family registrations
    const familyRegistrations = (workshop.familyRegistrations || []).map((f) => {
  const parent = f.parentUser || {};
  return {
    _id: f.familyMemberId,
    familyMemberId: f.familyMemberId,
    parentId: parent._id || null,
    parentEmail: parent.email || "",
    parentPhone: parent.phone || "",
    name: f.name || "",
    relation: f.relation || "",
    email: f.email || parent.email || "",
    phone: f.phone || parent.phone || "",   // ✅ כאן יש את הפלאפון הנכון מה־DB
    city: f.city || parent.city || "",
    idNumber: f.idNumber || "",
    birthDate: f.birthDate || null,
    canCharge: !!parent.canCharge,
    isFamily: true,
  };
});


    // ✅ Return unified array (for UI simplicity)
    const all = [...participants, ...familyRegistrations];
    const participantsCount = all.length;

    return res.json({
      participants: all,
      participantsCount,
      directCount: participants.length,
      familyCount: familyRegistrations.length,
    });
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

    // Determine if this is a family registration
    const isFamily = Boolean(familyId);

    // Resolve user and member objects up front
    const parentUser = await User.findById(req.user._id);
    if (!parentUser) return res.status(404).json({ message: "User not found" });

    let member = null;
    if (isFamily) {
      member = parentUser.familyMembers.id(familyId);
      if (!member) {
        console.warn("⚠️ Family member not found in parent:", familyId);
        return res.status(404).json({ message: "Family member not found" });
      }
    }

    // Check duplicates in participants/familyRegistrations
    if (isFamily) {
      // Prevent duplicate family registration
      const alreadyRegistered = workshop.familyRegistrations.some(
        (r) =>
          r.familyMemberId?.toString() === familyId.toString() &&
          r.parentUser?.toString() === req.user._id.toString()
      );
      if (alreadyRegistered) {
        return res.status(400).json({
          success: false,
          message: "Family member already registered to this workshop",
        });
      }
      // Prevent duplicate in waiting list
      const alreadyQueued = (workshop.waitingList || []).some(
        (w) =>
          w.familyMemberId &&
          w.familyMemberId.toString() === familyId.toString() &&
          w.parentUser &&
          w.parentUser.toString() === req.user._id.toString()
      );
      if (alreadyQueued) {
        return res.status(400).json({
          success: false,
          message: "Family member already in waiting list for this workshop",
        });
      }
    } else {
      const alreadyUser = workshop.participants.some(
        (p) => p.toString() === req.user._id.toString()
      );
      if (alreadyUser) {
        return res.status(400).json({
          success: false,
          message: "User already registered to this workshop",
        });
      }
      const alreadyQueued = (workshop.waitingList || []).some(
        (w) =>
          !w.familyMemberId &&
          w.parentUser &&
          w.parentUser.toString() === req.user._id.toString()
      );
      if (alreadyQueued) {
        return res.status(400).json({
          success: false,
          message: "User already in waiting list for this workshop",
        });
      }
    }

    // Determine if the workshop has capacity
    const hasSpace = workshop.canAddParticipant();
    if (!hasSpace) {
      // Handle waiting list
      if (workshop.waitingListMax > 0 && workshop.waitingList.length >= workshop.waitingListMax) {
        return res.status(400).json({
          success: false,
          message: "Workshop is full and the waiting list is at capacity",
        });
      }
      // Build entry for waitlist
      const entry = {
        parentUser: parentUser._id,
        familyMemberId: isFamily ? member._id : undefined,
        name: isFamily ? member.name : parentUser.name,
        relation: isFamily ? member.relation : "self",
        idNumber: isFamily ? member.idNumber : parentUser.idNumber,
        phone: isFamily ? member.phone : parentUser.phone,
        birthDate: isFamily ? member.birthDate : parentUser.birthDate,
      };
      workshop.waitingList.push(entry);
      await workshop.save();
      const position = workshop.waitingList.length;
      return res.json({
        success: true,
        message: "Added to waiting list",
        position,
      });
    }

    // There is space → proceed with normal registration
    if (isFamily) {
      workshop.familyRegistrations.push({
        parentUser: parentUser._id,
        familyMemberId: member._id,
        name: member.name,
        relation: member.relation,
        idNumber: member.idNumber,
        phone: member.phone,
        birthDate: member.birthDate,
      });
    } else {
      workshop.participants.push(req.user._id);
    }
    await workshop.save();

    // Populate and return updated workshop
    const populated = await Workshop.findById(workshop._id)
      .populate("participants", "name email idNumber")
      .populate(
        "familyRegistrations.familyMemberId",
        "name relation idNumber phone birthDate"
      )
      .populate("familyRegistrations.parentUser", "name email idNumber")
      .populate("waitingList.parentUser", "name email");

    return res.json({ success: true, workshop: populated });
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

    // Auto promote from waitlist if enabled
    if (workshop.autoEnrollOnVacancy) {
      await autoPromoteFromWaitlist(workshop);
    }

    const populated = await Workshop.findById(id)
      .populate("participants", "name email idNumber")
      .populate(
        "familyRegistrations.familyMemberId",
        "name relation idNumber phone birthDate"
      )
      .populate("familyRegistrations.parentUser", "name email idNumber")
      .populate("waitingList.parentUser", "name email");

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






/**
 * ============================================================
 * WAITLIST REGISTRATION HANDLERS (User + Family)
 * ============================================================
 */

/**
 * POST /api/workshops/:id/waitlist-entity
 * Adds a user or family member to the waiting list.
 */
exports.addEntityToWaitlist = async (req, res) => {
  try {
    const { id } = req.params;
    const { familyId } = req.body;
    const user = req.user;

    const workshop = await Workshop.findById(id);
    if (!workshop)
      return res.status(404).json({ success: false, message: "Workshop not found" });

    // ✅ בדיקה אם כבר ברשימת ההמתנה
    const already = (workshop.waitingList || []).some(
      (e) =>
        e.parentUser.toString() === user._id.toString() &&
        (familyId
          ? e.familyMemberId?.toString() === familyId.toString()
          : !e.familyMemberId)
    );
    if (already)
      return res
        .status(400)
        .json({ success: false, message: "Already in waiting list" });

    // ✅ בדיקה אם יש מקום ברשימת ההמתנה
    if (
      workshop.waitingListMax > 0 &&
      workshop.waitingList.length >= workshop.waitingListMax
    ) {
      return res.status(400).json({
        success: false,
        message: "Waiting list is full",
      });
    }

    // ✅ בניית הרשומה החדשה
    const member = familyId
      ? user.familyMembers?.id(familyId)
      : null;

    const entry = {
      parentUser: user._id,
      familyMemberId: familyId || undefined,
      name: member ? member.name : user.name,
      relation: member ? member.relation : "self",
      idNumber: member ? member.idNumber : user.idNumber,
      phone: member ? member.phone : user.phone,
      birthDate: member ? member.birthDate : user.birthDate,
    };

    workshop.waitingList.push(entry);
    await workshop.save();

    res.json({
      success: true,
      message: "Added to waiting list successfully",
      position: workshop.waitingList.length,
    });
  } catch (err) {
    console.error("🔥 addEntityToWaitlist error:", err);
    res.status(500).json({
      success: false,
      message: "Server error adding to waitlist",
    });
  }
};

/**
 * DELETE /api/workshops/:id/waitlist-entity
 * Removes a user or family member from the waiting list.
 */
exports.removeEntityFromWaitlist = async (req, res) => {
  try {
    const { id } = req.params;
    const { familyId } = req.body;
    const user = req.user;

    const workshop = await Workshop.findById(id);
    if (!workshop)
      return res
        .status(404)
        .json({ success: false, message: "Workshop not found" });

    const before = workshop.waitingList.length;
    workshop.waitingList = (workshop.waitingList || []).filter((e) => {
      const isParent = e.parentUser.toString() === user._id.toString();
      const isFamilyMatch = familyId
        ? e.familyMemberId?.toString() === familyId.toString()
        : !e.familyMemberId;
      return !(isParent && isFamilyMatch);
    });

    if (before === workshop.waitingList.length) {
      return res.status(404).json({
        success: false,
        message: "Entry not found in waiting list",
      });
    }

    await workshop.save();
    res.json({
      success: true,
      message: "Removed from waiting list successfully",
    });
  } catch (err) {
    console.error("🔥 removeEntityFromWaitlist error:", err);
    res.status(500).json({
      success: false,
      message: "Server error removing from waitlist",
    });
  }
};

/* ------------------------------------------------------------
   📊 POST /api/workshops/:id/export — Admin only
   מייצר קובץ אקסל עם רשימת המשתתפים ושולח למייל של המנהל
------------------------------------------------------------ */

// serv

/**
 * Export full workshop participants (and waiting list) to Excel
 * Admin-only access
 */
// controllers/workshopController.js
exports.exportWorkshopExcel = async (req, res) => {
  try {
    const admin = req.user;
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const workshopId = req.params.id;

    // 🧩 Utilities
    const pad = (n) => String(n).padStart(2, "0");
    const toHebDate = (d) => {
      if (!d) return "";
      const dt = new Date(d);
      if (isNaN(dt)) return "";
      return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`;
    };
    const calcAge = (dob) => {
      if (!dob) return "";
      const d = new Date(dob);
      if (isNaN(d)) return "";
      const now = new Date();
      let a = now.getFullYear() - d.getFullYear();
      const m = now.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
      return a;
    };

    // 🧩 Fetch workshop
    const workshop = await Workshop.findById(workshopId)
      .populate("participants", "name email phone city birthDate idNumber canCharge")
      .populate("familyRegistrations.parentUser", "name email phone city canCharge")
      .populate("familyRegistrations.familyMemberId", "name relation idNumber phone birthDate")
      .populate("waitingList.parentUser", "name email phone city canCharge")
      .lean();

    if (!workshop) return res.status(404).json({ message: "Workshop not found" });

    // 🧩 Handle default values
    const startDate = workshop.startDate ? new Date(workshop.startDate) : new Date(workshop.createdAt);
    const periodDays = Number(workshop.timePeriod) || 30;
    const endDate = new Date(startDate.getTime() + periodDays * 24 * 60 * 60 * 1000);

    const startDateStr = toHebDate(startDate);
    const endDateStr = toHebDate(endDate);

    // 🧾 Determine which sections to include based on query param
    const exportType = String(req.query.type || '').toLowerCase();
    const includeParticipants = !exportType || exportType === 'current';
    const includeWaitlist = !exportType || exportType === 'waitlist';

    // 🧾 Create Excel file (participants and/or waitlist)
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("דו\"ח משתתפים", { views: [{ rightToLeft: true }] });

    sheet.columns = [
      { header: "שם משתתף", key: "p_name", width: 25 },
      { header: "קרבה", key: "p_relation", width: 15 },
      { header: "אימייל", key: "p_email", width: 25 },
      { header: "טלפון", key: "p_phone", width: 16 },
      { header: "תעודת זהות", key: "p_id", width: 16 },
      { header: "תאריך לידה", key: "p_birth", width: 15 },
      { header: "גיל", key: "p_age", width: 8 },
      { header: "ניתן לגבות", key: "p_cancharge", width: 12 },
      { header: "מקור", key: "origin", width: 16 },
    ];

    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.alignment = { horizontal: "center" };

    // ✅ Participants (main users)
    if (includeParticipants) {
      (workshop.participants || []).forEach((p) => {
        sheet.addRow({
          p_name: p.name || "",
          p_relation: "עצמי",
          p_email: p.email || "",
          p_phone: p.phone || "",
          p_id: p.idNumber || "",
          p_birth: toHebDate(p.birthDate),
          p_age: calcAge(p.birthDate),
          p_cancharge: p.canCharge ? "כן" : "לא",
          origin: "משתתף",
        });
      });

      // ✅ Family members (participants)
      (workshop.familyRegistrations || []).forEach((fr) => {
        const fm = fr.familyMemberId || {};
        const parent = fr.parentUser || {};
        const email = fm.email || parent.email || "";
        const phone = fm.phone || parent.phone || "";
        const canCharge = parent.canCharge ? "כן" : "לא";
        sheet.addRow({
          p_name: fm.name || fr.name || "",
          p_relation: fm.relation || fr.relation || "בן משפחה",
          p_email: email,
          p_phone: phone,
          p_id: fm.idNumber || fr.idNumber || "",
          p_birth: toHebDate(fm.birthDate || fr.birthDate),
          p_age: calcAge(fm.birthDate || fr.birthDate),
          p_cancharge: canCharge,
          origin: "משתתף",
        });
      });
    }

    // 🔹 Add separator if both participants and waitlist are included
    if (includeParticipants && includeWaitlist) {
      const sepRowIdx = sheet.lastRow.number + 2;
      sheet.mergeCells(sepRowIdx, 1, sepRowIdx, sheet.columnCount);
      const sep = sheet.getCell(sepRowIdx, 1);
      sep.value = "— רשימת המתנה —";
      sep.alignment = { horizontal: "center" };
      sheet.getRow(sepRowIdx).font = { bold: true };
    }

    // ✅ Waiting list
    if (includeWaitlist) {
      (workshop.waitingList || []).forEach((wl) => {
        const parent = wl.parentUser || {};
        const email = wl.email || parent.email || "";
        const phone = wl.phone || parent.phone || "";
        const canCharge = parent.canCharge ? "כן" : "לא";
        sheet.addRow({
          p_name: wl.name || "",
          p_relation: wl.relation || (wl.familyMemberId ? "בן משפחה" : "עצמי"),
          p_email: email,
          p_phone: phone,
          p_id: wl.idNumber || "",
          p_birth: toHebDate(wl.birthDate),
          p_age: calcAge(wl.birthDate),
          p_cancharge: canCharge,
          origin: "רשימת המתנה",
        });
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();

    // 🧩 Build RTL Hebrew email body
    const statsLine = `${(workshop.participantsCount ??
      (workshop.participants?.length || 0) +
        (workshop.familyRegistrations?.length || 0))} מתוך ${
      workshop.maxParticipants ?? 0
    }`;
    const waitCount = workshop.waitingList?.length || 0;

    const plainBody = `
שלום ${admin.name},

להלן דו״ח הסדנה "${workshop.title || "-"}":

פרטי הסדנה:
• סוג: ${workshop.type || "-"}
• מאמן: ${workshop.coach || "-"}
• סטודיו: ${workshop.studio || "-"}
• עיר: ${workshop.city || "-"}
• יום: ${workshop.day || "-"}
• שעה: ${workshop.hour || "-"}
• תאריך התחלה: ${startDateStr}
• תאריך סיום: ${endDateStr}
• תקופה (ימים): ${periodDays}
• כמות משתתפים: ${statsLine}
• רשימת המתנה: ${waitCount} משתתפים

מצורף קובץ אקסל עם רשימת המשתתפים ורשימת ההמתנה.

בברכה,
מערכת הסדנאות
`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    await transporter.sendMail({
  from: `"מערכת סדנאות" <${process.env.EMAIL_USER}>`,
  to: admin.email,
  subject: `📊 דו״ח סדנה — ${workshop.title || ""}`,
  html: `
    <div dir="rtl" style="font-family: 'Segoe UI', sans-serif; text-align: right; line-height: 1.6; color: #222; font-size: 15px;">
      <p>שלום ${admin.name},</p>
      <p>להלן דו״ח הסדנה <strong>"${workshop.title || "-"}"</strong>:</p>

      <h3 style="margin-bottom: 8px; margin-top: 16px;">פרטי הסדנה:</h3>
      <ul style="list-style-type: none; padding: 0; margin: 0;">
        <li>• סוג: ${workshop.type || "-"}</li>
        <li>• מאמן: ${workshop.coach || "-"}</li>
        <li>• סטודיו: ${workshop.studio || "-"}</li>
        <li>• עיר: ${workshop.city || "-"}</li>
        <li>• יום: ${workshop.day || "-"}</li>
        <li>• שעה: ${workshop.hour || "-"}</li>
        <li>• תאריך התחלה: ${startDateStr}</li>
        <li>• תאריך סיום: ${endDateStr}</li>
        <li>• תקופה (ימים): ${periodDays}</li>
        <li>• כמות משתתפים: ${statsLine}</li>
        <li>• רשימת המתנה: ${waitCount} משתתפים</li>
      </ul>

      <p style="margin-top: 16px;">
        מצורף קובץ אקסל עם רשימת המשתתפים ורשימת ההמתנה.
      </p>

      <p style="margin-top: 24px;">
        בברכה,<br/>
        <strong>מערכת הסדנאות</strong>
      </p>
    </div>
  `,
  attachments: [
    {
      filename: `דו״ח משתתפים - ${workshop.title || "ללא שם"}.xlsx`,
      content: buffer,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  ],
});

    res.json({ success: true, message: "Excel sent successfully" });
  } catch (err) {
    console.error("❌ exportWorkshopExcel error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};



/* ------------------------------------------------------------
   📝 GET /api/workshops/:id/waitlist — Admin only
   Returns the current waiting list for a workshop.  Useful for
   reviewing queue order and manually promoting or removing
   entries.
------------------------------------------------------------ */
exports.getWaitlist = async (req, res) => {
  try {
    const { id } = req.params;
    const workshop = await Workshop.findById(id).populate("waitingList.parentUser", "name email");
    if (!workshop) return res.status(404).json({ message: "Workshop not found" });
    return res.json(workshop.waitingList || []);
  } catch (err) {
    console.error("❌ getWaitlist error:", err);
    res.status(500).json({ message: "Server error fetching waitlist" });
  }
};

/* ------------------------------------------------------------
   ➕ POST /api/workshops/:id/waitlist — Admin only
   Allows an admin to manually add a user or family member to
   the waiting list.  Accepts { userId, familyId } in body.
------------------------------------------------------------ */
exports.addToWaitlist = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, familyId } = req.body;
    const workshop = await Workshop.findById(id);
    if (!workshop) return res.status(404).json({ message: "Workshop not found" });
    // Ensure waiting list has space
    if (workshop.waitingListMax > 0 && workshop.waitingList.length >= workshop.waitingListMax) {
      return res.status(400).json({ message: "Waiting list at capacity" });
    }
    // Lookup parent user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    let member = null;
    if (familyId) {
      member = user.familyMembers.id(familyId);
      if (!member) return res.status(404).json({ message: "Family member not found" });
    }
    // Prevent duplicates
    const duplicate = (workshop.waitingList || []).some((e) => {
      if (familyId) {
        return e.familyMemberId && e.familyMemberId.toString() === familyId.toString() && e.parentUser.toString() === userId.toString();
      }
      return !e.familyMemberId && e.parentUser.toString() === userId.toString();
    });
    if (duplicate) return res.status(400).json({ message: "Already on waiting list" });
    // Build entry
    const entry = {
      parentUser: user._id,
      familyMemberId: familyId || undefined,
      name: familyId ? member.name : user.name,
      relation: familyId ? member.relation : "self",
      idNumber: familyId ? member.idNumber : user.idNumber,
      phone: familyId ? member.phone : user.phone,
      birthDate: familyId ? member.birthDate : user.birthDate,
    };
    workshop.waitingList.push(entry);
    await workshop.save();
    return res.json({ success: true, message: "Added to waiting list", waitlist: workshop.waitingList });
  } catch (err) {
    console.error("❌ addToWaitlist error:", err);
    res.status(500).json({ message: "Server error adding to waitlist" });
  }
};

/* ------------------------------------------------------------
   ➖ DELETE /api/workshops/:id/waitlist/:entryId — Admin only
   Removes an entry from the waiting list by its subdocument id.
------------------------------------------------------------ */
exports.removeFromWaitlist = async (req, res) => {
  try {
    const { id, entryId } = req.params;
    const workshop = await Workshop.findById(id);
    if (!workshop) return res.status(404).json({ message: "Workshop not found" });
    const before = workshop.waitingList.length;
    workshop.waitingList = (workshop.waitingList || []).filter((e) => e._id.toString() !== entryId.toString());
    if (workshop.waitingList.length === before) return res.status(404).json({ message: "Waitlist entry not found" });
    await workshop.save();
    return res.json({ success: true, message: "Removed from waiting list", waitlist: workshop.waitingList });
  } catch (err) {
    console.error("❌ removeFromWaitlist error:", err);
    res.status(500).json({ message: "Server error removing from waitlist" });
  }
};
// ✅ מחזיר רשימת ערים בישראל ממקור ממשלתי (או fallback ל-local)
exports.getAvailableCities = async (req, res) => {
  try {
    // ✅ ניסיון ראשון – קריאה ל-API ממשלתי
    const url =
      "https://data.gov.il/api/3/action/datastore_search?resource_id=bb040a11-b8b0-46a9-bc48-63a972df2a5b&limit=5000";
    const response = await fetch(url, {
      headers: { "User-Agent": "Clalit-Workshops-App" },
    });

    const data = await response.json();

    const cities =
      data?.result?.records
        ?.map((r) => r["שם_ישוב"] || r["שם_ישוב_לועזי"])
        ?.filter(Boolean) || [];

    if (!cities.length) throw new Error("No cities found from data.gov.il");

    const unique = [...new Set(cities)].sort();
    console.log(`✅ Loaded ${unique.length} cities from data.gov.il`);
    return res
      .status(200)
      .json({ success: true, source: "data.gov.il", count: unique.length, cities: unique });
  } catch (err) {
    console.warn("⚠️ Failed to fetch cities:", err.message);

    // ✅ fallback מיוחד לאזור הנגב והדרום
    const southernCities = [
      "באר שבע",
      "כרמים",
      "כרמית",
      "דימונה",
      "ערד",
      "ירוחם",
      "אופקים",
      "שדרות",
      "נתיבות",
      "רהט",
      "להבים",
      "מיתר",
      "עומר",
      "חורה",
      "תל שבע",
      "כסייפה",
      "ערערה בנגב",
      "שגב שלום",
      "מרחבים",
      "בני שמעון",
      "אשכול",
      "חוף אשקלון",
      "מצפה רמון",
      "אילת",
      "צאלים",
      "שדה בוקר",
      "חצרים",
      "משאבי שדה",
      "קדש ברנע",
      "עין יהב",
      "ספיר",
    ];

    return res.status(200).json({
      success: true,
      source: "fallback-southern",
      count: southernCities.length,
      cities: southernCities,
    });
  }
};

// ✅ בודק אם הכתובת שייכת לעיר בעזרת OpenStreetMap (Nominatim)
exports.validateAddress = async (req, res) => {
  const { city, address } = req.query;
  if (!city || !address)
    return res.status(400).json({ success: false, message: "city and address are required" });

  try {
    const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
      city
    )}&street=${encodeURIComponent(address)}&country=Israel&format=json`;
    const response = await fetch(url, { headers: { "User-Agent": "Clalit-Workshops-App" } });
    const data = await response.json();

    const valid = Array.isArray(data) && data.length > 0;
    res.status(200).json({
      success: true,
      valid,
      message: valid ? "Address matches city" : "Address not found for this city",
    });
  } catch (err) {
    console.error("❌ Address validation error:", err.message);
    res.status(500).json({ success: false, message: "Validation service unavailable" });
  }
};

