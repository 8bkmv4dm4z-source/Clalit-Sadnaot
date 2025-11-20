const User = require("../models/User");
const Workshop = require("../models/Workshop");
const { sanitizeUserForResponse } = require("../utils/sanitizeUser");
const {
  buildEntityFromUserDoc,
  buildEntityFromFamilyMemberDoc,
} = require("../services/entities/buildEntity");
const { normalizeSearchQuery } = require("../services/entities/normalize");
const { resolveEntityByKey } = require("../services/entities/resolveEntity");



const { runUserIntegrityAudit, getAuditSnapshot } = require("../services/auditService");


// routes stay the same: router.delete("/:id", protect, authorizeAdmin, usersController.deleteUser)

const { unregisterUserFromWorkshop, unregisterFamilyFromWorkshop} =
  require("../services/workshopRegistration");

const FORBIDDEN_IDENTITY_FIELDS = [
  "entityType",
  "parentId",
  "userId",
  "familyId",
  "_id",
  "parentUserId",
  "workshopId",
];

const rejectForbiddenFields = (payload = {}) => {
  const sent = Object.keys(payload || {});
  const forbidden = sent.filter((f) => FORBIDDEN_IDENTITY_FIELDS.includes(f));
  if (forbidden.length) {
    const error = new Error("Invalid or forbidden field");
    error.statusCode = 400;
    error.fields = forbidden;
    throw error;
  }
};

const assertOwnershipOrAdmin = ({ ownerId, requester }) => {
  const isAdmin = requester?.role === "admin";
  const isOwner = ownerId && requester?._id && String(ownerId) === String(requester._id);
  if (!isOwner && !isAdmin) {
    const error = new Error("Unauthorized");
    error.statusCode = 403;
    throw error;
  }
};

/**
 * deleteUser
 * --------------------------------------------------------------------------
 * Deletes a user and cleans up all workshop registrations efficiently.
 * Uses userWorkshopMap and familyWorkshopMap for O(1) lookups.
 */
exports.deleteUser = async (req, res) => {
  try {
    rejectForbiddenFields(req.body);

    const entityKey = req.params.id;
    const resolved = await resolveEntityByKey(entityKey);

    if (!resolved) {
      return res.status(404).json({ success: false, message: "Entity not found" });
    }

    if (resolved.type === "user") {
      assertOwnershipOrAdmin({ ownerId: resolved.userDoc._id, requester: req.user });

      const user = await User.findById(resolved.userDoc._id).select(
        "userWorkshopMap familyWorkshopMap"
      );

      for (const workshopId of user.userWorkshopMap || []) {
        await unregisterUserFromWorkshop({ workshopId, userId: user._id });
      }

      for (const familyEntry of user.familyWorkshopMap || []) {
        for (const workshopId of familyEntry.workshops || []) {
          await unregisterFamilyFromWorkshop({
            workshopId,
            parentUserId: user._id,
            familyId: familyEntry.familyMemberId,
          });
        }
      }

      await User.findByIdAndDelete(user._id);
      return res.json({
        success: true,
        message: "המשתמש וכל בני המשפחה המקושרים נמחקו",
      });
    }

    const parent = resolved.userDoc;
    const member = resolved.memberDoc;
    assertOwnershipOrAdmin({ ownerId: parent._id, requester: req.user });

    const mapEntry = (parent.familyWorkshopMap || []).find(
      (entry) => String(entry.familyMemberId) === String(member._id)
    );
    const workshopIds = mapEntry?.workshops || [];
    for (const workshopId of workshopIds) {
      await unregisterFamilyFromWorkshop({
        workshopId,
        parentUserId: parent._id,
        familyId: member._id,
      });
    }

    parent.familyMembers = (parent.familyMembers || []).filter(
      (m) => String(m._id) !== String(member._id)
    );
    parent.familyWorkshopMap = (parent.familyWorkshopMap || []).filter(
      (entry) => String(entry.familyMemberId) !== String(member._id)
    );
    await parent.save();

    return res.json({
      success: true,
      message: "בן המשפחה נמחק והוסר מכל הסדנאות",
    });
  } catch (err) {
    console.error("❌ deleteUser error:", err);
    const status = err.statusCode || 500;
    return res
      .status(status)
      .json({ success: false, message: err.message || "Server error deleting entity" });
  }
};





/* ============================================================
   🔍 Hybrid Search (admin: global, user: own family)
   ============================================================ */

// ---- helpers ----
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const searchableEntityFields = [
  "name",
  "email",
  "phone",
  "city",
  "idNumber",
  "parentName",
  "parentEmail",
  "parentPhone",
  "parentCity",
  "parentIdNumber",
  "relation",
];

const entityMatchesQuery = (entity, normalizedQuery) => {
  if (!normalizedQuery) return true;
  return searchableEntityFields.some((field) => {
    if (!entity[field]) return false;
    const value = normalizeSearchQuery(entity[field]);
    return value.includes(normalizedQuery);
  });
};

const collectEntitiesFromUserDoc = (userDoc, target = []) => {
  const userEntity = buildEntityFromUserDoc(userDoc);
  if (userEntity) target.push(userEntity);
  const members = userDoc?.familyMembers || [];
  for (const member of members) {
    const entity = buildEntityFromFamilyMemberDoc(member, userDoc);
    if (entity) target.push(entity);
  }
  return target;
};

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
            entityKey: 1,
            name: 1, email: 1, phone: 1, idNumber: 1, city: 1,
            role: 1, canCharge: 1, birthDate: 1,
            familyMembers: {
              entityKey: 1, name: 1, email: 1, phone: 1,
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

      const flatEntities = [];
      for (const doc of docs) collectEntitiesFromUserDoc(doc, flatEntities);
      return res.json(flatEntities);
    }

    // ============================================================
    // REGULAR USER — Own Family Only
    // ============================================================
    const me = await User.findById(req.user._id).select(
      "name email phone city birthDate idNumber canCharge familyMembers"
    );
    if (!me) {
      return res.status(404).json({ message: "User not found" });
    }

    const entities = collectEntitiesFromUserDoc(me, []);
    const filtered = entities.filter((entity) => entityMatchesQuery(entity, q));

    console.groupCollapsed("🔎 [searchUsers] REGULAR");
    console.log("user:", req.user._id, "query:", q, "results:", filtered.length);
    console.groupEnd();

    return res.json(filtered);

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
      entityKey: 1,
      name: 1, email: 1, phone: 1, idNumber: 1, city: 1, birthDate: 1,
      role: 1, canCharge: 1,
      "familyMembers.entityKey": 1,
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

    const entities = [];
    for (const userDoc of users) collectEntitiesFromUserDoc(userDoc, entities);

    return res.json(entities);
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
    const entityKey = req.params.id;
    const requester = req.user;

    if (!requester?._id) return res.status(401).json({ message: "Unauthorized" });

    const resolved = await resolveEntityByKey(entityKey);
    if (!resolved) return res.status(404).json({ message: "User not found" });

    if (resolved.type === "user") {
      assertOwnershipOrAdmin({ ownerId: resolved.userDoc._id, requester });
      return res.json(sanitizeUserForResponse(resolved.userDoc, requester));
    }

    assertOwnershipOrAdmin({ ownerId: resolved.userDoc._id, requester });
    const entity = buildEntityFromFamilyMemberDoc(resolved.memberDoc, resolved.userDoc);
    return res.json(entity);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching user" });
  }
};

/* ============================================================
   🟢 Unified: getEntityById (user OR family member)
   ============================================================ */
exports.getEntityById = async (req, res) => {
  try {
    const entityKey = req.params.id;
    const requester = req.user;
    if (!requester?._id) return res.status(401).json({ message: "Unauthorized" });

    const resolved = await resolveEntityByKey(entityKey);
    if (!resolved) return res.status(404).json({ message: "Entity not found" });

    if (resolved.type === "user") {
      assertOwnershipOrAdmin({ ownerId: resolved.userDoc._id, requester });
      const entity = buildEntityFromUserDoc(resolved.userDoc);
      return res.json(entity);
    }

    assertOwnershipOrAdmin({ ownerId: resolved.userDoc._id, requester });
    const entity = buildEntityFromFamilyMemberDoc(resolved.memberDoc, resolved.userDoc);
    return res.json(entity);
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
    rejectForbiddenFields(req.body);
    const { entityKey, updates } = req.body;
    const requester = req.user;
    const isAdmin = requester?.role === "admin";

    if (!entityKey) return res.status(400).json({ message: "Missing entityKey" });
    if (!updates || typeof updates !== "object")
      return res.status(400).json({ message: "Missing updates payload" });

    const resolved = await resolveEntityByKey(entityKey);
    if (!resolved) return res.status(404).json({ message: "Entity not found" });

    const baseAllowedKeys = ["name", "phone", "city", "email"];
    const userAllowed = [...baseAllowedKeys, "birthDate", "idNumber"];
    const adminOnlyKeys = ["canCharge", "role"];
    const userAllowedFields = isAdmin ? [...userAllowed, ...adminOnlyKeys] : userAllowed;
    const familyAllowed = [...baseAllowedKeys, "relation", "birthDate", "idNumber"];

    if (resolved.type === "user") {
      assertOwnershipOrAdmin({ ownerId: resolved.userDoc._id, requester });

      const requestedKeys = Object.keys(updates || {});
      const invalidKeys = requestedKeys.filter((key) => !userAllowedFields.includes(key));
      if (invalidKeys.length) {
        return res
          .status(403)
          .json({ message: "Some fields require admin access", fields: invalidKeys });
      }

      for (const key of userAllowedFields) {
        if (updates[key] !== undefined) resolved.userDoc[key] = updates[key];
      }
      await resolved.userDoc.save();
      return res.json({
        success: true,
        message: "User updated successfully",
        user: sanitizeUserForResponse(resolved.userDoc, requester),
      });
    }

    const requestedKeys = Object.keys(updates || {});
    const invalidKeys = requestedKeys.filter((key) => !familyAllowed.includes(key));
    if (invalidKeys.length) {
      return res
        .status(400)
        .json({ message: "Invalid fields for family member", fields: invalidKeys });
    }

    assertOwnershipOrAdmin({ ownerId: resolved.userDoc._id, requester });
    const member = resolved.memberDoc;
    for (const key of familyAllowed) {
      if (updates[key] !== undefined) member[key] = updates[key];
    }

    await resolved.userDoc.save();

    await Workshop.updateMany(
      { "familyRegistrations.familyMemberId": member._id },
      {
        $set: {
          "familyRegistrations.$[f].name": member.name,
          "familyRegistrations.$[f].relation": member.relation,
          "familyRegistrations.$[f].idNumber": member.idNumber,
          "familyRegistrations.$[f].phone": member.phone || resolved.userDoc.phone,
          "familyRegistrations.$[f].birthDate": member.birthDate,
          "familyRegistrations.$[f].city": member.city,
          "familyRegistrations.$[f].parentEmail": resolved.userDoc.email,
        },
      },
      {
        arrayFilters: [{ "f.familyMemberId": member._id }],
      }
    );

    return res.json({
      success: true,
      message: "Family member updated successfully (synced)",
      user: sanitizeUserForResponse(resolved.userDoc, requester),
    });
  } catch (err) {
    console.error("❌ [updateEntity] Error:", err);
    const status = err.statusCode || 500;
    res
      .status(status)
      .json({ message: err.message || "Server error updating entity" });
  }
};


/* ============================================================
   🧾 Get workshops per user or family member (Stable version)
   ============================================================ */
exports.getUserWorkshopsList = async (req, res) => {
  try {
    rejectForbiddenFields(req.query);

    const { id } = req.params; // parent entityKey
    const familyEntityKey = req.query.familyEntityKey || null;

    const resolvedParent = await resolveEntityByKey(id);
    if (!resolvedParent || resolvedParent.type !== "user") {
      return res.status(404).json({ message: "User not found" });
    }

    assertOwnershipOrAdmin({ ownerId: resolvedParent.userDoc._id, requester: req.user });

    const parentUser = resolvedParent.userDoc;
    const parentId = parentUser._id;
    const summaries = [];

    const memberById = new Map(
      (parentUser.familyMembers || []).map((member) => [String(member._id), member])
    );
    const memberByKey = new Map(
      (parentUser.familyMembers || []).map((member) => [String(member.entityKey), member])
    );

    if (!familyEntityKey) {
      const workshops = await Workshop.find({
        $or: [
          { participants: parentId },
          { "familyRegistrations.parentUser": parentId },
        ],
      }).select("title coach day hour participants familyRegistrations workshopKey");

      workshops.forEach((w) => {
        if ((w.participants || []).map(String).includes(String(parentId))) {
          summaries.push({
            workshopKey: w.workshopKey || null,
            title: w.title,
            coach: w.coach,
            day: w.day,
            hour: w.hour,
            relation: "self",
            entityKey: parentUser.entityKey,
          });
        }

        (w.familyRegistrations || []).forEach((fr) => {
          if (String(fr.parentUser) !== String(parentId)) return;
          const member = memberById.get(String(fr.familyMemberId));
          summaries.push({
            workshopKey: w.workshopKey || null,
            title: w.title,
            coach: w.coach,
            day: w.day,
            hour: w.hour,
            relation: `${fr.name || ""}${fr.relation ? ` (${fr.relation})` : ""}`,
            familyMemberKey: member?.entityKey || null,
            parentKey: parentUser.entityKey,
          });
        });
      });
      return res.json(summaries);
    }

    const member = memberByKey.get(String(familyEntityKey));
    if (!member) {
      return res.status(404).json({ message: "Family member not found" });
    }

    const workshopsForFamily = await Workshop.find({
      "familyRegistrations.parentUser": parentId,
      "familyRegistrations.familyMemberId": member._id,
    }).select("title coach day hour familyRegistrations workshopKey");

    workshopsForFamily.forEach((w) => {
      summaries.push({
        workshopKey: w.workshopKey || null,
        title: w.title,
        coach: w.coach,
        day: w.day,
        hour: w.hour,
        relation: `${member.name || ""}${member.relation ? ` (${member.relation})` : ""}`,
        familyMemberKey: member.entityKey || null,
        parentKey: parentUser.entityKey,
      });
    });
    return res.json(summaries);
  } catch (err) {
    console.error("❌ getUserWorkshopsList error:", err);
    res
      .status(500)
      .json({ message: "Server error fetching workshops list", error: err.message });
  }
};

