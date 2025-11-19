const User = require("../models/User");
const Workshop = require("../models/Workshop");
const { sanitizeUserForResponse } = require("../utils/sanitizeUser");



const mongoose = require("mongoose");
const { runUserIntegrityAudit, getAuditSnapshot } = require("../services/auditService");


// routes stay the same: router.delete("/:id", protect, authorizeAdmin, usersController.deleteUser)

const { unregisterUserFromWorkshop, unregisterFamilyFromWorkshop} =
  require("../services/workshopRegistration");

/**
 * deleteUser
 * --------------------------------------------------------------------------
 * Deletes a user and cleans up all workshop registrations efficiently.
 * Uses userWorkshopMap and familyWorkshopMap for O(1) lookups.
 */
exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId).select("userWorkshopMap familyWorkshopMap");
    if (!user) return res.status(404).json({ message: "User not found" });

    // unregister direct user workshops
    for (const wid of user.userWorkshopMap) {
      await unregisterUserFromWorkshop({ workshopId: wid, userId });
    }

    // unregister family workshops
    for (const f of user.familyWorkshopMap) {
      for (const wid of f.workshops) {
        await unregisterFamilyFromWorkshop({
          workshopId: wid,
          parentUserId: userId,
          familyId: f.familyMemberId,
        });
      }
    }

    await User.findByIdAndDelete(userId);
    res.json({ success: true, message: "User deleted and cleaned up successfully" });
  } catch (err) {
    console.error("❌ deleteUser error:", err);
    res.status(500).json({ success: false, message: "Server error deleting user" });
  }
};





/* ============================================================
   🔍 Hybrid Search (admin: global, user: own family)
   ============================================================ */

// ---- helpers ----
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSearchQuery(q) {
  let s = String(q ?? "");
  try { s = decodeURIComponent(s); } catch (_) {}
  s = s.trim().toLowerCase();
  if (/[\d\-]/.test(s)) s = s.replace(/[\u00A0\s\-]+/g, ""); // only for phones
  s = s.replace(/[^\w@.\u0590-\u05FF\s]/g, "");
  return s;
}

// analyzed (text/fuzzy)
const SEARCH_ANALYZED = [
  "name","email","city","idNumber","phone",
  "familyMembers.name","familyMembers.email","familyMembers.city",
  "familyMembers.idNumber","familyMembers.phone","familyMembers.relation",
];

// keyword (wildcard/regex true substring)
const SEARCH_KEYWORD = [
  "name_keyword","email_keyword","city_keyword","idNumber_keyword","phone_keyword",
  "familyMembers.name_keyword","familyMembers.email_keyword","familyMembers.city_keyword",
  "familyMembers.idNumber_keyword","familyMembers.phone_keyword",
];

/* ============================================================
   MAIN: searchUsers
   ============================================================ */
exports.searchUsers = async (req, res) => {
  try {
    const raw = (req.query.q || "").trim();
    if (!raw) return res.json([]);

    const requester = req.user;
    const q = normalizeSearchQuery(raw);
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || "60", 10) || 60, 200));
    const escaped = escapeRegex(q);
    const wildcardToken = `*${q}*`;

    // ============================================================
    // ADMIN MODE — Full-Index Global Search
    // ============================================================
    if (requester && requester.role === "admin") {
      const start = Date.now();
      console.groupCollapsed("🔎 [searchUsers] ADMIN entry");
      console.log("🔹 Raw:", raw, "| Normalized:", q, "| Limit:", limit);
      console.groupEnd();

      // ---------- Atlas Compound Search ----------
      const pipeline = [
        {
          $search: {
            index: "UsersIndex",
            compound: {
              should: [
                { text: { query: q, path: SEARCH_ANALYZED } }, // exact-ish text
                { wildcard: { path: SEARCH_KEYWORD, query: wildcardToken, allowAnalyzedField: true } }, // substring
                { text: { query: q, path: SEARCH_ANALYZED, fuzzy: { maxEdits: 1 } } }, // fuzzy
                { regex: { path: SEARCH_KEYWORD, query: escaped, allowAnalyzedField: true } }, // literal regex
              ],
              minimumShouldMatch: 1,
            },
          },
        },
        { $limit: Math.max(limit, 40) },
        {
          $project: {
            name: 1, email: 1, phone: 1, idNumber: 1, city: 1,
            role: 1, canCharge: 1, birthDate: 1,
            familyMembers: {
              _id: 1, name: 1, email: 1, phone: 1,
              idNumber: 1, city: 1, relation: 1, birthDate: 1,
            },
            score: { $meta: "searchScore" },
            highlights: { $meta: "searchHighlights" },
          },
        },
      ];

      let docs = [];
      let clauseUsed = null;

      try {
        docs = await User.aggregate(pipeline).exec();
        clauseUsed = "Atlas compound";
      } catch (err) {
        console.error("⚠️ Atlas $search error:", err.codeName || err.message);
        clauseUsed = "Atlas error → fallback regex";
      }

      // ---------- Fallback (Regex) ----------
      if (!docs.length && q) {
        const rx = new RegExp(escapeRegex(q), "i");
        console.log("⚙️ [fallback] Running two-phase regex fallback for:", q);

        // Phase A: user fields
        const usersFound = await User.find({
          $or: [
            { name: rx }, { email: rx }, { phone: rx }, { idNumber: rx }, { city: rx },
          ],
        }).limit(Math.max(limit, 40)).lean();

        // Phase B: family fields
        const familyFound = await User.find({
          $or: [
            { "familyMembers.name": rx },
            { "familyMembers.email": rx },
            { "familyMembers.phone": rx },
            { "familyMembers.idNumber": rx },
            { "familyMembers.city": rx },
            { "familyMembers.relation": rx },
          ],
        }).limit(Math.max(limit, 40)).lean();

        console.log(`⚙️ [fallback] usersFound=${usersFound.length}, familyFound=${familyFound.length}`);
        if (usersFound.length) {
          clauseUsed = "fallback regex (user fields)";
          docs = usersFound;
        } else if (familyFound.length) {
          clauseUsed = "fallback regex (family fields)";
          docs = familyFound;
        } else {
          clauseUsed = "fallback regex (no hits)";
          docs = [];
        }
      }

      // ---------- Diagnostics ----------
      const took = Date.now() - start;
      const sample = docs[0];
      console.groupCollapsed(`🧩 [searchUsers] ADMIN stage (${clauseUsed}, ${took} ms)`);
      console.log("docs:", docs.length);
      if (sample) {
        console.log("sample:", {
          _id: sample._id,
          name: sample.name,
          familyCount: sample.familyMembers?.length || 0,
          highlight: sample.highlights?.slice(0, 3)?.map(h => ({
            path: h.path,
            type: h.type || "text",
            snippet: h.texts?.map(t => t.value).join(""),
          })),
        });
      }
      console.groupEnd();

      // ============================================================
      // Deterministic Emission
      // ============================================================
      const userMap = new Map();
      const unified = [];

      for (const doc of docs) {
        const key = String(doc._id);

        // --- USER field match ---
        const userFields = [doc.name, doc.email, doc.idNumber, doc.phone, doc.city]
          .map(v => (v ? String(v).toLowerCase() : ""));
        let userExact = false, userPartial = false, userMatchType = "";
        for (const f of userFields) {
          if (!f) continue;
          if (f === q) { userExact = true; userMatchType = "exact"; break; }
          if (f.includes(q)) { userPartial = true; userMatchType = "partial"; }
        }

        // --- FAMILY field match ---
        const matchedFamilies = [];
        let familyExact = false, familyPartial = false, familyMatchType = "";
        for (const fam of doc.familyMembers || []) {
          const famFields = [fam.name, fam.email, fam.idNumber, fam.phone, fam.city, fam.relation]
            .map(v => (v ? String(v).toLowerCase() : ""));
          let famExact = false, famPartial = false;
          for (const fField of famFields) {
            if (!fField) continue;
            if (fField === q) { famExact = true; familyMatchType = "exact"; break; }
            if (fField.includes(q)) { famPartial = true; familyMatchType = "partial"; }
          }
          if (famExact) familyExact = true;
          if (famPartial) familyPartial = true;
          if (famExact || famPartial) {
            matchedFamilies.push({
              _id: fam._id,
              name: fam.name,
              email: fam.email,
              phone: fam.phone,
              idNumber: fam.idNumber,
              city: fam.city,
              relation: fam.relation,
              birthDate: fam.birthDate,
              canCharge: Boolean(doc.canCharge),
            });
          }
        }

        // --- CASE evaluation ---
        const hasUserMatch = userExact || userPartial;
        const hasFamilyMatch = familyExact || familyPartial;
        let caseNum = 0;
        if (!hasUserMatch && !hasFamilyMatch) continue;
        if (hasUserMatch && hasFamilyMatch) caseNum = 3;
        else if (hasUserMatch) caseNum = 1;
        else if (hasFamilyMatch) caseNum = 2;

        if (!userMap.has(key)) {
          userMap.set(key, {
            _id: doc._id,
            name: doc.name,
            email: doc.email,
            phone: doc.phone,
            idNumber: doc.idNumber,
            city: doc.city,
            role: doc.role,
            canCharge: Boolean(doc.canCharge),
            birthDate: doc.birthDate,
            familyMembers: [],
            _seenFamilyIds: new Set(),
            familyOnly: false,
          });
        }

        const base = userMap.get(key);

        // --- CASE logic ---
        if (caseNum === 3) {
          for (const mf of matchedFamilies) {
            const fid = String(mf._id);
            if (!base._seenFamilyIds.has(fid)) {
              base._seenFamilyIds.add(fid);
              base.familyMembers.push(mf);
            }
          }
        } else if (caseNum === 2) {
  // 🧩 Family-only match — no direct user match at all
  base.familyOnly = true;

  // Build standalone payloads for each matched family member
  for (const mf of matchedFamilies) {
    const fid = String(mf._id);
    if (!base._seenFamilyIds.has(fid)) {
      base._seenFamilyIds.add(fid);
    }

    // Push only the matching family member — not the parent
    unified.push({
      _id: mf._id,
      name: mf.name,
      email: mf.email,
      phone: mf.phone,
      idNumber: mf.idNumber,
      city: mf.city,
      relation: mf.relation,
      birthDate: mf.birthDate,
      canCharge: Boolean(doc.canCharge),
      parentId: doc._id,
      parentName: doc.name,
      parentEmail: doc.email,
      familyOnly: true,
      _matchSource: familyMatchType === "exact" ? "family-exact" : "family-partial",
    });

    console.log(
      `🧭 [match-trace] ${mf.name} | case=2 | userMatch=none | familyMatch=${familyMatchType} → standalone (parent=${doc.name})`
    );
  }

  // Skip adding the parent entirely for this case
  continue;
}

        // log trace
        console.log(
          `🧭 [match-trace] ${doc.name} | case=${caseNum} | userMatch=${userMatchType} | familyMatch=${familyMatchType}`
        );
      }

      // append map values
      for (const u of userMap.values()) {
        delete u._seenFamilyIds;
        if (u.familyOnly) continue; // skip parents already represented by family-only results

        unified.push(u);
      }

      console.groupCollapsed("📦 [searchUsers] ADMIN unified summary");
      console.log("Query:", q, "| Clause:", clauseUsed);
      for (const u of unified) {
        console.log(
          `👤 ${u.name || "(family)"} | familyOnly=${u.familyOnly} | famCount=${u.familyMembers?.length || 0}`
        );
        for (const f of u.familyMembers || []) {
          console.log("   ↳ 👪", f.name, "|", f.email, "|", f.relation);
        }
      }
      console.groupEnd();

      return res.json(unified);
    }

    // ============================================================
    // REGULAR USER — Own Family Only
    // ============================================================
    const me = await User.findById(req.user._id).select("familyMembers canCharge");
    const family = me?.familyMembers || [];
    const filtered = family
      .filter(m =>
        Object.values(m.toObject ? m.toObject() : m)
          .some(val => val && String(val).toLowerCase().includes(q))
      )
      .map(m => ({ ...(m.toObject ? m.toObject() : m), canCharge: Boolean(me.canCharge) }));

    const payload = [{ _id: req.user._id, canCharge: Boolean(me?.canCharge), familyMembers: filtered }];

    console.groupCollapsed("🔎 [searchUsers] REGULAR");
    console.log("user:", req.user._id, "query:", q, "results:", filtered.length);
    console.table(filtered.map(f => ({ _id: String(f._id), name: f.name, email: f.email, relation: f.relation })));
    console.groupEnd();

    return res.json(payload);

  } catch (err) {
    console.error("❌ [searchUsers] Error:", err);
    res.status(500).json({ message: "Server error performing hybrid search", error: err.message });
  }
};


/* ============================================================
   🟢 Get current logged-in user
   ============================================================ */
exports.getMe = async (req, res) => {
  try {
    if (!req.user?._id) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findById(req.user._id).select("-passwordHash -otpCode -otpAttempts");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(sanitizeUserForResponse(user, req.user));
  } catch (err) {
    res.status(500).json({ message: "Server error fetching user" });
  }
};


/* ============================================================
   📋 Get all users (admin only)
   ============================================================ */
// controllers/userController.js (inside getAllUsers)
exports.getAllUsers = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const limit = Math.min(parseInt(req.query.limit || "1000", 10), 5000);
    // compact projection for the list
    const projection = {
      name: 1, email: 1, phone: 1, idNumber: 1, city: 1, birthDate: 1,
      role: 1, canCharge: 1,
      "familyMembers._id": 1,
      "familyMembers.name": 1,
      "familyMembers.email": 1,
      "familyMembers.phone": 1,
      "familyMembers.idNumber": 1,
      "familyMembers.city": 1,
      "familyMembers.birthDate": 1,
      "familyMembers.relation": 1,
    };

    const users = await User.find({}, projection)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const enriched = users.map((u) => {
      const clean = sanitizeUserForResponse(u, req.user);
      clean.canCharge = Boolean(u.canCharge);
      clean.familyMembers = (u.familyMembers || []).map((f) => hydrateFamilyMember(f, clean));
      return clean;
    });

    return res.json(enriched);
  } catch (err) {
    console.error("❌ [getAllUsers] Error:", err);
    return res.status(500).json({ message: "Server error loading users", error: err.message });
  }
};

/* ============================================================
   🛡️ Integrity audit (admin only)
   ============================================================ */
exports.getUserAuditReport = async (_req, res) => {
  try {
    const report = await runUserIntegrityAudit({ reason: "admin-request", force: true });
    return res.json({ success: true, report });
  } catch (err) {
    const snapshot = getAuditSnapshot();
    console.error("❌ [getUserAuditReport] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Audit scan failed",
      lastAudit: snapshot?.lastAuditResult || null,
      error: err.message,
    });
  }
};

/* ============================================================
   🟢 Get user or family member by ID
   ============================================================ */
exports.getUserById = async (req, res) => {
  try {
    const id = req.params.id;
    const requester = req.user;

    if (!requester?._id) return res.status(401).json({ message: "Unauthorized" });

    let user = await User.findById(id).select("-passwordHash -otpCode -otpAttempts");
    if (!user) {
      const parent = await User.findOne({ "familyMembers._id": id }).select("name email familyMembers");
      if (parent) {
        const isOwner = String(parent._id) === String(requester._id);
        const isAdmin = requester.role === "admin";
        if (!isOwner && !isAdmin) return res.status(403).json({ message: "Unauthorized" });

        const member = parent.familyMembers.id(id);
        return res.json(hydrateFamilyMember(member, parent));
      }
      return res.status(404).json({ message: "User not found" });
    }

    const isSelf = String(requester._id) === String(user._id);
    const isAdmin = requester.role === "admin";
    if (!isSelf && !isAdmin) return res.status(403).json({ message: "Unauthorized" });

    res.json(sanitizeUserForResponse(user, requester));
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
    const requester = req.user;
    if (!requester?._id) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findById(id).select("-passwordHash -otpCode -otpAttempts");
    const isAdmin = requester.role === "admin";
    if (user) {
      const isSelf = String(requester._id) === String(user._id);
      if (!isSelf && !isAdmin) return res.status(403).json({ message: "Unauthorized" });
      return res.json({ type: "user", entity: sanitizeUserForResponse(user, requester) });
    }

    const parent = await User.findOne({ "familyMembers._id": id }).select("familyMembers name email");
    if (parent) {
      const isOwner = String(parent._id) === String(requester._id);
      if (!isOwner && !isAdmin) return res.status(403).json({ message: "Unauthorized" });

      const member = parent.familyMembers.id(id);
      return res.json({
        type: "familyMember",
        entity: hydrateFamilyMember(member, parent),
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

    res.status(201).json({
      message: "User created successfully",
      user: sanitizeUserForResponse(user, req.user),
    });
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
    const isAdmin = requester?.role === "admin";

    if (!userId && !familyId)
      return res.status(400).json({ message: "Missing userId or familyId" });

    if (!updates || typeof updates !== "object")
      return res.status(400).json({ message: "Missing updates payload" });

    const baseAllowedKeys = ["name", "idNumber", "birthDate", "phone", "city", "familyMembers"];
    const adminOnlyKeys = ["canCharge", "role"];
    const allowedKeys = isAdmin ? [...baseAllowedKeys, ...adminOnlyKeys] : baseAllowedKeys;

    const requestedKeys = Object.keys(updates || {});
    const invalidKeys = requestedKeys.filter((key) => !allowedKeys.includes(key));
    if (invalidKeys.length)
      return res.status(403).json({ message: "Some fields require admin access", fields: invalidKeys });

    /* =========================
       🔹 Case 1: Update main user
    ========================== */
    if (userId && !familyId) {
      if (!isAdmin && String(requester._id) !== String(userId))
        return res.status(403).json({ message: "Unauthorized" });

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      for (const key of allowedKeys)
        if (updates[key] !== undefined) user[key] = updates[key];

      await user.save();
      return res.json({
        success: true,
        message: "User updated successfully",
        user: sanitizeUserForResponse(user, requester),
      });
    }

    /* =========================
       🔹 Case 2: Update family member
    ========================== */
    if (familyId) {
      const targetUserId = parentUserId || userId || requester._id;

      if (!isAdmin && String(targetUserId) !== String(requester._id))
        return res.status(403).json({ message: "Unauthorized" });

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


      return res.json({
        success: true,
        message: "Family member updated successfully (synced)",
        user: sanitizeUserForResponse(user, requester),
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
   🧾 Get workshops per user or family member (Stable version)
   ============================================================ */
exports.getUserWorkshopsList = async (req, res) => {
  try {
    const { id } = req.params; // parentUserId
    const familyIdQuery = req.query.familyId || null;

    // Always treat `id` as the parent user ID.  This endpoint should be
    // invoked as /api/users/:userId/workshops for the user themselves or
    // /api/users/:parentUserId/workshops?familyId=:familyId for a specific
    // family member.  Do not attempt to infer a family member from the
    // route parameter.
    const parentUser = await User.findById(id).select("familyMembers name email");
    if (!parentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const summaries = [];

    // 🟢 Branch A: fetch summaries for the parent user and all family members
    // if no specific familyId is requested.
    if (!familyIdQuery) {
      // Pull workshops where either the user or any of their family
      // registrations exist.  Only project the fields we actually return.
      const workshops = await Workshop.find({
        $or: [
          { participants: parentUser._id },
          { "familyRegistrations.parentUser": parentUser._id },
        ],
      }).select("title coach day hour participants familyRegistrations");

      workshops.forEach((w) => {
        // Add an entry for direct user registrations
        if ((w.participants || []).map(String).includes(String(parentUser._id))) {
          summaries.push({
            workshopId: w._id,
            title: w.title,
            coach: w.coach,
            day: w.day,
            hour: w.hour,
            relation: "self",
          });
        }
        // Add entries for each of the parent's family registrations
        (w.familyRegistrations || []).forEach((fr) => {
          if (String(fr.parentUser) !== String(parentUser._id)) return;
          summaries.push({
            workshopId: w._id,
            title: w.title,
            coach: w.coach,
            day: w.day,
            hour: w.hour,
            relation: `${fr.name || ""}${fr.relation ? ` (${fr.relation})` : ""}`,
            familyMemberId: fr.familyMemberId,
          });
        });
      });
      return res.json(summaries);
    }

    // 🟢 Branch B: fetch only the workshops for a specific family member
    const famId = familyIdQuery;
    // Validate that this family member belongs to the parent user
    const familyMember = parentUser.familyMembers.id(famId);
    if (!familyMember) {
      return res.status(404).json({ message: "Family member not found" });
    }
    const workshopsForFamily = await Workshop.find({
      "familyRegistrations.parentUser": parentUser._id,
      "familyRegistrations.familyMemberId": familyMember._id,
    }).select("title coach day hour familyRegistrations");

    workshopsForFamily.forEach((w) => {
      summaries.push({
        workshopId: w._id,
        title: w.title,
        coach: w.coach,
        day: w.day,
        hour: w.hour,
        relation: `${familyMember.name || ""}${familyMember.relation ? ` (${familyMember.relation})` : ""}`,
        familyMemberId: familyMember._id,
      });
    });
    return res.json(summaries);
  } catch (err) {
    console.error("❌ getUserWorkshopsList error:", err);
    res.status(500).json({ message: "Server error fetching workshops list", error: err.message });
  }
};

const toPlain = (doc) => (doc && typeof doc.toObject === "function" ? doc.toObject() : doc || {});
const hasValue = (val) => !(val === undefined || val === null || val === "");
const withFallback = (value, fallback) => (hasValue(value) ? value : fallback);

const hydrateFamilyMember = (memberDoc, parentDoc) => {
  const member = { ...toPlain(memberDoc) };
  const parent = toPlain(parentDoc);
  const merged = { ...member };

  const fields = ["email", "phone", "city", "idNumber", "birthDate"];
  for (const field of fields) {
    merged[field] = withFallback(member[field], parent[field]);
  }

  merged.parentId = parent._id || member.parentId || null;
  merged.parentName = parent.name || member.parentName || "";
  merged.parentEmail = parent.email || member.parentEmail || "";
  merged.parentPhone = parent.phone || member.parentPhone || "";
  merged.parentCity = parent.city || member.parentCity || "";
  merged.parentCanCharge = typeof parent.canCharge === "boolean" ? parent.canCharge : !!member.parentCanCharge;
  merged.canCharge = Boolean(parent.canCharge);

  return merged;
};
