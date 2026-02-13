const jwt = require("jsonwebtoken");
const crypto = require("crypto");
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
const { hasAuthority } = require("../middleware/authMiddleware");
const fallbackCities = require("../config/fallbackCities.json");
const {
  hydrateFamilyMember,
  hydrateParentFields,
} = require("../services/entities/hydration");
const { resolveEntityByKey } = require("../services/entities/resolveEntity");
const {
  startIdempotentRequest,
  finalizeIdempotentRequest,
  clearIdempotentRequest,
} = require("../services/idempotency");
const {
  toPublicWorkshop,
  toUserWorkshop,
  toAdminWorkshop,
  normalizeWorkshopParticipants,
  sanitizeWaitingListEntry,
  deriveCounts,
  toEntityKey,
  normalizeEntityKey,
  matchesUserIdentity,
  loadWorkshopByIdentifier,
} = require("../contracts/workshopContracts");

const { safeAuditLog } = require("../services/SafeAuditLog");
const { AuditEventTypes } = require("../services/AuditEventRegistry");

const isTransactionConflict = (err) =>
  !!(
    err?.code === 112 ||
    err?.code === 251 ||
    err?.hasErrorLabel?.("TransientTransactionError") ||
    err?.hasErrorLabel?.("UnknownTransactionCommitResult")
  );

const beginIdempotency = async (req, res) => {
  const state = await startIdempotentRequest(req, { actorKey: req.user?.entityKey });
  if (state?.replay) {
    res
      .status(state.record.responseStatus || 200)
      .json(state.record.responseBody || {});
    return null;
  }
  if (state?.inProgress) {
    res.status(409).json({ message: "Request already in progress" });
    return null;
  }
  return state;
};

const respondWithIdempotency = async (res, state, status, payload) => {
  await finalizeIdempotentRequest(state, status, payload);
  return res.status(status).json(payload);
};

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

const assertOwnershipOrAdmin = ({ ownerKey, requester }) => {
  const isAdmin = hasAuthority(requester, "admin");
  const isOwner = ownerKey && requester?.entityKey && String(ownerKey) === String(requester.entityKey);
  if (!isOwner && !isAdmin) {
    const error = new Error("Unauthorized");
    error.statusCode = 403;
    throw error;
  }
};

/**
 * Identity:
 *   - Rejects ObjectId-based identity and expects opaque workshopKey inputs.
 * Storage:
 *   - Returns null; Mongo _id is never surfaced to callers here.
 * Notes:
 *   - Transitional stub while clients finalize workshopKey-only routing.
 */
function resolveWorkshopObjectId() {
  return null;
}

exports.resolveWorkshopObjectId = resolveWorkshopObjectId;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value) => UUID_REGEX.test(String(value || ""));


const buildUserRegistrationMaps = (userDoc) => {
  if (!userDoc) {
    return {
      userKey: null,
      userId: null,
      directWorkshopIds: new Set(),
      familyWorkshopMap: new Map(),
    };
  }

  const userKey = normalizeEntityKey(userDoc.entityKey);
  const userId = userDoc._id ? String(userDoc._id) : null;

  const directWorkshopIds = new Set(
    (userDoc.userWorkshopMap || []).map((id) => String(id))
  );

  const familyWorkshopMap = new Map();
  for (const entry of userDoc.familyWorkshopMap || []) {
    const familyMemberId = entry.familyMemberId;
    if (!familyMemberId) continue;
    const memberKey = hashId("family", String(familyMemberId));
    for (const wid of entry.workshops || []) {
      const widStr = String(wid);
      if (!familyWorkshopMap.has(widStr)) familyWorkshopMap.set(widStr, []);
      familyWorkshopMap.get(widStr).push(memberKey);
    }
  }

  return { userKey, userId, directWorkshopIds, familyWorkshopMap };
};

const resolveAccessScope = (req) => {
  if (hasAuthority(req?.user, "admin")) return { scope: "admin", principal: req.user };
  if (req?.user) return { scope: "user", principal: req.user };
  return { scope: "public", principal: null };
};

const isHiddenFromAccess = (workshop, access) =>
  access?.scope !== "admin" && !!workshop?.adminHidden;

const rejectHiddenWorkshop = (workshop, access, res, responder = null) => {
  if (isHiddenFromAccess(workshop, access)) {
    if (typeof responder === "function") {
      responder(404, { message: "Workshop not found" });
    } else {
      res.status(404).json({ message: "Workshop not found" });
    }
    return true;
  }
  return false;
};

const selectWorkshopView = (workshop, { scope, principal }, options = {}) => {
  if (scope === "admin") return toAdminWorkshop(workshop, options);
  if (scope === "user") return toUserWorkshop(workshop, principal);
  return toPublicWorkshop(workshop);
};

exports.toPublicWorkshop = toPublicWorkshop;
exports.toUserWorkshop = toUserWorkshop;
exports.toAdminWorkshop = toAdminWorkshop;


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
        await safeAuditLog({
          eventType: AuditEventTypes.WORKSHOP_WAITLIST_PROMOTED,
          subjectType: "workshop",
          subjectKey: workshop.workshopKey || null,
          actorKey: null,
          metadata: {
            participantType: "familyMember",
            participantKey: entry.familyMemberKey || entry.parentKey || "",
            action: "waitlist_promoted",
          },
        });
      } else {
        // Otherwise treat as a main user registration
        workshop.participants.push(entry.parentUser);
        await safeAuditLog({
          eventType: AuditEventTypes.WORKSHOP_WAITLIST_PROMOTED,
          subjectType: "workshop",
          subjectKey: workshop.workshopKey || null,
          actorKey: null,
          metadata: {
            participantType: "user",
            participantKey: entry.parentKey || "",
            action: "waitlist_promoted",
          },
        });
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

async function attemptWaitlistPromotion(workshopId, workshopKey = null) {
  const session = await mongoose.startSession();
  let promotedEntry = null;
  let participantType = null;

  try {
    session.startTransaction();
    const workshop = await Workshop.findOne({
      _id: workshopId,
      waitingListCount: { $gt: 0 },
    })
      .select(
        "workshopKey waitingList waitingListCount participantsCount maxParticipants participants familyRegistrations"
      )
      .session(session);

    if (!workshop) {
      await session.abortTransaction();
      return { promoted: false };
    }

    if (
      workshop.maxParticipants > 0 &&
      workshop.participantsCount >= workshop.maxParticipants
    ) {
      await session.abortTransaction();
      return { promoted: false };
    }

    const entry = workshop.waitingList?.[0];
    if (!entry) {
      await session.abortTransaction();
      return { promoted: false };
    }

    const capacityFilter =
      workshop.maxParticipants && workshop.maxParticipants > 0
        ? { participantsCount: { $lt: workshop.maxParticipants } }
        : {};

    const baseFilter = {
      _id: workshopId,
      waitingListCount: { $gt: 0 },
      ...capacityFilter,
      waitingList: { $elemMatch: { _id: entry._id } },
    };

    let update = null;

    if (entry.familyMemberId) {
      baseFilter.familyRegistrations = {
        $not: {
          $elemMatch: {
            parentUser: entry.parentUser,
            familyMemberId: entry.familyMemberId,
          },
        },
      };
      update = {
        $pull: { waitingList: { _id: entry._id } },
        $push: {
          familyRegistrations: {
            parentUser: entry.parentUser,
            familyMemberId: entry.familyMemberId,
            parentKey: entry.parentKey || "",
            familyMemberKey: entry.familyMemberKey || "",
            name: entry.name,
            relation: entry.relation,
            idNumber: entry.idNumber,
            phone: entry.phone,
            birthDate: entry.birthDate,
          },
        },
        $inc: { participantsCount: 1, waitingListCount: -1 },
      };
      participantType = "familyMember";
    } else {
      baseFilter.participants = { $ne: entry.parentUser };
      update = {
        $pull: { waitingList: { _id: entry._id } },
        $addToSet: { participants: entry.parentUser },
        $inc: { participantsCount: 1, waitingListCount: -1 },
      };
      participantType = "user";
    }

    const updateResult = await Workshop.updateOne(baseFilter, update, {
      session,
    });

    if (updateResult.modifiedCount !== 1) {
      await session.abortTransaction();
      return { promoted: false };
    }

    await session.commitTransaction();
    if (!workshopKey && workshop?.workshopKey) {
      workshopKey = workshop.workshopKey;
    }
    promotedEntry = entry;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  if (promotedEntry) {
    await safeAuditLog({
      eventType: AuditEventTypes.WORKSHOP_WAITLIST_PROMOTED,
      subjectType: "workshop",
      subjectKey: workshopKey || null,
      actorKey: null,
      metadata: {
        participantType,
        participantKey: promotedEntry.familyMemberKey || promotedEntry.parentKey || "",
        action: "waitlist_promoted",
      },
    });
    return { promoted: true, entry: promotedEntry, participantType };
  }

  return { promoted: false };
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
    const entityKey = decoded.sub || decoded.entityKey; // entityKey fallback supports legacy tokens only
    if (!entityKey) return;
    const user = await User.findOne({ entityKey }).select("_id name email entityKey +authorities");
    if (user && !user.authorities) user.authorities = {};
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

/**
 * Identity:
 *   - Optionally attaches principal via entityKey-bearing JWT and scopes visibility by admin/user roles.
 * Storage:
 *   - Uses Mongo _id strictly for workshop queries and registration map joins after auth resolution.
 * Notes:
 *   - Returns view-layer DTOs without exposing ObjectIds.
 */
// 🚀 NEW getAllWorkshops — full waitlist-aware version
exports.getAllWorkshops = async (req, res) => {
  try {
    await attachUserIfPresent(req);
    const access = resolveAccessScope(req);
    const limit = clampLimit(req.query.limit, 10, 100);
    const skip = clampSkip(req.query.skip);

    const isUserScope = access.scope === "user";
    const isAdminScope = access.scope === "admin";
    const visibilityFilter = isAdminScope ? {} : { adminHidden: { $ne: true } };

    let registrationMaps = {
      userKey: null,
      userId: null,
      directWorkshopIds: new Set(),
      familyWorkshopMap: new Map(),
    };

    if (isUserScope) {
      const userDoc = await User.findById(access.principal?._id).select(
        "_id entityKey userWorkshopMap familyWorkshopMap"
      );
      registrationMaps = buildUserRegistrationMaps(userDoc);
    }

    const baseSelectFields = [
      "_id",
      "workshopKey",
      "title",
      "type",
      "ageGroup",
      "city",
      "address",
      "studio",
      "coach",
      "days",
      "hour",
      "available",
      "adminHidden",
      "description",
      "price",
      "image",
      "time",
      "startTime",
      "durationMinutes",
      "maxParticipants",
      "waitingListMax",
      "sessionsCount",
      "startDate",
      "endDate",
      "inactiveDates",
      "participantsCount",
      "waitingListCount",
      "familyRegistrationsCount",
    ];

    if (isUserScope) {
      baseSelectFields.push("waitingList.parentKey");
    }

    const selectClause = baseSelectFields.join(" ");

    const [workshops, total] = await Promise.all([
      Workshop.find(visibilityFilter)
        .sort({ startDate: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(selectClause)
        .lean(),
      Workshop.countDocuments(visibilityFilter),
    ]);

    const decorated = workshops.map((w) => {
      if (isUserScope) {
        const waitlisted =
          Array.isArray(w.waitingList) &&
          w.waitingList.some((wl) =>
            matchesUserIdentity(wl?.parentKey || wl?.parentUser, {
              userKey: registrationMaps.userKey,
            })
          );
        const shaped = {
          ...w,
          __ownerKey: registrationMaps.userKey,
          __userRegistrationMap: registrationMaps.directWorkshopIds,
          __familyRegistrationMap: registrationMaps.familyWorkshopMap,
          __userWaitlisted: waitlisted,
        };
        delete shaped.waitingList;
        return shaped;
      }
      return w;
    });

    const result = decorated.map((w) =>
      selectWorkshopView(w, access, { includeParticipantDetails: false })
    );

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
   Returns compact workshop maps for the authenticated user:
   - userWorkshopMap: [workshopUuid,...] for self registrations
   - familyWorkshopMap: { [workshopUuid]: [familyEntityUuid,...] }

   The maps are derived from User.userWorkshopMap/familyWorkshopMap so
   we never need to expose full participant/familyRegistration rows in
   the general workshops list, keeping payloads smaller and more private.
------------------------------------------------------------ */
/**
 * Identity:
 *   - Requires authenticated principal; scopes admin visibility via entityKey authorities.
 * Storage:
 *   - Uses Mongo _id to fetch workshop maps and translate to workshopKey/entityKey for clients.
 * Notes:
 *   - Keeps ObjectIds internal while returning opaque registration maps.
 */
exports.getRegisteredWorkshops = async (req, res) => {
  try {
    const access = resolveAccessScope(req);
    const isAdminScope = access.scope === "admin";
    const userId = req.user?._id?.toString();
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Fetch compact user + family workshop maps so the frontend can highlight
    // registrations without needing full participant lists.
    const userDoc = await User.findById(userId).select(
      "entityKey userWorkshopMap familyWorkshopMap familyMembers"
    );

    if (!userDoc) {
      return res.status(404).json({ message: "User not found" });
    }

    // Map family Mongo _id -> hashed entityKey
    const familyIdToKey = new Map(
      (userDoc.familyMembers || []).map((member) => [
        String(member._id),
        toEntityKey(member, "family"),
      ])
    );

    const allWorkshopIds = [
      ...new Set([
        ...(userDoc.userWorkshopMap || []).map((id) => String(id)),
        ...(userDoc.familyWorkshopMap || []).flatMap((entry) =>
          (entry.workshops || []).map((wid) => String(wid))
        ),
      ]),
    ];

    const workshopKeyById = new Map();

    if (allWorkshopIds.length > 0) {
      const workshops = await Workshop.find({
        _id: { $in: allWorkshopIds },
        ...(isAdminScope ? {} : { adminHidden: { $ne: true } }),
      })
        .select("_id workshopKey adminHidden")
        .lean();

      workshops.forEach((w) => {
        const key = isUuid(w.workshopKey)
          ? w.workshopKey
          : hashId("workshop", String(w._id));
        workshopKeyById.set(String(w._id), key);
      });
    }

    // Direct user registrations
    const userWorkshopMap = [];
    for (const wid of userDoc.userWorkshopMap || []) {
      const wk = workshopKeyById.get(String(wid));
      if (wk) userWorkshopMap.push(wk);
    }

    // Family registrations keyed by workshop UUID
    const familyWorkshopMap = {};
    for (const entry of userDoc.familyWorkshopMap || []) {
      const memberKey = familyIdToKey.get(String(entry.familyMemberId));
      if (!memberKey) continue;

      for (const wid of entry.workshops || []) {
        const wk = workshopKeyById.get(String(wid));
        if (!wk) continue;
        if (!familyWorkshopMap[wk]) familyWorkshopMap[wk] = [];
        if (!familyWorkshopMap[wk].includes(memberKey)) {
          familyWorkshopMap[wk].push(memberKey);
        }
      }
    }

    return res.json({
      userWorkshopMap: [...new Set(userWorkshopMap)],
      familyWorkshopMap,
    });
  } catch (err) {
    console.error("❌ Error fetching registered workshops (maps):", err);
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
/**
 * Identity:
 *   - Resolves requester via entityKey JWT (optional) and scopes admin-hidden workshops accordingly.
 * Storage:
 *   - Uses Mongo _id solely after resolving the workshopKey; no permission checks rely on _id.
 * Notes:
 *   - Responds with DTOs that avoid exposing ObjectIds.
 */
exports.getWorkshopById = async (req, res) => {
  try {
    await attachUserIfPresent(req);
    const access = resolveAccessScope(req);
    const { id } = req.params;

    /* -------------------------------------------------
       1️⃣ Load workshop by ANY identifier
       ------------------------------------------------- */
    let workshopDoc = await loadWorkshopByIdentifier(id, Workshop);
    if (!workshopDoc) {
      return res.status(404).json({ message: "Workshop not found" });
    }

    if (rejectHiddenWorkshop(workshopDoc, access, res)) return;

    /* -------------------------------------------------
       3️⃣ Reload clean document (ALWAYS re-fetch)
       ------------------------------------------------- */
    const selectFields = [
      "_id",
      "title",
      "type",
      "description",
      "ageGroup",
      "coach",
      "city",
      "address",
      "studio",
      "startDate",
      "endDate",
      "inactiveDates",
      "days",
      "hour",
      "time",
      "startTime",
      "durationMinutes",
      "price",
      "image",
      "available",
      "adminHidden",
      "maxParticipants",
      "waitingListMax",
      "sessionsCount",
      "participantsCount",
      "familyRegistrationsCount",
      "waitingListCount",
      "workshopKey",
    ];

    if (access.scope === "user") {
      selectFields.push("waitingList.parentKey", "waitingList.parentUser");
    }

    const workshop = await Workshop.findById(workshopDoc._id).select(selectFields.join(" ")).lean();

    if (!workshop) {
      return res.status(404).json({ message: "Workshop not found" });
    }

    if (access.scope !== "admin") {
      const waitlisted =
        Array.isArray(workshop.waitingList) &&
        workshop.waitingList.some((wl) =>
          matchesUserIdentity(wl?.parentKey || wl?.parentUser, { userKey: access.principal?.entityKey })
        );
      workshop.__userWaitlisted = waitlisted;
      delete workshop.waitingList;
    }

    const normalized = selectWorkshopView(workshop, access, {
      includeParticipantDetails: false,
    });

    const stats = normalized?.stats || {};

    const response = {
      ...normalized,
      address: normalized.address || "",
      city: normalized.city || "",
      studio: normalized.studio || "",
      coach: normalized.coach || "",
      participantsCount:
        normalized.participantsCount ??
        (stats.participantsTotal ?? 0),
      meta: {
        totalParticipants:
          stats.participantsTotal ?? normalized.participantsCount ?? 0,
        waitingListCount: stats.waitingListCount ?? normalized.waitingListCount ?? 0,
        isAvailable: !!normalized.available,
      },
    };

    return res.json({ success: true, data: response });

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
/**
 * Identity:
 *   - Admin authorization enforced via entityKey authorities resolved upstream.
 * Storage:
 *   - Uses Mongo _id for document updates and participant syncing after workshopKey lookup.
 * Notes:
 *   - Keeps client-facing identifiers opaque while recalculating derived fields.
 */
exports.updateWorkshop = async (req, res) => {
  let idempotencyState = null;
  try {
    const access = resolveAccessScope(req);
    idempotencyState = await beginIdempotency(req, res);
    if (!idempotencyState) return;
    const respond = (status, payload) =>
      respondWithIdempotency(res, idempotencyState, status, payload);
    const { id } = req.params;

    // 1. Strict Lookup (Returns 404 if id is not a valid workshop UUID)
    const existing = await loadWorkshopByIdentifier(id, Workshop);
    if (!existing) {
      return respond(404, { message: "Workshop not found" });
    }

    /* ============================================================
       🧩 Define allowed fields for update
       ============================================================ */
    const allowed = [
      "title", "type", "ageGroup", "city", "address", "studio", "coach",
      "days", "hour", "available", "adminHidden", "description", "price",
      "image", "maxParticipants", "waitingListMax", "autoEnrollOnVacancy",
      "sessionsCount", "startDate", "inactiveDates"
    ];

    const updates = {};
    const wasHidden = !!existing.adminHidden;
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key];
    }

    if ("adminHidden" in updates) {
      updates.adminHidden = !!updates.adminHidden;
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
      return respond(400, { message: "sessionsCount must be numeric" });
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

    if (wasHidden !== !!existing.adminHidden) {
      await safeAuditLog({
        eventType: AuditEventTypes.WORKSHOP_VISIBILITY_TOGGLE,
        subjectType: "workshop",
        subjectKey: existing.workshopKey || null,
        actorKey: req.user?.entityKey,
        metadata: {
          action: existing.adminHidden ? "hide" : "unhide",
        },
      });
    }

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

    const normalizedSource = selectWorkshopView(ws, access, {
      includeParticipantDetails: false,
    }) || {};
    const normalized = {
      ...normalizedSource,
      address: normalizedSource.address || "",
      city: normalizedSource.city || "",
      studio: normalizedSource.studio || "",
      coach: normalizedSource.coach || "",
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

    await safeAuditLog({
      eventType: AuditEventTypes.ADMIN_WORKSHOP_UPDATE,
      subjectType: "workshop",
      subjectKey: ws.workshopKey || null,
      actorKey: req.user?.entityKey,
      metadata: {
        action: "workshop_update",
        adminId: req.user?.entityKey || null,
        entityId: ws.workshopKey || null,
        ip: req.ip,
      },
    });

    return respond(200, {
      success: true,
      message: "Workshop updated successfully",
      data: normalized,
      meta,
    });
  } catch (err) {
    console.error("❌ [updateWorkshop] Error:", err);
    await clearIdempotentRequest(idempotencyState);
    return respondWithIdempotency(res, idempotencyState, 500, {
      message: err.message || "Failed to update workshop",
    });
  }
};



/**
 * @desc Create a new workshop (with non-blocking address validation)
 * @route POST /api/workshops
 * @access Admin only
 */
/**
 * Identity:
 *   - Admin scope enforced via entityKey-based authorities before creation.
 * Storage:
 *   - Writes workshop using Mongo _id internally; returns workshopKey/DTOs to clients.
 * Notes:
 *   - Address validation is non-blocking and does not affect identity handling.
 */
exports.createWorkshop = async (req, res) => {
  let idempotencyState = null;
  try {
    const access = resolveAccessScope(req);
    idempotencyState = await beginIdempotency(req, res);
    if (!idempotencyState) return;
    const respond = (status, payload) =>
      respondWithIdempotency(res, idempotencyState, status, payload);
    const data = { ...req.body };

    // 🧩 Required field check
    if (!data.city || !data.address) {
      return respond(400, { message: "City and address are required" });
    }

    if ("adminHidden" in data) {
      data.adminHidden = !!data.adminHidden;
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
      return respond(400, { message: "At least one valid day is required" });
    }

    /* ============================================================
       🗓 Validate core session info
       ============================================================ */
    if (!data.startDate) {
      return respond(400, { message: "startDate is required" });
    }

    data.startDate = new Date(data.startDate);
    if (isNaN(data.startDate.getTime())) {
      return respond(400, { message: "Invalid startDate" });
    }

    const count = parseInt(data.sessionsCount, 10);
    if (isNaN(count) || count < 1) {
      return respond(400, { message: "sessionsCount must be a positive number" });
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
    const normalizedSource = selectWorkshopView(ws, access, {
      includeParticipantDetails: false,
    }) || {};
    const normalized = {
      ...normalizedSource,
      address: normalizedSource.address || "",
      city: normalizedSource.city || "",
      studio: normalizedSource.studio || "",
      coach: normalizedSource.coach || "",
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

    await safeAuditLog({
      eventType: AuditEventTypes.ADMIN_WORKSHOP_CREATE,
      subjectType: "workshop",
      subjectKey: ws.workshopKey || null,
      actorKey: req.user?.entityKey,
      metadata: {
        action: "workshop_create",
        adminId: req.user?.entityKey || null,
        entityId: ws.workshopKey || null,
        ip: req.ip,
      },
    });

    return respond(201, { success: true, data: normalized, meta });
  } catch (err) {
    console.error("❌ [createWorkshop] Error:", err);
    await clearIdempotentRequest(idempotencyState);
    return respondWithIdempotency(res, idempotencyState, 500, {
      message: err.message || "Failed to create workshop",
    });
  }
};


/* ------------------------------------------------------------
   🔴 DELETE /api/workshops/:id
------------------------------------------------------------ */
/**
 * Identity:
 *   - Expects admin authority validated via entityKey middleware before deletion.
 * Storage:
 *   - Uses Mongo _id to locate and delete the workshop after resolving workshopKey.
 * Notes:
 *   - Audit logging keyed by entityKey/workshopKey keeps ObjectIds internal.
 */
exports.deleteWorkshop = async (req, res) => {
  let idempotencyState = null;
  try {
    idempotencyState = await beginIdempotency(req, res);
    if (!idempotencyState) return;
    const respond = (status, payload) =>
      respondWithIdempotency(res, idempotencyState, status, payload);
    const workshopDoc = await loadWorkshopByIdentifier(req.params.id, Workshop);
    if (!workshopDoc) {
      return respond(404, { message: "Workshop not found" });
    }

    const ws = await Workshop.findByIdAndDelete(workshopDoc._id);
    if (!ws) return respond(404, { message: "Workshop not found" });
    await safeAuditLog({
      eventType: AuditEventTypes.ADMIN_WORKSHOP_DELETE,
      subjectType: "workshop",
      subjectKey: workshopDoc.workshopKey || null,
      actorKey: req.user?.entityKey,
      metadata: {
        action: "workshop_delete",
        adminId: req.user?.entityKey || null,
        entityId: workshopDoc.workshopKey || null,
        ip: req.ip,
      },
    });
    return respond(200, { message: "Workshop deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting workshop:", err);
    await clearIdempotentRequest(idempotencyState);
    return respondWithIdempotency(res, idempotencyState, 400, {
      message: "Failed to delete workshop",
    });
  }
};

/* ------------------------------------------------------------
   🧩 GET /api/workshops/:id/participants
------------------------------------------------------------ */
// controllers/workshopController.js
/**
 * Identity:
 *   - Requires admin authority derived from entityKey-scoped middleware.
 * Storage:
 *   - Uses Mongo _id to load and paginate participants; never for permission decisions.
 * Notes:
 *   - Response contains entityKey-based participant DTOs only.
 */
exports.getWorkshopParticipants = async (req, res) => {
  try {
    if (!hasAuthority(req.user, "admin")) {
      return res.status(403).json({ message: "Access denied" });
    }

    const workshopDoc = await loadWorkshopByIdentifier(req.params.id, Workshop);
    if (!workshopDoc) {
      return res.status(404).json({ message: "Workshop not found" });
    }

    const limit = clampLimit(req.query.limit, 25, 100);
    const skip = clampSkip(req.query.skip);

    const includeContactFields = req.access?.scope === "admin";

    const workshop = await Workshop.findById(workshopDoc._id)
      .populate(
        "participants",
        "name email phone city birthDate idNumber canCharge entityKey"
      )
      .populate(
        "familyRegistrations.parentUser",
        "name email phone city birthDate idNumber canCharge entityKey"
      )
      .populate(
        "familyRegistrations.familyMemberId",
        "name relation phone email city birthDate idNumber entityKey"
      )
      .lean();

    if (!workshop) return res.status(404).json({ message: "Workshop not found" });

    const normalized = normalizeWorkshopParticipants(workshop, {
      adminView: true,
      includeContactFields,
    });
    const total = normalized.participantsCount || 0;
    const participants = (normalized.participants || []).slice(
      skip,
      Math.min(skip + limit, total)
    );

    await safeAuditLog({
      eventType: AuditEventTypes.SECURITY,
      subjectType: "workshop",
      subjectKey: workshopDoc.workshopKey || null,
      actorKey: req.user?.entityKey,
      metadata: {
        action: "workshop_participants_view",
        limit,
        skip,
      },
    });

    return res.json({
      success: true,
      participants,
      participantsCount: total,
      directCount: normalized.directCount,
      familyCount: normalized.familyCount,
      meta: {
        limit,
        skip,
        nextSkip: skip + participants.length,
        hasMore: skip + limit < total,
        total,
      },
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
/**
 * Identity:
 *   - Resolves target via entityKey and enforces owner/admin through assertOwnershipOrAdmin.
 * Storage:
 *   - Uses Mongo _id for workshop mutation and registration subdocuments after auth.
 * Notes:
 *   - Rejects forbidden identity fields to keep requests entityKey-first.
 */
exports.registerEntityToWorkshop = async (req, res) => {
  let idempotencyState = null;
  try {
    rejectForbiddenFields(req.body);
    const access = resolveAccessScope(req);
    idempotencyState = await beginIdempotency(req, res);
    if (!idempotencyState) return;
    const respond = (status, payload) =>
      respondWithIdempotency(res, idempotencyState, status, payload);

    const workshopKey = req.params.id;
    const targetEntityKey = req.body?.entityKey || req.user?.entityKey;

    // Load workshop
    const workshop = await loadWorkshopByIdentifier(workshopKey, Workshop);
    if (!workshop)
      return respond(404, { message: "Workshop not found" });
    if (rejectHiddenWorkshop(workshop, access, res, respond)) return;

    // Resolve entity
    const resolved = await resolveEntityByKey(targetEntityKey);
    if (!resolved)
      return respond(404, { success: false, message: "Entity not found" });

    const parentUser = resolved.userDoc;
    const member = resolved.type === "familyMember" ? resolved.memberDoc : null;

    assertOwnershipOrAdmin({ ownerKey: parentUser.entityKey, requester: req.user });

    const parentId = parentUser._id;
    const memberId = member?._id || null;

    const capacityFilter =
      workshop.maxParticipants && workshop.maxParticipants > 0
        ? { participantsCount: { $lt: workshop.maxParticipants } }
        : {};

    const baseFilter = { _id: workshop._id, ...capacityFilter };
    let updatedWorkshop = null;
    const registrationEntry = buildRegistrationEntry({
      parentUser,
      memberDoc: member,
    });
    const session = await mongoose.startSession();
    let latest = null;

    try {
      session.startTransaction();
      if (member) {
        updatedWorkshop = await Workshop.findOneAndUpdate(
          {
            ...baseFilter,
            familyRegistrations: {
              $not: {
                $elemMatch: {
                  familyMemberId: memberId,
                  parentUser: parentId,
                },
              },
            },
          },
          {
            $push: {
              familyRegistrations: {
                ...registrationEntry,
                parentUser: parentId,
                familyMemberId: memberId,
              },
            },
            $inc: { participantsCount: 1 },
          },
          { new: true, session }
        );
      } else {
        updatedWorkshop = await Workshop.findOneAndUpdate(
          {
            ...baseFilter,
            participants: { $ne: parentId },
          },
          {
            $addToSet: { participants: parentId },
            $inc: { participantsCount: 1 },
          },
          { new: true, session }
        );
      }

      if (!updatedWorkshop) {
        latest = await Workshop.findById(workshop._id)
          .select(
            "participants familyRegistrations waitingList waitingListMax waitingListCount maxParticipants participantsCount"
          )
          .session(session);
        await session.abortTransaction();
      } else {
        const workshopObjectId = updatedWorkshop._id;
        if (member) {
          const mapUpdate = await User.updateOne(
            { _id: parentId, "familyWorkshopMap.familyMemberId": memberId },
            { $addToSet: { "familyWorkshopMap.$.workshops": workshopObjectId } },
            { session }
          );
          if (mapUpdate.matchedCount === 0) {
            await User.updateOne(
              { _id: parentId },
              {
                $push: {
                  familyWorkshopMap: {
                    familyMemberId: memberId,
                    workshops: [workshopObjectId],
                  },
                },
              },
              { session }
            );
          }
        } else {
          await User.updateOne(
            { _id: parentId },
            { $addToSet: { userWorkshopMap: workshopObjectId } },
            { session }
          );
        }

        await session.commitTransaction();
      }
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }

    if (!updatedWorkshop) {
      const fallbackLatest =
        latest ||
        (await Workshop.findById(workshop._id).select(
          "participants familyRegistrations waitingList waitingListMax waitingListCount maxParticipants participantsCount"
        ));
      // Re-check to return precise reason
      const latestDoc = fallbackLatest;

      const dupRegistered = member
        ? latestDoc?.familyRegistrations?.some(
            (r) =>
              String(r.familyMemberId) === String(memberId) &&
              String(r.parentUser) === String(parentId)
          )
        : latestDoc?.participants?.some((p) => String(p) === String(parentId));

      if (dupRegistered) {
        return respond(400, {
          success: false,
          message: "Entity already registered",
        });
      }

      const alreadyQueued = (latestDoc?.waitingList || []).some((w) => {
        const sameParent = String(w.parentUser) === String(parentId);
        if (member) {
          return sameParent && String(w.familyMemberId) === String(memberId);
        }
        return sameParent && !w.familyMemberId;
      });

      const noSpace =
        latestDoc &&
        latestDoc.maxParticipants > 0 &&
        latestDoc.participantsCount >= latestDoc.maxParticipants;

      if (noSpace) {
      const waitingListCount =
        typeof latestDoc.waitingListCount === "number"
          ? latestDoc.waitingListCount
          : latestDoc.waitingList.length;
      const waitingFull =
          latestDoc.waitingListMax > 0 &&
          waitingListCount >= latestDoc.waitingListMax;
        if (waitingFull) {
          return respond(400, {
            success: false,
            message: "Workshop is full and waiting list is full",
          });
        }
        if (alreadyQueued) {
          return respond(400, {
            success: false,
            message: "Entity already in waiting list",
          });
        }
        req.idempotencyState = idempotencyState;
        req.idempotencyResponder = respond;
        return exports.addEntityToWaitlist(req, res);
      }

      return respond(400, {
        success: false,
        message: "Unable to register entity",
      });
    }

    // repopulate complete workshop
  const populated = await Workshop.findById(updatedWorkshop._id)
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

    await safeAuditLog({
      eventType: AuditEventTypes.WORKSHOP_REGISTRATION,
      subjectType: "workshop",
      subjectKey: workshop.workshopKey || null,
      actorKey: req.user?.entityKey,
      metadata: {
        participantType: member ? "familyMember" : "user",
        participantKey: member ? member.entityKey : parentUser.entityKey,
        action: "join",
      },
    });

    return respond(200, {
      success: true,
      workshop: selectWorkshopView(decorated, access, {
        includeParticipantDetails: false,
      }),
    });
  } catch (err) {
    console.error("🔥 registerEntityToWorkshop error:", err);
    await clearIdempotentRequest(idempotencyState);
    if (isTransactionConflict(err)) {
      return respondWithIdempotency(res, idempotencyState, 409, {
        success: false,
        message: "Registration failed due to high traffic. Please try again.",
      });
    }
    const payload = {
      success: false,
      message: "Server error during registration",
    };
    if (process.env.NODE_ENV !== "production") {
      payload.detail = err.message;
    }
    return respondWithIdempotency(res, idempotencyState, 500, payload);
  }
};


/**
 * unregisterEntityFromWorkshop
 * --------------------------------------------------------------------------
 * Removes either a user or a family member from a workshop.
 * Keeps Workshop and User mappings in sync.
 */
/**
 * Identity:
 *   - Resolves entity by entityKey and enforces ownership or admin before unregistering.
 * Storage:
 *   - Uses Mongo _id for workshop mutations and User map updates after auth check.
 * Notes:
 *   - Waitlist fallback delegates to addEntityToWaitlist without exposing ObjectIds.
 */
exports.unregisterEntityFromWorkshop = async (req, res) => {
  let idempotencyState = null;
  try {
    rejectForbiddenFields(req.body);
    const access = resolveAccessScope(req);
    idempotencyState = await beginIdempotency(req, res);
    if (!idempotencyState) return;
    const respond = (status, payload) =>
      respondWithIdempotency(res, idempotencyState, status, payload);

    const workshopKey = req.params.id;
    const targetEntityKey = req.body?.entityKey || req.user?.entityKey;

    const workshop = await loadWorkshopByIdentifier(workshopKey, Workshop);
    if (!workshop) return respond(404, { message: "Workshop not found" });
    if (rejectHiddenWorkshop(workshop, access, res, respond)) return;

    const resolved = await resolveEntityByKey(targetEntityKey);
    if (!resolved) return respond(404, { message: "Entity not found" });

    const parentUser = resolved.userDoc;
    const member = resolved.type === "familyMember" ? resolved.memberDoc : null;

    assertOwnershipOrAdmin({ ownerKey: parentUser.entityKey, requester: req.user });

    let changed = false;
    const workshopObjectId = workshop._id;
    const session = await mongoose.startSession();

    try {
      session.startTransaction();
      let updatedWorkshop = null;

      if (member) {
        updatedWorkshop = await Workshop.findOneAndUpdate(
          {
            _id: workshopObjectId,
            familyRegistrations: {
              $elemMatch: { parentUser: parentUser._id, familyMemberId: member._id },
            },
          },
          {
            $pull: {
              familyRegistrations: {
                parentUser: parentUser._id,
                familyMemberId: member._id,
              },
            },
            $inc: { participantsCount: -1 },
          },
          { new: true, session }
        );
      } else {
        updatedWorkshop = await Workshop.findOneAndUpdate(
          { _id: workshopObjectId, participants: parentUser._id },
          {
            $pull: { participants: parentUser._id },
            $inc: { participantsCount: -1 },
          },
          { new: true, session }
        );
      }

      if (!updatedWorkshop) {
        await session.abortTransaction();
        changed = false;
      } else {
        if (member) {
          await User.updateOne(
            { _id: parentUser._id, "familyWorkshopMap.familyMemberId": member._id },
            { $pull: { "familyWorkshopMap.$.workshops": workshopObjectId } },
            { session }
          );
        } else {
          await User.updateOne(
            { _id: parentUser._id },
            { $pull: { userWorkshopMap: workshopObjectId } },
            { session }
          );
        }

        await session.commitTransaction();
        changed = true;
      }
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }

    if (changed) {
      try {
        await attemptWaitlistPromotion(workshopObjectId, workshop.workshopKey);
      } catch (err) {
        if (isTransactionConflict(err)) {
          return respond(409, {
            success: false,
            message: "Promotion failed due to high traffic. Please try again.",
          });
        }
        throw err;
      }
    }

    const populated = await Workshop.findById(workshop._id)
      .populate("participants", "entityKey name")
      .populate("familyRegistrations.familyMemberId", "entityKey name relation")
      .populate("familyRegistrations.parentUser", "entityKey name")
      .populate("waitingList.parentUser", "entityKey name")
      .populate("waitingList.familyMemberId", "entityKey name relation");

    const decorated = populated.toObject();
    decorated.__ownerKey = req.user?.entityKey || null;

    if (changed) {
      await safeAuditLog({
        eventType: AuditEventTypes.WORKSHOP_UNREGISTER,
        subjectType: "workshop",
        subjectKey: workshop.workshopKey || null,
        actorKey: req.user?.entityKey,
        metadata: {
          participantType: member ? "familyMember" : "user",
          participantKey: member ? member.entityKey : parentUser.entityKey,
          action: "unregister",
        },
      });
    }

    return respond(200, {
      success: true,
      changed,
      message: "Entity unregistered successfully",
      workshop: selectWorkshopView(decorated, access, {
        includeParticipantDetails: false,
      }),
    });
  } catch (err) {
    console.error("❌ unregisterEntityFromWorkshop error:", err);
    await clearIdempotentRequest(idempotencyState);
    if (isTransactionConflict(err)) {
      return respondWithIdempotency(res, idempotencyState, 409, {
        success: false,
        message: "Unregistration failed due to high traffic. Please try again.",
      });
    }
    return respondWithIdempotency(res, idempotencyState, 500, {
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
/**
 * Identity:
 *   - Resolves target via entityKey and enforces ownership/admin before enqueueing.
 * Storage:
 *   - Uses Mongo _id for workshop updates and waitlist documents after authorization.
 * Notes:
 *   - Keeps response DTOs keyed by entityKey/workshopKey only.
 */
exports.addEntityToWaitlist = async (req, res) => {
  let idempotencyState = req.idempotencyState || null;
  let respond = req.idempotencyResponder || null;
  try {
    rejectForbiddenFields(req.body);
    const access = resolveAccessScope(req);
    if (!respond) {
      idempotencyState = await beginIdempotency(req, res);
      if (!idempotencyState) return;
      respond = (status, payload) =>
        respondWithIdempotency(res, idempotencyState, status, payload);
    }

    const { id } = req.params;
    const targetEntityKey = req.body?.entityKey || req.user?.entityKey;

    const workshop = await loadWorkshopByIdentifier(id, Workshop);
    if (!workshop)
      return respond(404, { success: false, message: "Workshop not found" });
    if (rejectHiddenWorkshop(workshop, access, res, respond)) return;

    const resolved = await resolveEntityByKey(targetEntityKey);
    if (!resolved)
      return respond(404, { success: false, message: "Entity not found" });

    const parentUser = resolved.userDoc;
    const member = resolved.type === "familyMember" ? resolved.memberDoc : null;

    assertOwnershipOrAdmin({ ownerKey: parentUser.entityKey, requester: req.user });

    const parentId = parentUser._id;
    const memberId = member?._id || null;

    const entry = buildRegistrationEntry({ parentUser, memberDoc: member });
    const session = await mongoose.startSession();
    let updated = null;

    try {
      session.startTransaction();
      const capacityFilter =
        workshop.waitingListMax && workshop.waitingListMax > 0
          ? { waitingListCount: { $lt: workshop.waitingListMax } }
          : {};

      updated = await Workshop.findOneAndUpdate(
        {
          _id: workshop._id,
          ...capacityFilter,
          waitingList: {
            $not: {
              $elemMatch: {
                parentUser: parentId,
                ...(member ? { familyMemberId: memberId } : { familyMemberId: { $exists: false } }),
              },
            },
          },
        },
        {
          $push: { waitingList: entry },
          $inc: { waitingListCount: 1 },
        },
        { new: true, session }
      );

      if (!updated) {
        const latest = await Workshop.findById(workshop._id)
          .select("waitingList waitingListMax waitingListCount")
          .session(session);
        await session.abortTransaction();
        session.endSession();

        const exists = (latest?.waitingList || []).some((e) => {
          const sameParent = String(e.parentUser) === String(parentId);
          if (member) {
            return sameParent && String(e.familyMemberId) === String(memberId);
          }
          return sameParent && !e.familyMemberId;
        });

        if (exists) {
          return respond(400, {
            success: false,
            message: "Already in waiting list",
          });
        }

        const listCount =
          typeof latest?.waitingListCount === "number"
            ? latest.waitingListCount
            : latest?.waitingList?.length || 0;

        if (latest?.waitingListMax > 0 && listCount >= latest.waitingListMax) {
          return respond(400, {
            success: false,
            message: "Waiting list is full",
          });
        }

        return respond(400, {
          success: false,
          message: "Unable to add to waiting list",
        });
      }

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }

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

    await safeAuditLog({
      eventType: AuditEventTypes.WORKSHOP_WAITLIST_ADD,
      subjectType: "workshop",
      subjectKey: workshop.workshopKey || null,
      actorKey: req.user?.entityKey,
      metadata: {
        participantType: member ? "familyMember" : "user",
        participantKey: member ? member.entityKey : parentUser.entityKey,
        action: "waitlist_add",
      },
    });

    return respond(200, {
      success: true,
      message: "Added to waiting list successfully",
      position:
        typeof updated.waitingListCount === "number"
          ? updated.waitingListCount
          : updated.waitingList.length,
      workshop: selectWorkshopView(decorated, access, {
        includeParticipantDetails: false,
      }),
    });
  } catch (err) {
    console.error("🔥 addEntityToWaitlist error:", err);
    await clearIdempotentRequest(idempotencyState);
    return respondWithIdempotency(res, idempotencyState, 500, {
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
/**
 * Identity:
 *   - Resolves entityKey target and enforces ownership or admin before removal.
 * Storage:
 *   - Uses Mongo _id internally when updating waitlist/registration arrays.
 * Notes:
 *   - Emits entityKey-focused DTOs; ObjectIds remain internal.
 */
exports.removeEntityFromWaitlist = async (req, res) => {
  let idempotencyState = null;
  try {
    rejectForbiddenFields(req.body);
    const access = resolveAccessScope(req);
    idempotencyState = await beginIdempotency(req, res);
    if (!idempotencyState) return;
    const respond = (status, payload) =>
      respondWithIdempotency(res, idempotencyState, status, payload);

    const { id } = req.params;
    const targetEntityKey = req.body?.entityKey || req.user?.entityKey;

    const workshop = await loadWorkshopByIdentifier(id, Workshop);
    if (!workshop)
      return respond(404, { success: false, message: "Workshop not found" });
    if (rejectHiddenWorkshop(workshop, access, res, respond)) return;

    const resolved = await resolveEntityByKey(targetEntityKey);
    if (!resolved)
      return respond(404, {
        success: false,
        message: "Entity not found in waiting list",
      });

    const parentUser = resolved.userDoc;
    const member = resolved.type === "familyMember" ? resolved.memberDoc : null;

    assertOwnershipOrAdmin({ ownerKey: parentUser.entityKey, requester: req.user });

    const parentId = parentUser._id;
    const memberId = member?._id || null;

    const session = await mongoose.startSession();
    let updated = null;

    try {
      session.startTransaction();
      updated = await Workshop.findOneAndUpdate(
        {
          _id: workshop._id,
          waitingList: {
            $elemMatch: {
              parentUser: parentId,
              ...(member ? { familyMemberId: memberId } : { familyMemberId: { $exists: false } }),
            },
          },
        },
        {
          $pull: {
            waitingList: {
              parentUser: parentId,
              ...(member ? { familyMemberId: memberId } : { familyMemberId: { $exists: false } }),
            },
          },
          $inc: { waitingListCount: -1 },
        },
        { new: true, session }
      );

      if (!updated) {
        await session.abortTransaction();
        session.endSession();
        return respond(404, {
          success: false,
          message: "Entry not found in waiting list",
        });
      }

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }

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

    return respond(200, {
      success: true,
      message: "Removed from waiting list successfully",
      workshop: selectWorkshopView(decorated, access, {
        includeParticipantDetails: false,
      }),
    });
  } catch (err) {
    console.error("🔥 removeEntityFromWaitlist error:", err);
    await clearIdempotentRequest(idempotencyState);
    if (isTransactionConflict(err)) {
      return respondWithIdempotency(res, idempotencyState, 409, {
        success: false,
        message: "Request conflict. Please try again.",
      });
    }
    return respondWithIdempotency(res, idempotencyState, 500, {
      success: false,
      message: "Server error removing from waitlist",
    });
  }
};


/**
 * Identity:
 *   - Admin-only export validated via entityKey authorities.
 * Storage:
 *   - Loads workshop and participant data by Mongo _id after auth; exports without exposing _id.
 * Notes:
 *   - Output is Excel; retains privacy by hashing or omitting internal identifiers.
 */
exports.exportWorkshopExcel = async (req, res) => {
  try {
    const admin = req.user;
    if (!hasAuthority(admin, "admin")) {
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
    const baseWorkshop = await loadWorkshopByIdentifier(workshopId, Workshop);
    if (!baseWorkshop) return res.status(404).json({ message: "Workshop not found" });

    const workshopDoc = await Workshop.findById(baseWorkshop._id)
      .populate("participants", "name email phone city birthDate idNumber canCharge")
      .populate("familyRegistrations.parentUser", "name email phone city canCharge")
      .populate(
        "familyRegistrations.familyMemberId",
        "name relation idNumber phone birthDate email city"
      )
      .populate("waitingList.parentUser", "name email phone city canCharge")
      .populate("waitingList.familyMemberId", "name relation idNumber phone birthDate email city")
      .lean();

    if (!workshopDoc) return res.status(404).json({ message: "Workshop not found" });

    const workshop = toAdminWorkshop(workshopDoc, {
      includeParticipantDetails: true,
      includeContactFields: true,
      includeSensitiveFields: true,
    });

    // 2. Setup Excel Logic (Preserved from your code)
    const startDate = workshop.startDate ? new Date(workshop.startDate) : new Date(workshop.createdAt);
    const periodDays = Number(workshop.timePeriod) || 30;
    const endDate = new Date(startDate.getTime() + periodDays * 24 * 60 * 60 * 1000);
    const startDateStr = toHebDate(startDate);
    const endDateStr = toHebDate(endDate);

    const exportType = String(req.query.type || "").toLowerCase();
    const includeParticipants = !exportType || exportType === "current";
    const includeWaitlist = !exportType || exportType === "waitlist";
    const exportAudience = String(req.query.audience || "admin").toLowerCase();

    const exportSchemas = {
      admin: [
        "p_name",
        "p_relation",
        "p_email",
        "p_phone",
        "p_id",
        "p_birth",
        "p_age",
        "p_cancharge",
        "origin",
      ],
      participant: ["p_name", "p_relation", "p_email", "p_phone", "origin"],
      limited: ["p_name", "p_relation", "origin"],
    };

    const schemaKeys = exportSchemas[exportAudience] || exportSchemas.admin;

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

    const sanitizeExportRow = (rowObj) => {
      const sanitized = {};
      for (const col of sheet.columns) {
        const key = col.key;
        sanitized[key] = schemaKeys.includes(key) ? rowObj[key] ?? "" : "";
      }
      return sanitized;
    };

    const addRowRTL = (rowObj) => {
      const r = sheet.addRow(sanitizeExportRow(rowObj));
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
          p_name: p.name || "",
          p_relation: p.relation || "עצמי",
          p_email: p.email || "",
          p_phone: p.phone || "",
          p_id: p.idNumber || "",
          p_birth: toHebDate(p.birthDate),
          p_age: calcAge(p.birthDate),
          p_cancharge: p.canCharge ? "כן" : "לא",
          origin: "משתתף",
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
        addRowRTL({
          p_name: wl.name || "",
          p_relation: wl.relation || "רשימת המתנה",
          p_email: wl.email || "",
          p_phone: wl.phone || "",
          p_id: wl.idNumber || "",
          p_birth: toHebDate(wl.birthDate),
          p_age: calcAge(wl.birthDate),
          p_cancharge: wl.canCharge ? "כן" : "לא",
          origin: "רשימת המתנה",
        });
      });
    }

    // 3. Generate Buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // 4. Prepare Email Content
    const maxCap = Number(workshop.maxParticipants ?? 0);
    const capStr = maxCap === 0 ? "∞" : String(maxCap);
    const currentCount =
      workshop.participantsCount ?? (workshop.participants?.length || 0);
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
      await safeAuditLog({
        eventType: AuditEventTypes.SECURITY,
        subjectType: "workshop",
        subjectKey: workshop.workshopKey || null,
        actorKey: admin.entityKey,
        metadata: { action: "workshop_export" },
      });
      return res.json({ success: true, message: "Excel sent successfully via Email Service" });
    } else {
      throw new Error(result.error || "Email service returned failure");
    }

  } catch (err) {
    console.error("❌ exportWorkshopExcel error:", err);
    res.status(500).json({ success: false, message: "Error sending report: " + err.message });
  }
};

exports.autoPromoteFromWaitlist = autoPromoteFromWaitlist;
exports.__test = { autoPromoteFromWaitlist };

// ------------------------------------------------------------
// 🟣 GET /api/workshops/:id/waitlist — Admin only
// Returns all waiting list entries for a given workshop
// ------------------------------------------------------------
/**
 * Identity:
 *   - Admin-only route validated via entityKey authority checks.
 * Storage:
 *   - Uses Mongo _id for workshop lookup and pagination; authorization never depends on _id.
 * Notes:
 *   - Returns waitlist entries keyed by entityKey to avoid exposing ObjectIds.
 */
exports.getWaitlist = async (req, res) => {
  try {
    if (!hasAuthority(req.user, "admin")) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { id } = req.params;
    const limit = clampLimit(req.query.limit, 25, 100);
    const skip = clampSkip(req.query.skip);

    // 1️⃣ Resolve workshopKey (UUID-only)
    const workshopDoc = await loadWorkshopByIdentifier(id, Workshop);

    if (!workshopDoc) {
      return res.status(404).json({ message: "Workshop not found" });
    }

    // 2️⃣ Load lean workshop document
    const includeContactFields = req.access?.scope === "admin";

    const workshop = await Workshop.findById(workshopDoc._id)
      .populate(
        "waitingList.parentUser",
        "name email phone city birthDate idNumber canCharge entityKey"
      )
      .populate(
        "waitingList.familyMemberId",
        "name relation email phone city birthDate idNumber entityKey"
      )
      .lean();
    if (!workshop) {
      return res.status(404).json({ message: "Workshop not found" });
    }

    const normalized = (workshop.waitingList || []).map((entry) =>
      sanitizeWaitingListEntry(entry, { adminView: true, includeContactFields })
    );
    const total = normalized.length;
    const waitingList = normalized.slice(skip, Math.min(skip + limit, total));

    await safeAuditLog({
      eventType: AuditEventTypes.SECURITY,
      subjectType: "workshop",
      subjectKey: workshopDoc.workshopKey || null,
      actorKey: req.user?.entityKey,
      metadata: {
        action: "workshop_waitlist_view",
        limit,
        skip,
      },
    });

    return res.json({
      success: true,
      count: total,
      waitingList,
      meta: {
        limit,
        skip,
        nextSkip: skip + waitingList.length,
        hasMore: skip + limit < total,
        total,
      },
    });

  } catch (err) {
    console.error("❌ getWaitlist error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};

/**
 * Admin-only invariant check.
 * Verifies count fields against array lengths without mutating data.
 */
exports.getWorkshopInvariants = async (req, res) => {
  try {
    if (!hasAuthority(req.user, "admin")) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const limit = clampLimit(req.query.limit, 50, 200);
    const skip = clampSkip(req.query.skip);
    const includeSamples = String(req.query.includeSamples || "false") === "true";
    const sampleLimit = clampLimit(req.query.sampleLimit, 5, 50);

    const workshops = await Workshop.find({})
      .select(
        "workshopKey participants familyRegistrations waitingList participantsCount waitingListCount maxParticipants waitingListMax"
      )
      .skip(skip)
      .limit(limit)
      .lean();

    let mismatches = 0;
    const samples = [];

    for (const workshop of workshops) {
      const participantsTotal =
        (workshop.participants?.length || 0) +
        (workshop.familyRegistrations?.length || 0);
      const waitingTotal = workshop.waitingList?.length || 0;
      const participantsCount = Number.isFinite(workshop.participantsCount)
        ? workshop.participantsCount
        : 0;
      const waitingListCount = Number.isFinite(workshop.waitingListCount)
        ? workshop.waitingListCount
        : 0;

      const participantsMismatch = participantsCount !== participantsTotal;
      const waitingMismatch = waitingListCount !== waitingTotal;
      const negativeParticipants = participantsCount < 0;
      const negativeWaitlist = waitingListCount < 0;
      const exceedsCapacity =
        Number.isFinite(workshop.maxParticipants) &&
        workshop.maxParticipants > 0 &&
        participantsCount > workshop.maxParticipants;
      const exceedsWaitlist =
        Number.isFinite(workshop.waitingListMax) &&
        workshop.waitingListMax > 0 &&
        waitingListCount > workshop.waitingListMax;

      const participantIds = (workshop.participants || []).map((p) => String(p));
      const participantSet = new Set();
      const participantDuplicates = new Set();
      participantIds.forEach((id) => {
        if (participantSet.has(id)) participantDuplicates.add(id);
        participantSet.add(id);
      });

      const familyPairs = (workshop.familyRegistrations || []).map((fr) => ({
        parentUser: fr.parentUser ? String(fr.parentUser) : "",
        familyMemberId: fr.familyMemberId ? String(fr.familyMemberId) : "",
      }));
      const familyPairSet = new Set();
      const familyPairDuplicates = new Set();
      familyPairs.forEach(({ parentUser, familyMemberId }) => {
        if (!parentUser || !familyMemberId) return;
        const key = `${parentUser}:${familyMemberId}`;
        if (familyPairSet.has(key)) familyPairDuplicates.add(key);
        familyPairSet.add(key);
      });

      const waitlistIds = (workshop.waitingList || []).map((wl) => {
        if (wl.familyMemberId) return String(wl.familyMemberId);
        if (wl.parentUser) return String(wl.parentUser);
        return null;
      }).filter(Boolean);
      const waitlistSet = new Set(waitlistIds);
      const overlapParticipants = participantIds.filter((id) => waitlistSet.has(id));

      const violations = [];
      if (participantsMismatch) {
        violations.push("participants_count_mismatch");
      }
      if (waitingMismatch) {
        violations.push("waitinglist_count_mismatch");
      }
      if (negativeParticipants) {
        violations.push("participants_count_negative");
      }
      if (negativeWaitlist) {
        violations.push("waitinglist_count_negative");
      }
      if (exceedsCapacity) {
        violations.push("participants_count_exceeds_max");
      }
      if (exceedsWaitlist) {
        violations.push("waitinglist_count_exceeds_max");
      }
      if (participantDuplicates.size > 0) {
        violations.push("participant_duplicates");
      }
      if (familyPairDuplicates.size > 0) {
        violations.push("family_registration_duplicates");
      }
      if (overlapParticipants.length > 0) {
        violations.push("participant_waitlist_overlap");
      }

      if (violations.length > 0) {
        mismatches += 1;
        console.warn("⚠️ Workshop invariant mismatch", {
          workshopKey: workshop.workshopKey,
          participantsCount,
          computedParticipants: participantsTotal,
          waitingListCount,
          computedWaitingList: waitingTotal,
          violations,
        });

        if (includeSamples && samples.length < sampleLimit) {
          samples.push({
            workshopKey: workshop.workshopKey || null,
            participantsCount,
            computedParticipants: participantsTotal,
            waitingListCount,
            computedWaitingList: waitingTotal,
            violations,
          });
        }
      }
    }

    return res.json({
      success: true,
      checked: workshops.length,
      mismatches,
      samples: includeSamples ? samples : [],
      meta: {
        limit,
        skip,
        nextSkip: skip + workshops.length,
      },
    });
  } catch (err) {
    console.error("❌ getWorkshopInvariants error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error verifying workshop invariants",
    });
  }
};


   

/**
 * Identity:
 *   - Public metadata endpoint; no identity decisions or entityKey checks.
 * Storage:
 *   - No Mongo _id usage; reads external dataset only.
 * Notes:
 *   - Returns city list without touching persistence.
 */
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

// Test-only exports
exports.__test = {
  toEntityKey,
  normalizeWorkshopParticipants,
};

// ✅ בודק אם הכתובת שייכת לעיר בעזרת OpenStreetMap (Nominatim)
/**
 * Identity:
 *   - Public utility; no authentication or entityKey decisions involved.
 * Storage:
 *   - No Mongo _id usage; external geocoding only.
 * Notes:
 *   - Returns validation status without persisting data.
 */
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
/**
 * Identity:
 *   - Optional principal attachment via entityKey JWT; no permission checks rely on Mongo _id.
 * Storage:
 *   - Uses Mongo _id internally for query results only; responses remain workshopKey/entityKey-based.
 * Notes:
 *   - Public-safe search returning opaque identifiers.
 */
exports.searchWorkshops = async (req, res) => {
  try {
    await attachUserIfPresent(req);
    const access = resolveAccessScope(req);
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
    const shouldApplyAvailabilityFilter = availableFilter !== undefined && access.scope !== "admin";

    // Clean filter object
    const filterObj = {};
    if (cityFilter) filterObj.city = { $regex: new RegExp(escapeRegex(cityFilter), "i") };
    if (typeFilter) filterObj.type = typeFilter;
    if (coachFilter) filterObj.coach = { $regex: new RegExp(escapeRegex(coachFilter), "i") };
    if (hourFilter) filterObj.hour = { $regex: new RegExp(escapeRegex(hourFilter), "i") };
    if (dayFilter) filterObj.days = dayFilter;
    if (ageGroupFilter) filterObj.ageGroup = ageGroupFilter;
    if (shouldApplyAvailabilityFilter) filterObj.available = availableFilter;
    if (access.scope !== "admin") filterObj.adminHidden = { $ne: true };

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
      adminHidden: 1,
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

    const scoped = filtered
      .slice(0, limit)
      .map((doc) => selectWorkshopView(doc, access, { includeParticipantDetails: false }));
    return res.json(scoped);
  } catch (err) {
    console.error("❌ [searchWorkshops] Error:", err);
    res.status(500).json({
      message: "Server error performing workshop search",
      error: err.message,
    });
  }
};
