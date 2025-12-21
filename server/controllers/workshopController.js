const jwt = require("jsonwebtoken");
const Workshop = require("../models/Workshop");
const User = require("../models/User");
const ExcelJS = require('exceljs');
const emailService = require('../services/emailService');
const {
  unregisterUserFromWorkshop,
  unregisterFamilyFromWorkshop,
  registerFamilyToWorkshop,
  registerUserToWorkshop,
} = require("../services/workshopRegistration");
const mongoose = require("mongoose");
const { Resend } = require("resend");
const fs = require("fs");
const path = require("path");
const { safeFetch } = require("../utils/safeFetch");
const { hashId } = require("../utils/hashId");
const fallbackCities = require("../config/fallbackCities.json");
const {
  hydrateFamilyMember,
  hydrateParentFields,
} = require("../services/entities/hydration");
const { resolveEntityByKey } = require("../services/entities/resolveEntity");
const { normalizeEntity } = require("../services/entities/normalize");

/**
 * API + frontend consumer matrix (keep aligned with client WorkshopContext):
 * - GET /api/workshops (getAllWorkshops)
 *   • Consumed by WorkshopContext.fetchAllWorkshops → MyWorkshops + Workshops calendars.
 * - GET /api/workshops/registered (getRegisteredWorkshops)
 *   • Used by WorkshopContext.fetchRegisteredWorkshops for registration badges.
 * - POST /api/workshops/:id/register-entity (registerEntityToWorkshop)
 *   • Triggered from WorkshopContext.registerEntityToWorkshop via WorkshopCard/calendar actions.
 * - DELETE /api/workshops/:id/unregister-entity (unregisterEntityFromWorkshop)
 *   • Triggered from WorkshopContext.unregisterEntityFromWorkshop for toggling participation.
 * - POST /api/workshops/:id/waitlist-entity (addEntityToWaitlist)
 *   • Called from WorkshopContext.registerToWaitlist when a user opts into the waitlist.
 * - DELETE /api/workshops/:id/waitlist-entity (removeEntityFromWaitlist)
 *   • Called from WorkshopContext.unregisterFromWaitlist when removing from waitlist.
 * - GET /api/workshops/meta/cities (getAvailableCities)
 *   • Fills filter dropdowns in Workshops search.
 * - POST /api/workshops (createWorkshop) + PUT/DELETE /api/workshops/:id
 *   • Admin-only actions surfaced in Workshop management tools (e.g., admin modals).
 * - POST /api/workshops/:id/export (exportWorkshopExcel)
 *   • Invoked from admin export UI; ensure responses avoid sensitive logging on failure.
 */

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
 * Resolve any workshop identifier (ObjectId / hashed / workshopKey)
 * → Always returns null because raw ObjectIds are not accepted from clients.
 */
function resolveWorkshopObjectId() {
  return null;
}

exports.resolveWorkshopObjectId = resolveWorkshopObjectId;
const ensureHashedWorkshop = (workshop) => {
  if (!workshop) return null;

  const obj = workshop.toObject ? workshop.toObject() : { ...workshop };

  const hashed =
    obj.hashedId || (obj._id ? hashId("workshop", obj._id.toString()) : null);
  if (hashed) {
    obj.hashedId = hashed;
    obj.workshopKey = obj.workshopKey || hashed;
    obj.mongoId = obj._id ? obj._id.toString() : undefined;

    // 🔥 override external _id to always be hashed for the client
    obj._id = hashed;
  }

  return obj;
};

async function loadWorkshopByIdentifier(identifier) {
  if (!identifier) return null;
  const id = String(identifier).trim();

  // 🔒 STRICT: Only allow lookup by public keys (hashedId or workshopKey)
  // We explicitly do NOT check _id here to prevent enumeration or direct object access.
  const candidates = [
    { hashedId: id },
    { workshopKey: id },
  ];

  return Workshop.findOne({ $or: candidates });
}

exports.loadWorkshopByIdentifier = loadWorkshopByIdentifier;



const findWorkshopByKey = async (workshopKey) => {
  if (!workshopKey) return null;
  return loadWorkshopByIdentifier(workshopKey);
};


const normalizeEntityKey = (entity) => {
  if (!entity) return null;
  if (typeof entity === "string") return entity;
  if (entity.entityKey) return entity.entityKey;
  return null;
};

const formatRegistration = ({ workshop, role = "user", includeSensitive = false }) => {
  // Always ensure the workshop carries a stable hashed id + workshopKey
  const w = ensureHashedWorkshop(workshop) || {};

  const isAdmin = includeSensitive || role === "admin";

  // hashed ID (hashedId is guaranteed by ensureHashedWorkshop)
  const hashedId = w.hashedId || "";

  // owner key
  const ownerKey = normalizeEntityKey(w.__ownerKey);

  // Participants: populated user objects → extract entityKey
  const participants = (w.participants || [])
    .map(u => normalizeEntityKey(u.entityKey || u))
    .filter(Boolean);

  // Family registrations
  const familyRegistrations = (w.familyRegistrations || []).map(fr => {
    const parentKey = normalizeEntityKey(fr.parentUser?.entityKey || fr.parentKey);
    const memberKey = normalizeEntityKey(fr.familyMemberId?.entityKey || fr.familyMemberKey);

    return {
      entityKey: memberKey || parentKey || null,
      parentKey,
      familyMemberKey: memberKey,
      name: fr.familyMemberId?.name || fr.name || "",
      relation: fr.familyMemberId?.relation || fr.relation || "",
    };
  });

  // Waiting list
  const waitingList = (w.waitingList || []).map(w => {
    const parentKey = normalizeEntityKey(w.parentUser?.entityKey || w.parentKey);
    const memberKey = normalizeEntityKey(w.familyMemberId?.entityKey || w.familyMemberKey);

    const base = {
      entityKey: memberKey || parentKey || null,
      parentKey,
      familyMemberKey: memberKey,
      name: w.familyMemberId?.name || w.name,
      relation: w.familyMemberId?.relation || w.relation || "",
    };

    if (!isAdmin) return base;

    return {
      ...base,
      phone: w.phone || w.familyMemberId?.phone || w.parentUser?.phone || "",
      idNumber: w.idNumber || w.familyMemberId?.idNumber || "",
      birthDate: w.birthDate || w.familyMemberId?.birthDate || null,
      email: w.email || w.familyMemberId?.email || w.parentUser?.email || "",
      city: w.city || w.familyMemberId?.city || w.parentUser?.city || "",
    };
  });

  // find user family registrations
  const familyKeysForUser = familyRegistrations
    .filter(fr => fr.parentKey && ownerKey === fr.parentKey)
    .map(fr => fr.familyMemberKey)
    .filter(Boolean);

  const isUserRegistered =
    participants.includes(ownerKey) || familyKeysForUser.length > 0;

  const isUserInWaitlist = waitingList.some(
    wl => wl.parentKey === ownerKey && !wl.familyMemberKey
  );

  const familyMembersInWaitlist = waitingList
    .filter(wl => wl.parentKey === ownerKey && wl.familyMemberKey)
    .map(wl => wl.familyMemberKey);

  return {
    _id: hashedId,
    hashedId,
    workshopKey: w.workshopKey || hashedId,
    mongoId: w.mongoId,

    title: w.title,
    type: w.type,
    description: w.description,
    ageGroup: w.ageGroup,
    coach: w.coach,
    city: w.city,
    address: w.address,
    studio: w.studio,
    startDate: w.startDate,
    endDate: w.endDate,
    inactiveDates: w.inactiveDates,
    startTime: w.startTime,
    time: w.time,
    durationMinutes: w.durationMinutes,
    days: w.days,
    hour: w.hour,
    price: w.price,
    image: w.image,
    available: w.available,
    maxParticipants: w.maxParticipants,
    waitingListMax: w.waitingListMax,
    sessionsCount: w.sessionsCount,

    participants,
    familyRegistrations,
    userFamilyRegistrations: familyKeysForUser,
    waitingList,
    isUserRegistered,
    isUserInWaitlist,
    familyMembersInWaitlist,

    participantsCount:
      w.participantsCount ??
      participants.length + familyRegistrations.length,
  };
};
exports.formatRegistration = formatRegistration;


/* ============================================================
   🔍 Workshop Search Helpers
   ============================================================ */


// Normalize the search query: lowercase, trim and remove unwanted chars
function normalizeWorkshopQuery(q) {
  return String(q || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w@.\s\u0590-\u05FF]/g, "");
}

const pickValue = (value, fallback = "") =>
  value !== undefined && value !== null && value !== "" ? value : fallback;

function buildRegistrationEntry({ parentUser, memberDoc = null }) {
  if (!parentUser) throw new Error("Parent user is required");

  const parent = hydrateParentFields(parentUser);
  const base = {
    parentUser: parentUser._id,
    parentKey: parent.entityKey || String(parentUser._id || ""),
    name: pickValue(parent.name, parentUser.name || ""),
    relation: "self",
    idNumber: pickValue(parent.idNumber),
    phone: pickValue(parent.phone),
    birthDate: pickValue(parent.birthDate),
  };

  if (!memberDoc) {
    return base;
  }

  const hydrated = hydrateFamilyMember(memberDoc, parentUser);
  return {
    parentUser: parentUser._id,
    familyMemberId: memberDoc._id,
    parentKey: parent.entityKey || String(parentUser._id || ""),
    familyMemberKey: hydrated.entityKey || String(memberDoc._id || ""),
    name: pickValue(hydrated.name, pickValue(memberDoc.name, base.name)),
    relation: pickValue(hydrated.relation, pickValue(memberDoc.relation, "")),
    idNumber: pickValue(
      hydrated.idNumber,
      pickValue(memberDoc.idNumber, pickValue(parent.idNumber, base.idNumber))
    ),
    phone: pickValue(
      hydrated.phone,
      pickValue(memberDoc.phone, pickValue(parent.phone, base.phone))
    ),
    birthDate: pickValue(
      hydrated.birthDate,
      pickValue(memberDoc.birthDate, pickValue(parent.birthDate, base.birthDate))
    ),
  };
}
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
          parentKey: entry.parentKey || "",
          familyMemberKey: entry.familyMemberKey || "",
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
  }
}



// controllers/workshopController.js
const escapeRegex = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const clampLimit = (value, fallback = 10, max = 100) => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};
const clampSkip = (value = 0) => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return parsed;
};

// 🚀 NEW getAllWorkshops — full waitlist-aware version
exports.getAllWorkshops = async (req, res) => {
  try {
    await attachUserIfPresent(req);
    const ownerKey = req.user?.entityKey || null;
    const requesterRole = req.user?.role || "user";
    const limit = clampLimit(req.query.limit, 10, 100);
    const skip = clampSkip(req.query.skip);

    const [workshops, total] = await Promise.all([
      Workshop.find({})
        .sort({ startDate: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(
  "participants",
  "entityKey name email phone city birthDate idNumber"
)
.populate(
  "familyRegistrations.familyMemberId",
  "entityKey name relation phone city birthDate idNumber"
)
.populate(
  "familyRegistrations.parentUser",
  "entityKey name email phone city birthDate idNumber"
)
.populate(
  "waitingList.parentUser",
  "entityKey name email phone city birthDate idNumber"
)
.populate(
  "waitingList.familyMemberId",
  "entityKey name relation phone city birthDate idNumber"
)
        .lean(false),
      Workshop.countDocuments({}),
    ]);

    const result = workshops.map((w) => {
      const decorated = w.toObject();
      decorated.__ownerKey = ownerKey;
      return formatRegistration({
        workshop: decorated,
        role: requesterRole,
        includeSensitive: requesterRole === "admin",
      });
    });

    const nextSkip = skip + workshops.length;
    const hasMore = nextSkip < total;

    return res.status(200).json({
      data: result,
      meta: {
        total,
        limit,
        skip,
        nextSkip,
        hasMore,
      },
    });
  } catch (err) {
    console.error("❌ getAllWorkshops error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
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
      "_id hashedId"
    );
    const ids = list.map((w) =>
      w.hashedId || hashId("workshop", w._id.toString())
    );
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
/**
 * @desc Get a single workshop by ID (populated & lean)
 * @route GET /api/workshops/:id
 * @access Authenticated (admin or user)
 */
exports.getWorkshopById = async (req, res) => {
  try {
    await attachUserIfPresent(req);
    const { id } = req.params;

    /* -------------------------------------------------
       1️⃣ Load workshop by ANY identifier
       ------------------------------------------------- */
    let workshopDoc = await loadWorkshopByIdentifier(id);
    if (!workshopDoc) {
      return res.status(404).json({ message: "Workshop not found" });
    }

    /* -------------------------------------------------
       3️⃣ Reload clean document (ALWAYS re-fetch)
       ------------------------------------------------- */
    workshopDoc = await Workshop.findById(workshopDoc._id)
      .populate("participants", "entityKey name email idNumber phone city")
      .populate("familyRegistrations.parentUser", "entityKey name email idNumber phone city")
      .populate("familyRegistrations.familyMemberId", "entityKey name relation idNumber phone birthDate city")
      .populate("waitingList.parentUser", "entityKey name email phone")
      .populate("waitingList.familyMemberId", "entityKey name relation");

    if (!workshopDoc) {
      return res.status(404).json({ message: "Workshop not found" });
    }

    const workshop = workshopDoc.toObject();

    /* -------------------------------------------------
       4️⃣ Add hashed keys
       ------------------------------------------------- */
    const hashed = ensureHashedWorkshop({
      ...workshop,
      __ownerKey: req.user?.entityKey || null,
    });

    /* -------------------------------------------------
       5️⃣ NORMALIZE waitingList
       ------------------------------------------------- */
    if (Array.isArray(hashed.waitingList)) {
      hashed.waitingList = hashed.waitingList.map(w => ({
        parentKey: w.parentUser?._id
          ? String(w.parentUser._id)
          : String(w.parentKey || ""),

        familyMemberKey: w.familyMemberId?._id
          ? String(w.familyMemberId._id)
          : (w.familyMemberKey ? String(w.familyMemberKey) : null),

        name: w.familyMemberId?.name || w.name || "",
        relation: w.familyMemberId?.relation || w.relation || "",
      }));
    }

    /* -------------------------------------------------
       6️⃣ NORMALIZE familyRegistrations
       ------------------------------------------------- */
    if (Array.isArray(hashed.familyRegistrations)) {
      hashed.familyRegistrations = hashed.familyRegistrations.map(fr => ({
        parentKey: fr.parentUser?._id
          ? String(fr.parentUser._id)
          : String(fr.parentKey || ""),

        familyMemberKey: fr.familyMemberId?._id
          ? String(fr.familyMemberId._id)
          : (fr.familyMemberKey ? String(fr.familyMemberKey) : null),

        name: fr.familyMemberId?.name || fr.name || "",
        relation: fr.familyMemberId?.relation || fr.relation || "",
      }));
    }

    /* -------------------------------------------------
       7️⃣ NORMALIZE participants
       ------------------------------------------------- */
    if (Array.isArray(hashed.participants)) {
      hashed.participants = hashed.participants.map(p =>
        typeof p === "object" && p?._id ? String(p._id) : String(p)
      );
    }

    /* -------------------------------------------------
       8️⃣ Compose final response
       ------------------------------------------------- */
    const normalized = {
      ...hashed,
      address: hashed.address || "",
      city: hashed.city || "",
      studio: hashed.studio || "",
      coach: hashed.coach || "",
      participantsCount:
        hashed.participantsCount ??
        ((hashed.participants?.length || 0) +
        (hashed.familyRegistrations?.length || 0)),
      meta: {
        totalParticipants:
          (hashed.participants?.length || 0) +
          (hashed.familyRegistrations?.length || 0),
        waitingListCount: hashed.waitingList?.length || 0,
        isAvailable: !!hashed.available,
      },
    };

    return res.json({ success: true, data: normalized });

  } catch (err) {
    console.error("❌ [getWorkshopById] Error:", err.message);
    return res.status(500).json({ message: "Server error fetching workshop" });
  }
};



/* ------------------------------------------------------------
   🟡 POST /api/workshops  (Admin)
   ------------------------------------------------------------
   Creates a new workshop with support for:
   - Multiple meeting days (days[])
   - sessionsCount replacing weeksDuration
   - Auto-calculated endDate based on sessionsCount & startDate
   - Optional inactiveDates (holidays)
------------------------------------------------------------ */
/**
 * @desc Update a workshop (with auto endDate + safe address validation)
 * @route PUT /api/workshops/:id
 * @access Admin only
  */
exports.updateWorkshop = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Strict Lookup (Returns 404 if id is not a valid hashedId/key)
    const existing = await loadWorkshopByIdentifier(id);
    if (!existing) {
      return res.status(404).json({ message: "Workshop not found" });
    }

    /* ============================================================
       🧩 Define allowed fields for update
       ============================================================ */
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

    /* ============================================================
       🌍 Address validation (Soft / Non-blocking)
       ============================================================ */
    // We removed the "return 400" block here.
    // If city or address is missing, we just skip the OSM check and save anyway.
    if ("city" in updates || "address" in updates) {
      const city = updates.city ?? existing.city;
      const address = updates.address ?? existing.address;

      if (city && address) {
        const checkAddress = async () => {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2500);
            const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
              city
            )}&street=${encodeURIComponent(address)}&country=Israel&format=json`;

            const resp = await fetch(url, {
              signal: controller.signal,
              headers: { "User-Agent": "Clalit-Workshops-App" },
            });
            clearTimeout(timeout);
            const result = await resp.json();

            if (!Array.isArray(result) || result.length === 0) {
              console.warn(`⚠ Address warning: "${address}" in "${city}" not found on OSM.`);
            }
          } catch (err) {
            console.warn("⚠ Address validation service unavailable — skipping check");
          }
        };
        checkAddress().catch(() => {});
      }
    }

    /* ============================================================
       🗓 Days + inactiveDates normalization
       ============================================================ */
    const daysMap = {
      ראשון: "Sunday",
      שני: "Monday",
      שלישי: "Tuesday",
      רביעי: "Wednesday",
      חמישי: "Thursday",
      שישי: "Friday",
      שבת: "Saturday",
    };

    if (updates.days) {
      updates.days = Array.isArray(updates.days) ? updates.days : [updates.days];
      updates.days = updates.days
        .map((d) => daysMap[d] || d)
        .filter((d) =>
          ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].includes(d)
        );
    }

    if (updates.inactiveDates) {
      updates.inactiveDates = Array.isArray(updates.inactiveDates)
        ? updates.inactiveDates
        : [updates.inactiveDates];
      updates.inactiveDates = updates.inactiveDates
        .map((d) => new Date(d))
        .filter((d) => !isNaN(d.getTime()));
    }

    if (updates.sessionsCount && isNaN(updates.sessionsCount)) {
      return res.status(400).json({ message: "sessionsCount must be numeric" });
    }

    /* ============================================================
       💾 Apply update and re-run schema hooks (for endDate)
       ============================================================ */
    Object.assign(existing, updates);

    // Force recalculation of endDate if key fields changed
    if ("startDate" in updates || "days" in updates || "sessionsCount" in updates) {
      existing.markModified("startDate");
      existing.markModified("days");
      existing.markModified("sessionsCount");
    }

    await existing.save();

    /* ============================================================
       📦 Reload normalized + populated data
       ============================================================ */
    // We reload the document to make sure we return the freshest data (including virtuals/endDate)
    const ws = await Workshop.findById(existing._id)
      .populate("participants", "name email idNumber phone city")
      .populate("familyRegistrations.parentUser", "name email idNumber phone city")
      .populate("familyRegistrations.familyMemberId", "name relation idNumber phone birthDate city")
      .populate("waitingList.parentUser", "name email")
      .lean();

    const normalizedSource = ensureHashedWorkshop(ws);
    const normalized = {
      ...normalizedSource,
      address: normalizedSource?.address || "",
      city: normalizedSource?.city || "",
      studio: normalizedSource?.studio || "",
      coach: normalizedSource?.coach || "",
    };

    const meta = {
      totalParticipants:
        (ws?.participants?.length || 0) + (ws?.familyRegistrations?.length || 0),
      waitingListCount: ws?.waitingList?.length || 0,
      available: !!ws?.available,
    };

    console.info("✅ Workshop updated", {
      id: String(ws._id),
      startDate: ws.startDate,
      endDate: ws.endDate,
    });

    return res.json({
      success: true,
      message: "Workshop updated successfully",
      data: normalized,
      meta,
    });
  } catch (err) {
    console.error("❌ [updateWorkshop] Error:", err);
    return res.status(500).json({
      message: err.message || "Failed to update workshop",
    });
  }
};



/**
 * @desc Create a new workshop (with non-blocking address validation)
 * @route POST /api/workshops
 * @access Admin only
 */
exports.createWorkshop = async (req, res) => {
  try {
    const data = { ...req.body };

    // 🧩 Required field check
    if (!data.city || !data.address) {
      return res.status(400).json({ message: "City and address are required" });
    }

    /* ============================================================
       🌍 Soft address validation — non-blocking (Promise.race)
       ============================================================ */
    const validateAddress = async () => {
      const validationUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
        data.city
      )}&street=${encodeURIComponent(data.address)}&country=Israel&format=json`;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);

        const response = await fetch(validationUrl, {
          signal: controller.signal,
          headers: { "User-Agent": "Clalit-Workshops-App" },
        });
        clearTimeout(timeout);

        const validationData = await response.json();
        if (!Array.isArray(validationData) || validationData.length === 0) {
          console.warn(`⚠ Address not found in ${data.city} — saving anyway.`);
        }
      } catch (err) {
        console.warn(`⚠ Address validation skipped: ${err.message}`);
      }
    };

    // Fire without blocking save
    validateAddress().catch(() => {});

    /* ============================================================
       🧮 Days normalization
       ============================================================ */
    const daysMap = {
      ראשון: "Sunday",
      שני: "Monday",
      שלישי: "Tuesday",
      רביעי: "Wednesday",
      חמישי: "Thursday",
      שישי: "Friday",
      שבת: "Saturday",
    };

    if (!Array.isArray(data.days)) data.days = data.days ? [data.days] : [];
    data.days = data.days
      .map((d) => daysMap[d] || d)
      .filter((d) =>
        ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].includes(d)
      );

    if (data.days.length === 0) {
      return res.status(400).json({ message: "At least one valid day is required" });
    }

    /* ============================================================
       🗓 Validate core session info
       ============================================================ */
    if (!data.startDate) {
      return res.status(400).json({ message: "startDate is required" });
    }

    data.startDate = new Date(data.startDate);
    if (isNaN(data.startDate.getTime())) {
      return res.status(400).json({ message: "Invalid startDate" });
    }

    const count = parseInt(data.sessionsCount, 10);
    if (isNaN(count) || count < 1) {
      return res.status(400).json({ message: "sessionsCount must be a positive number" });
    }
    data.sessionsCount = count;

    /* ============================================================
       💤 Normalize inactive dates
       ============================================================ */
    if (!Array.isArray(data.inactiveDates)) {
      data.inactiveDates = data.inactiveDates ? [data.inactiveDates] : [];
    }
    data.inactiveDates = data.inactiveDates
      .map((d) => new Date(d))
      .filter((d) => !isNaN(d.getTime()));

    /* ============================================================
       💾 Save + auto endDate (triggered by schema pre('save'))
       ============================================================ */
    const ws = await Workshop.create(data);

    /* ============================================================
       📦 Normalize & respond
       ============================================================ */
    const normalizedSource = ensureHashedWorkshop(ws);
    const normalized = {
      ...normalizedSource,
      address: normalizedSource?.address || "",
      city: normalizedSource?.city || "",
      studio: normalizedSource?.studio || "",
      coach: normalizedSource?.coach || "",
    };

    const meta = {
      totalParticipants:
        (ws.participants?.length || 0) + (ws.familyRegistrations?.length || 0),
      waitingListCount: ws.waitingList?.length || 0,
      available: !!ws.available,
    };

    console.info("✅ Workshop created", {
      id: String(ws._id),
      startDate: ws.startDate,
      endDate: ws.endDate,
    });

    return res.status(201).json({ success: true, data: normalized, meta });
  } catch (err) {
    console.error("❌ [createWorkshop] Error:", err);
    return res
      .status(500)
      .json({ message: err.message || "Failed to create workshop" });
  }
};


/* ------------------------------------------------------------
   🔴 DELETE /api/workshops/:id
------------------------------------------------------------ */
exports.deleteWorkshop = async (req, res) => {
  try {
    const workshopDoc = await loadWorkshopByIdentifier(req.params.id);
    if (!workshopDoc) {
      return res.status(404).json({ message: "Workshop not found" });
    }

    const ws = await Workshop.findByIdAndDelete(workshopDoc._id);
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
    const workshopDoc = await loadWorkshopByIdentifier(req.params.id);
    if (!workshopDoc) {
      return res.status(404).json({ message: "Workshop not found" });
    }

    const workshop = await Workshop.findById(workshopDoc._id)
      .populate("participants", "name email phone city birthDate idNumber canCharge")
      .populate("familyRegistrations.parentUser", "name email phone city canCharge _id")
      .populate("familyRegistrations.familyMemberId", "name relation idNumber phone birthDate email city _id")
      .populate("waitingList.parentUser", "name email phone")
      .populate("waitingList.familyMemberId", "name relation")
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
        phone: f.phone || parent.phone || "",
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
/**
 * registerEntityToWorkshop
 * --------------------------------------------------------------------------
 * Registers either a user or one of their family members to a workshop.
 * - Adds to waiting list if full.
 * - Syncs User.userWorkshopMap / User.familyWorkshopMap.
 * - Uses shared services for consistency.
 */
exports.registerEntityToWorkshop = async (req, res) => {
  try {
    rejectForbiddenFields(req.body);

    const workshopKey = req.params.id;
    const targetEntityKey = req.body?.entityKey || req.user?.entityKey;

    // Load workshop
    const workshop = await loadWorkshopByIdentifier(workshopKey);
    if (!workshop)
      return res.status(404).json({ message: "Workshop not found" });

    // Resolve entity
    const resolved = await resolveEntityByKey(targetEntityKey);
    if (!resolved)
      return res.status(404).json({ success: false, message: "Entity not found" });

    const parentUser = resolved.userDoc;
    const member = resolved.type === "familyMember" ? resolved.memberDoc : null;

    assertOwnershipOrAdmin({ ownerId: parentUser._id, requester: req.user });

    const parentId = parentUser._id;
    const memberId = member?._id || null;

    // Duplicate check
    const alreadyRegistered = member
      ? workshop.familyRegistrations.some(
          (r) =>
            String(r.familyMemberId) === String(memberId) &&
            String(r.parentUser) === String(parentId)
        )
      : workshop.participants.some((p) => String(p) === String(parentId));

    const alreadyQueued = (workshop.waitingList || []).some((w) => {
      const sameParent = String(w.parentUser) === String(parentId);
      if (member) {
        return sameParent && String(w.familyMemberId) === String(memberId);
      }
      return sameParent && !w.familyMemberId;
    });

    if (alreadyRegistered)
      return res
        .status(400)
        .json({ success: false, message: "Entity already registered" });

    if (alreadyQueued)
      return res
        .status(400)
        .json({ success: false, message: "Entity already in waiting list" });

    // Capacity check
    const hasSpace = workshop.canAddParticipant();
    const waitingFull =
      workshop.waitingListMax > 0 &&
      workshop.waitingList.length >= workshop.waitingListMax;

    // If full → go to canonical waitlist
    if (!hasSpace) {
      if (waitingFull) {
        return res.status(400).json({
          success: false,
          message: "Workshop is full and waiting list is full",
        });
      }

      // call unified waitlist logic
      return exports.addEntityToWaitlist(req, res);
    }

    // ===== NORMAL REGISTRATION =====
    const workshopObjectId = workshop._id;

    if (member) {
      // FAMILY REGISTRATION
      workshop.familyRegistrations.push({
        parentUser: parentId,
        familyMemberId: memberId,
        parentKey: parentUser.entityKey || String(parentId),
        familyMemberKey: member.entityKey || String(memberId),
        name: member.name,
        relation: member.relation,
        idNumber: member.idNumber,
        phone: member.phone || parentUser.phone,
        birthDate: member.birthDate,
        city: member.city,
      });

      const mapEntry = parentUser.familyWorkshopMap.find(
        (f) => String(f.familyMemberId) === String(memberId)
      );

      if (mapEntry) {
        if (
          !mapEntry.workshops.some(
            (wid) => String(wid) === String(workshopObjectId)
          )
        ) {
          mapEntry.workshops.push(workshopObjectId);
        }
      } else {
        parentUser.familyWorkshopMap.push({
          familyMemberId: member._id,
          workshops: [workshopObjectId],
        });
      }
    } else {
      // DIRECT REGISTRATION
      workshop.participants.push(parentId);

      if (
        !parentUser.userWorkshopMap.some(
          (wid) => String(wid) === String(workshopObjectId)
        )
      ) {
        parentUser.userWorkshopMap.push(workshopObjectId);
      }
    }

    await workshop.save();
    await parentUser.save();

    // repopulate complete workshop
    const populated = await Workshop.findById(workshop._id)
      .populate("participants", "entityKey name")
      .populate(
        "familyRegistrations.familyMemberId",
        "entityKey name relation"
      )
      .populate("familyRegistrations.parentUser", "entityKey name")
      .populate("waitingList.parentUser", "entityKey name")
      .populate("waitingList.familyMemberId", "entityKey name relation");

    const decorated = populated.toObject();
    decorated.__ownerKey = req.user?.entityKey || null;

    return res.json({
      success: true,
      workshop: formatRegistration({
        workshop: decorated,
        role: req.user?.role || "user",
        includeSensitive: req.user?.role === "admin",
      }),
    });
  } catch (err) {
    console.error("🔥 registerEntityToWorkshop error:", err);
    const payload = {
      success: false,
      message: "Server error during registration",
    };
    if (process.env.NODE_ENV !== "production") {
      payload.detail = err.message;
    }
    res.status(500).json(payload);
  }
};


/**
 * unregisterEntityFromWorkshop
 * --------------------------------------------------------------------------
 * Removes either a user or a family member from a workshop.
 * Keeps Workshop and User mappings in sync.
 */
exports.unregisterEntityFromWorkshop = async (req, res) => {
  try {
    rejectForbiddenFields(req.body);

    const workshopKey = req.params.id;
    const targetEntityKey = req.body?.entityKey || req.user?.entityKey;

const workshop = await loadWorkshopByIdentifier(workshopKey);
    if (!workshop) return res.status(404).json({ message: "Workshop not found" });

    const resolved = await resolveEntityByKey(targetEntityKey);
    if (!resolved) return res.status(404).json({ message: "Entity not found" });

    const parentUser = resolved.userDoc;
    const member = resolved.type === "familyMember" ? resolved.memberDoc : null;

    assertOwnershipOrAdmin({ ownerId: parentUser._id, requester: req.user });

    let changed = false;
    const workshopObjectId = workshop._id;

    if (member) {
      const before = workshop.familyRegistrations.length;
      workshop.familyRegistrations = workshop.familyRegistrations.filter(
        (f) =>
          !(
            String(f.familyMemberId) === String(member._id) &&
            String(f.parentUser) === String(parentUser._id)
          )
      );
      changed = before !== workshop.familyRegistrations.length;

      const mapEntry = parentUser.familyWorkshopMap.find(
        (f) => String(f.familyMemberId) === String(member._id)
      );
      if (mapEntry) {
        mapEntry.workshops = mapEntry.workshops.filter(
          (wid) => String(wid) !== String(workshopObjectId)
        );
      }
    } else {
      const before = workshop.participants.length;
      workshop.participants = workshop.participants.filter(
        (u) => String(u) !== String(parentUser._id)
      );
      changed = before !== workshop.participants.length;

      parentUser.userWorkshopMap = parentUser.userWorkshopMap.filter(
        (wid) => String(wid) !== String(workshopObjectId)
      );
    }

    if (changed) {
      workshop.participantsCount =
        (workshop.participants?.length || 0) + (workshop.familyRegistrations?.length || 0);
      await workshop.save();
      await parentUser.save();
    }

    const populated = await Workshop.findById(workshop._id)
      .populate("participants", "entityKey name")
      .populate("familyRegistrations.familyMemberId", "entityKey name relation")
      .populate("familyRegistrations.parentUser", "entityKey name")
      .populate("waitingList.parentUser", "entityKey name")
      .populate("waitingList.familyMemberId", "entityKey name relation");

    const decorated = populated.toObject();
    decorated.__ownerKey = req.user?.entityKey || null;

    return res.json({
      success: true,
      changed,
      message: "Entity unregistered successfully",
      workshop: formatRegistration({
        workshop: decorated,
        role: req.user?.role || "user",
        includeSensitive: req.user?.role === "admin",
      }),
    });
  } catch (err) {
    console.error("❌ unregisterEntityFromWorkshop error:", err);
    res.status(500).json({ success: false, message: "Server error during unregistration" });
  }
};


/**
 * ============================================================
 * WAITLIST REGISTRATION HANDLERS (User + Family)
 * ============================================================
 */

// server/controllers/workshopWaitlistController.js
// Unified canonical waitlist controller
// ✔ Keeps ALL existing behavior
// ✔ Removes duplication
// ✔ Always uses entityKey
// ✔ Always uses canonical entry shape
// ✔ Fully compatible with WorkshopContext expectations
// ✔ Fully replaces: addEntityToWaitlist, removeEntityFromWaitlist, admin /waitlist


/*********************************************************************
 * CANONICAL WAITLIST: ADD ENTITY
 * POST /api/workshops/:id/waitlist-entity
 * This version preserves ALL existing behavior (populate + decorate).
 *********************************************************************/
exports.addEntityToWaitlist = async (req, res) => {
  try {
    rejectForbiddenFields(req.body);

    const { id } = req.params;
    const targetEntityKey = req.body?.entityKey || req.user?.entityKey;

    const workshop = await loadWorkshopByIdentifier(id);
    if (!workshop)
      return res.status(404).json({ success: false, message: "Workshop not found" });

    const resolved = await resolveEntityByKey(targetEntityKey);
    if (!resolved)
      return res.status(404).json({ success: false, message: "Entity not found" });

    const parentUser = resolved.userDoc;
    const member = resolved.type === "familyMember" ? resolved.memberDoc : null;

    assertOwnershipOrAdmin({ ownerId: parentUser._id, requester: req.user });

    const parentId = parentUser._id;
    const memberId = member?._id || null;

    // Duplicate detection (canonical)
    const exists = (workshop.waitingList || []).some((e) => {
      const sameParent = String(e.parentUser) === String(parentId);
      if (member) {
        return sameParent && String(e.familyMemberId) === String(memberId);
      }
      return sameParent && !e.familyMemberId;
    });

    if (exists)
      return res
        .status(400)
        .json({ success: false, message: "Already in waiting list" });

    // check capacity
    if (workshop.waitingListMax > 0 && workshop.waitingList.length >= workshop.waitingListMax) {
      return res.status(400).json({
        success: false,
        message: "Waiting list is full",
      });
    }

    // canonical entry
    const entry = buildRegistrationEntry({
      parentUser,
      memberDoc: member,
    });

    workshop.waitingList.push(entry);
    await workshop.save();

    // repopulate
    const populated = await Workshop.findById(workshop._id)
      .populate("participants", "entityKey name")
      .populate(
        "familyRegistrations.familyMemberId",
        "entityKey name relation"
      )
      .populate("familyRegistrations.parentUser", "entityKey name")
      .populate("waitingList.parentUser", "entityKey name")
      .populate("waitingList.familyMemberId", "entityKey name relation");

    const decorated = populated.toObject();
    decorated.__ownerKey = req.user?.entityKey || null;

    return res.json({
      success: true,
      message: "Added to waiting list successfully",
      position: workshop.waitingList.length,
      workshop: formatRegistration({
        workshop: decorated,
        role: req.user?.role || "user",
        includeSensitive: req.user?.role === "admin",
      }),
    });
  } catch (err) {
    console.error("🔥 addEntityToWaitlist error:", err);
    res.status(500).json({
      success: false,
      message: "Server error adding to waitlist",
    });
  }
};

/*********************************************************************
 * CANONICAL WAITLIST: REMOVE ENTITY
 * DELETE /api/workshops/:id/waitlist-entity
 * Same behavior as existing version + canonical matching.
 *********************************************************************/
exports.removeEntityFromWaitlist = async (req, res) => {
  try {
    rejectForbiddenFields(req.body);

    const { id } = req.params;
    const targetEntityKey = req.body?.entityKey || req.user?.entityKey;

    const workshop = await loadWorkshopByIdentifier(id);
    if (!workshop)
      return res
        .status(404)
        .json({ success: false, message: "Workshop not found" });

    const resolved = await resolveEntityByKey(targetEntityKey);
    if (!resolved)
      return res
        .status(404)
        .json({ success: false, message: "Entity not found in waiting list" });

    const parentUser = resolved.userDoc;
    const member = resolved.type === "familyMember" ? resolved.memberDoc : null;

    assertOwnershipOrAdmin({ ownerId: parentUser._id, requester: req.user });

    const parentId = parentUser._id;
    const memberId = member?._id || null;

    const before = workshop.waitingList.length;

    workshop.waitingList = (workshop.waitingList || []).filter((e) => {
      const sameParent = String(e.parentUser) === String(parentId);
      const sameFamily = member
        ? String(e.familyMemberId) === String(memberId)
        : !e.familyMemberId;
      return !(sameParent && sameFamily);
    });

    if (before === workshop.waitingList.length) {
      return res.status(404).json({
        success: false,
        message: "Entry not found in waiting list",
      });
    }

    await workshop.save();

    const populated = await Workshop.findById(workshop._id)
      .populate("participants", "entityKey name")
      .populate(
        "familyRegistrations.familyMemberId",
        "entityKey name relation"
      )
      .populate("familyRegistrations.parentUser", "entityKey name")
      .populate("waitingList.parentUser", "entityKey name")
      .populate("waitingList.familyMemberId", "entityKey name relation");

    const decorated = populated.toObject();
    decorated.__ownerKey = req.user?.entityKey || null;

    return res.json({
      success: true,
      message: "Removed from waiting list successfully",
      workshop: formatRegistration({
        workshop: decorated,
        role: req.user?.role || "user",
        includeSensitive: req.user?.role === "admin",
      }),
    });
  } catch (err) {
    console.error("🔥 removeEntityFromWaitlist error:", err);
    res.status(500).json({
      success: false,
      message: "Server error removing from waitlist",
    });
  }
};



exports.exportWorkshopExcel = async (req, res) => {
  try {
    const admin = req.user;
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const workshopId = req.params.id;

    // Helpers
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

    // 1. Fetch Data
    // (Assuming loadWorkshopByIdentifier and Workshop model are imported)
    const baseWorkshop = await loadWorkshopByIdentifier(workshopId);
    if (!baseWorkshop) return res.status(404).json({ message: "Workshop not found" });

    const workshopDoc = await Workshop.findById(baseWorkshop._id)
      .populate("participants", "name email phone city birthDate idNumber canCharge")
      .populate("familyRegistrations.parentUser", "name email phone city canCharge")
      .populate("familyRegistrations.familyMemberId", "name relation idNumber phone birthDate")
      .populate("waitingList.parentUser", "name email phone city canCharge")
      .lean();

    if (!workshopDoc) return res.status(404).json({ message: "Workshop not found" });

    // (Assuming ensureHashedWorkshop is available in scope)
    const workshop = ensureHashedWorkshop(workshopDoc);

    // 2. Setup Excel Logic (Preserved from your code)
    const startDate = workshop.startDate ? new Date(workshop.startDate) : new Date(workshop.createdAt);
    const periodDays = Number(workshop.timePeriod) || 30;
    const endDate = new Date(startDate.getTime() + periodDays * 24 * 60 * 60 * 1000);
    const startDateStr = toHebDate(startDate);
    const endDateStr = toHebDate(endDate);

    const exportType = String(req.query.type || "").toLowerCase();
    const includeParticipants = !exportType || exportType === "current";
    const includeWaitlist = !exportType || exportType === "waitlist";

    // Create Workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("דו\"ח משתתפים", { views: [{ rightToLeft: true }] });

    // Define Columns
    sheet.columns = [
      { header: "שם משתתף", key: "p_name", width: 25 },
      { header: "קרבה", key: "p_relation", width: 15 },
      { header: "אימייל", key: "p_email", width: 28 },
      { header: "טלפון", key: "p_phone", width: 16 },
      { header: "תעודת זהות", key: "p_id", width: 16 },
      { header: "תאריך לידה", key: "p_birth", width: 15 },
      { header: "גיל", key: "p_age", width: 8 },
      { header: "ניתן לגבות", key: "p_cancharge", width: 12 },
      { header: "מקור", key: "origin", width: 16 },
    ];

    // Styling
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };

    const addRowRTL = (rowObj) => {
      const r = sheet.addRow(rowObj);
      r.eachCell((cell, colNumber) => {
        const key = sheet.columns[colNumber - 1].key;
        cell.alignment = (key === "p_age" || key === "p_cancharge") 
          ? { horizontal: "center", vertical: "middle" } 
          : { horizontal: "right", vertical: "middle" };
      });
      return r;
    };

    // Populate Participants
    if (includeParticipants) {
      (workshop.participants || []).forEach((p) => {
        addRowRTL({
          p_name: p.name || "", p_relation: "עצמי", p_email: p.email || "",
          p_phone: p.phone || "", p_id: p.idNumber || "", p_birth: toHebDate(p.birthDate),
          p_age: calcAge(p.birthDate), p_cancharge: p.canCharge ? "כן" : "לא", origin: "משתתף",
        });
      });

      (workshop.familyRegistrations || []).forEach((fr) => {
        const fm = fr.familyMemberId || {};
        const parent = fr.parentUser || {};
        addRowRTL({
          p_name: fm.name || fr.name || "", p_relation: fm.relation || fr.relation || "בן משפחה",
          p_email: fm.email || parent.email || "", p_phone: fm.phone || parent.phone || "",
          p_id: fm.idNumber || fr.idNumber || "", p_birth: toHebDate(fm.birthDate || fr.birthDate),
          p_age: calcAge(fm.birthDate || fr.birthDate), p_cancharge: parent.canCharge ? "כן" : "לא", origin: "משתתף",
        });
      });
    }

    // Separator
    if (includeParticipants && includeWaitlist) {
      const sepRowIdx = sheet.lastRow.number + 2;
      sheet.mergeCells(sepRowIdx, 1, sepRowIdx, sheet.columnCount);
      const sep = sheet.getCell(sepRowIdx, 1);
      sep.value = "— רשימת המתנה —";
      sep.alignment = { horizontal: "center", vertical: "middle" };
      sheet.getRow(sepRowIdx).font = { bold: true };
    }

    // Populate Waitlist
    if (includeWaitlist) {
      (workshop.waitingList || []).forEach((wl) => {
        const parent = wl.parentUser || {};
        addRowRTL({
          p_name: wl.name || "", p_relation: wl.relation || (wl.familyMemberId ? "בן משפחה" : "עצמי"),
          p_email: wl.email || parent.email || "", p_phone: wl.phone || parent.phone || "",
          p_id: wl.idNumber || "", p_birth: toHebDate(wl.birthDate),
          p_age: calcAge(wl.birthDate), p_cancharge: parent.canCharge ? "כן" : "לא", origin: "רשימת המתנה",
        });
      });
    }

    // 3. Generate Buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // 4. Prepare Email Content
    const maxCap = Number(workshop.maxParticipants ?? 0);
    const capStr = maxCap === 0 ? "∞" : String(maxCap);
    const currentCount = (workshop.participantsCount ?? ((workshop.participants?.length || 0) + (workshop.familyRegistrations?.length || 0)));
    const waitCount = workshop.waitingList?.length || 0;
    
    const htmlBody = `
      <!doctype html>
      <html dir="rtl" lang="he">
        <body style="direction:rtl;text-align:right;font-family:sans-serif;line-height:1.6;color:#222;">
          <p>שלום ${admin.name},</p>
          <p>להלן דו״ח הסדנה <strong>"${workshop.title || "-"}"</strong>:</p>
          <ul>
            <li>משתתפים רשומים: ${currentCount} מתוך ${capStr}</li>
            <li>רשימת המתנה: ${waitCount}</li>
            <li>תאריך התחלה: ${startDateStr}</li>
          </ul>
          <p>מצורף קובץ אקסל עם הרשימות.</p>
        </body>
      </html>
    `;

    console.log(`📤 Sending Excel report for "${workshop.title}" to ${admin.email}...`);

    // 5. 🔥 Send via Shared Service
    const result = await emailService.sendEmail({
      to: admin.email,
      subject: `📊 דו״ח סדנה — ${workshop.title || ""}`,
      html: htmlBody,
      attachments: [
        {
          filename: `דו״ח משתתפים - ${workshop.title || "export"}.xlsx`,
          content: buffer // Resend SDK handles Buffer objects automatically
        }
      ]
    });

    if (result.success) {
      return res.json({ success: true, message: "Excel sent successfully via Email Service" });
    } else {
      throw new Error(result.error || "Email service returned failure");
    }

  } catch (err) {
    console.error("❌ exportWorkshopExcel error:", err);
    res.status(500).json({ success: false, message: "Error sending report: " + err.message });
  }
};

// ------------------------------------------------------------
// 🟣 GET /api/workshops/:id/waitlist — Admin only
// Returns all waiting list entries for a given workshop
// ------------------------------------------------------------
exports.getWaitlist = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Resolve hashedId/ObjectId
    const workshopDoc = await loadWorkshopByIdentifier(id);

    if (!workshopDoc) {
      return res.status(404).json({ message: "Workshop not found" });
    }

    // 2️⃣ Load lean workshop document
    const workshop = await Workshop.findById(workshopDoc._id).lean().exec();
    if (!workshop) {
      return res.status(404).json({ message: "Workshop not found" });
    }

    // 3️⃣ Resolve each waitlist entry as a FULL ENTITY
    const waitingList = await Promise.all(
      (workshop.waitingList || []).map(async (w) => {
        const key = w.familyMemberKey || w.parentKey;
        if (!key) return null;

        const resolved = await resolveEntityByKey(key);
        if (!resolved) return null;

        // Convert resolved entity to a plain object for normalization
        let flat;
        if (resolved.type === "user") {
          flat = resolved.userDoc._doc || resolved.userDoc;
        } else if (resolved.type === "familyMember") {
          flat = {
            ...(resolved.userDoc._doc || resolved.userDoc),
            ...(resolved.memberDoc._doc || resolved.memberDoc),
            isFamily: true,
          };
        } else {
          return null;
        }

        return normalizeEntity(flat);
      })
    );

    const cleaned = waitingList.filter(Boolean);

    return res.json({
      success: true,
      count: cleaned.length,
      waitingList: cleaned,
    });

  } catch (err) {
    console.error("❌ getWaitlist error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};


   

exports.getAvailableCities = async (req, res) => {
  try {
    const url =
      "https://data.gov.il/api/3/action/datastore_search?resource_id=bb040a11-b8b0-46a9-bc48-63a972df2a5b&limit=5000";
    const response = await safeFetch(url, {
      headers: {
        "User-Agent": "Clalit-Workshops-App",
        Accept: "application/json",
      },
      timeout: 15000,
    });

    if (!response.ok) {
      throw new Error(`data.gov.il responded with status ${response.status}`);
    }

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

    const fallbackList = Array.from(new Set([...(fallbackCities || []), ...southernCities])).sort();

    return res.status(200).json({
      success: true,
      source: "fallback-local",
      count: fallbackList.length,
      cities: fallbackList,
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
    const response = await safeFetch(url, {
      headers: {
        "User-Agent": "Clalit-Workshops-App",
        Accept: "application/json",
      },
      timeout: 15000,
    });

    if (!response.ok) {
      throw new Error(`Nominatim responded with status ${response.status}`);
    }

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

/* ============================================================
   🔍 searchWorkshops — Atlas Compound Search + Fallback
   Mirrors searchUsers for consistent UX & query logic
   ============================================================ */
exports.searchWorkshops = async (req, res) => {
  try {
    // Normalize query
    const raw = (req.query.q || "").trim();
    if (!raw) return res.json([]);
// was: const q = normalizeSearchQuery(raw);
    const q = normalizeWorkshopQuery(raw);
    const escaped = escapeRegex(q);
    const wildcardToken = `*${q}*`;
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || "60", 10) || 60, 200));

    // Filters
    const cityFilter = req.query.city;
    const typeFilter = req.query.type;
    const coachFilter = req.query.coach;
    const dayFilter = req.query.day;
    const hourFilter = req.query.hour;
    const availableParam = req.query.available;
    const ageGroupFilter = req.query.ageGroup;
    const availableFilter =
      availableParam !== undefined
        ? String(availableParam).toLowerCase() === "true"
        : undefined;

    // Clean filter object
    const filterObj = {};
    if (cityFilter) filterObj.city = { $regex: new RegExp(escapeRegex(cityFilter), "i") };
    if (typeFilter) filterObj.type = typeFilter;
    if (coachFilter) filterObj.coach = { $regex: new RegExp(escapeRegex(coachFilter), "i") };
    if (hourFilter) filterObj.hour = { $regex: new RegExp(escapeRegex(hourFilter), "i") };
    if (dayFilter) filterObj.days = dayFilter;
    if (ageGroupFilter) filterObj.ageGroup = ageGroupFilter;
    if (availableFilter !== undefined) filterObj.available = availableFilter;

    // Projection
    const projection = {
      title: 1,
      coach: 1,
      type: 1,
      city: 1,
      days: 1,
      hour: 1,
      ageGroup: 1,
      available: 1,
      image: 1,
      price: 1,
      participantsCount: 1,
      maxParticipants: 1,
      startDate: 1,
      endDate: 1,
    };

    // ----------------------------
    // Atlas Compound Search
    // ----------------------------
    const SEARCH_ANALYZED = ["title", "description", "coach", "city", "type", "studio"];
    const SEARCH_KEYWORD = [
      "title_keyword",
      "description_keyword",
      "coach_keyword",
      "city_keyword",
      "type_keyword",
      "studio_keyword",
    ];

    const pipeline = [
      {
        $search: {
          index: "WorkshopTextIndex",
          compound: {
            should: [
              { text: { query: q, path: SEARCH_ANALYZED } },
              { wildcard: { path: SEARCH_KEYWORD, query: wildcardToken, allowAnalyzedField: true } },
              { text: { query: q, path: SEARCH_ANALYZED, fuzzy: { maxEdits: 1 } } },
              { regex: { path: SEARCH_KEYWORD, query: escaped, allowAnalyzedField: true } },
            ],
            minimumShouldMatch: 1,
          },
        },
      },
      { $match: filterObj },
      { $limit: Math.max(limit * 2, 60) },
      {
        $project: {
          ...projection,
          score: { $meta: "searchScore" },
          highlights: { $meta: "searchHighlights" },
        },
      },
    ];

    let docs = [];
    let clauseUsed = "Atlas compound";
    const start = Date.now();

    try {
      docs = await Workshop.aggregate(pipeline);
    } catch (err) {
      console.error("⚠️ Atlas $search error:", err.message);
      clauseUsed = "Atlas error → fallback regex";
      docs = [];
    }

    // ----------------------------
    // Fallback if Atlas failed or empty
    // ----------------------------
    if (!docs.length) {
      console.log("⚙️ [fallback] Running regex fallback for:", q);
      const rx = new RegExp(escapeRegex(q), "i");
      docs = await Workshop.find({
        $or: [
          { title: rx },
          { description: rx },
          { coach: rx },
          { type: rx },
          { city: rx },
          { studio: rx },
        ],
        ...filterObj,
      })
        .select(projection)
        .limit(limit)
        .lean();
      clauseUsed = "fallback regex";
    }

    // ----------------------------
    // Final filtering
    // ----------------------------
    const filtered = docs.filter((w) => {
      if (dayFilter) {
        const days = Array.isArray(w.days) ? w.days : [];
        if (!days.includes(dayFilter)) return false;
      }
      return true;
    });

    const took = Date.now() - start;
    console.groupCollapsed(`🧩 [searchWorkshops] (${clauseUsed}, ${took} ms)`);
    console.log("Query:", q, "| Docs:", filtered.length);
    if (filtered[0]) {
      console.log("Sample:", {
        _id: filtered[0]._id,
        title: filtered[0].title,
        coach: filtered[0].coach,
        city: filtered[0].city,
        score: filtered[0].score,
      });
    }
    console.groupEnd();

    return res.json(filtered.slice(0, limit));
  } catch (err) {
    console.error("❌ [searchWorkshops] Error:", err);
    res.status(500).json({
      message: "Server error performing workshop search",
      error: err.message,
    });
  }
};


