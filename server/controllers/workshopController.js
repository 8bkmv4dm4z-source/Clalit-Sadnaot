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

const toEntityKey = (doc, type = "user") => {
  if (!doc) return null;
  if (typeof doc === "string") return doc;
  if (doc.entityKey) return doc.entityKey;
  if (doc._id) return hashId(type, String(doc._id));
  return null;
};

const pickFields = (src = {}, allowlist = []) =>
  allowlist.reduce((acc, field) => {
    if (src[field] !== undefined) acc[field] = src[field];
    return acc;
  }, {});

const PUBLIC_PARTICIPANT_FIELDS = [
  "entityKey",
  "name",
  "isFamily",
  "parentKey",
  "relation",
  "status",
];

const ADMIN_PARTICIPANT_FIELDS = [
  ...PUBLIC_PARTICIPANT_FIELDS,
  "canCharge",
  "city",
  "email",
  "phone",
];

const SENSITIVE_PARTICIPANT_FIELDS = ["idNumber", "birthDate"];

const withAllowlist = (allowlist = [], includeSensitiveFields = false) => {
  if (!includeSensitiveFields) return allowlist;
  return [...new Set([...allowlist, ...SENSITIVE_PARTICIPANT_FIELDS])];
};

const formatParticipant = (
  participant,
  { adminView = false, includeSensitiveFields = false } = {}
) => {
  const isFamily = !!participant.isFamily;
  const entityKey = toEntityKey(
    isFamily ? participant.entityKey || participant.familyMemberId : participant,
    isFamily ? "family" : "user"
  );

  const parentKey = isFamily
    ? toEntityKey(
        participant.parentKey || participant.parentUser || participant.parent,
        "user"
      )
    : null;

  const base = {
    entityKey,
    name: participant.name || "",
    isFamily,
    parentKey,
    relation: participant.relation || (isFamily ? "" : "self"),
    status: participant.status || "registered",
    canCharge: !!participant.canCharge,
    city: participant.city || "",
    email: participant.email || "",
    phone: participant.phone || "",
  };

  if (includeSensitiveFields) {
    base.idNumber = participant.idNumber || "";
    base.birthDate = participant.birthDate || "";
  }

  if (adminView) {
    return pickFields(base, withAllowlist(ADMIN_PARTICIPANT_FIELDS, includeSensitiveFields));
  }

  return pickFields(base, withAllowlist(PUBLIC_PARTICIPANT_FIELDS, includeSensitiveFields));
};

const formatWaitlistEntry = (
  entry = {},
  { adminView = false, includeSensitiveFields = false } = {}
) => {
  const parentKey = toEntityKey(entry.parentKey || entry.parentUser, "user");
  const familyKey = toEntityKey(
    entry.familyMemberKey || entry.familyMemberId,
    "family"
  );

  const dto = {
    entityKey: familyKey || parentKey || null,
    name: entry.name || entry.familyMemberId?.name || "",
    isFamily: !!(familyKey || entry.isFamily),
    parentKey,
    relation: entry.relation || entry.familyMemberId?.relation || "",
    status: "waitlist",
    canCharge: !!(entry.parentUser?.canCharge || entry.canCharge),
    city: entry.city || entry.familyMemberId?.city || entry.parentUser?.city || "",
    email: entry.email || entry.familyMemberId?.email || entry.parentUser?.email || "",
    phone: entry.phone || entry.familyMemberId?.phone || entry.parentUser?.phone || "",
  };

  if (includeSensitiveFields) {
    dto.idNumber = entry.idNumber || entry.familyMemberId?.idNumber || "";
    dto.birthDate = entry.birthDate || entry.familyMemberId?.birthDate || "";
  }

  return pickFields(
    dto,
    adminView
      ? withAllowlist(ADMIN_PARTICIPANT_FIELDS, includeSensitiveFields)
      : withAllowlist(PUBLIC_PARTICIPANT_FIELDS, includeSensitiveFields)
  );
};

const normalizeWorkshopParticipants = (
  workshop,
  { adminView = false, includeSensitiveFields = false } = {}
) => {
  const participants = (workshop?.participants || []).map((u) =>
    formatParticipant(
      {
        ...u,
        isFamily: false,
        status: "registered",
      },
      { adminView, includeSensitiveFields }
    )
  );

  const familyRegistrations = (workshop?.familyRegistrations || []).map((f) => {
    const parent = f.parentUser || {};
    return formatParticipant(
      {
        entityKey: toEntityKey(f.familyMemberId, "family"),
        parentKey: toEntityKey(parent, "user"),
        name: f.name || "",
        relation: f.relation || "",
        email: f.email || parent.email || "",
        phone: f.phone || parent.phone || "",
        city: f.city || parent.city || "",
        idNumber: f.idNumber || f.familyMemberId?.idNumber || parent.idNumber || "",
        birthDate: f.birthDate || f.familyMemberId?.birthDate || parent.birthDate || "",
        isFamily: true,
        canCharge: !!parent.canCharge,
        status: "registered",
      },
      { adminView, includeSensitiveFields }
    );
  });

  const all = [...participants, ...familyRegistrations];
  const bundle = {
    participantsCount: all.length,
    directCount: participants.length,
    familyCount: familyRegistrations.length,
  };

  if (!adminView) return bundle;

  return {
    ...bundle,
    participants: all,
  };
};

const { safeAuditLog } = require("../services/SafeAuditLog");
const { AuditEventTypes } = require("../services/AuditEventRegistry");

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

const toPlainWorkshop = (workshop) =>
  workshop?.toObject ? workshop.toObject() : { ...(workshop || {}) };

const WORKSHOP_CARD_FIELDS = [
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
  "startTime",
  "time",
  "durationMinutes",
  "days",
  "hour",
  "price",
  "image",
  "available",
  "maxParticipants",
  "waitingListMax",
  "sessionsCount",
];

const mapWorkshopCardFields = (src = {}) => {
  const mapped = {};
  for (const field of WORKSHOP_CARD_FIELDS) {
    if (src[field] !== undefined) mapped[field] = src[field];
  }
  return mapped;
};

const deriveCounts = (src, { includeArrays = false } = {}) => {
  const participants = Array.isArray(src.participants) ? src.participants : [];
  const familyRegistrations = Array.isArray(src.familyRegistrations)
    ? src.familyRegistrations
    : [];
  const waitingList = Array.isArray(src.waitingList) ? src.waitingList : [];

  const participantsCount =
    typeof src.participantsCount === "number"
      ? src.participantsCount
      : participants.length + familyRegistrations.length;

  const familyRegistrationsCount =
    typeof src.familyRegistrationsCount === "number"
      ? src.familyRegistrationsCount
      : familyRegistrations.length;

  const waitingListCount =
    typeof src.waitingListCount === "number" ? src.waitingListCount : waitingList.length;

  const counts = {
    participantsCount,
    familyRegistrationsCount,
    waitingListCount,
  };

  if (!includeArrays) return counts;

  return {
    ...counts,
    participants,
    familyRegistrations,
    waitingList,
  };
};

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

/**
 * Identity:
 *   - No auth gating; consumes pre-filtered workshop data without using entityKey or _id for access.
 * Storage:
 *   - Reads Mongo _id only via helper counts; omits _id from responses.
 * Notes:
 *   - Produces public-safe shape for calendars and cards.
 */
const toPublicWorkshop = (workshop) => {
  if (!workshop) return null;

  const src = toPlainWorkshop(workshop);
  const {
    participantsCount,
    familyRegistrationsCount,
    waitingListCount,
  } = deriveCounts(src);
  const workshopKey = isUuid(src.workshopKey) ? src.workshopKey : null;

  return {
    workshopKey,
    ...mapWorkshopCardFields(src),
    participantsCount,
    waitingListCount,
    familyRegistrationsCount,
  };
};

/**
 * Identity:
 *   - Accepts only UUID workshopKey inputs; ignores raw Mongo _id strings.
 * Storage:
 *   - Uses Mongo _id solely after a workshopKey match to fetch the document.
 * Notes:
 *   - Ensures client-facing identifiers stay opaque.
 */
async function loadWorkshopByIdentifier(identifier) {
  if (!identifier) return null;
  const id = String(identifier).trim();

  // 🔒 STRICT: Only allow lookup by UUID workshopKey
  if (!isUuid(id)) return null;

  return Workshop.findOne({ workshopKey: id });
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
  if (entity._id) return String(entity._id);
  return null;
};

const matchesUserIdentity = (candidate, { userKey }) => {
  if (!candidate) return false;
  const normalized = normalizeEntityKey(candidate);
  return !!userKey && normalized && normalized === userKey;
};

/**
 * Identity:
 *   - Determines viewer context from entityKey (user.__ownerKey) to mark registration state.
 * Storage:
 *   - Uses Mongo _id internally to correlate registration maps; not exposed externally.
 * Notes:
 *   - Provides user-scoped view without leaking participant ObjectIds.
 */
const toUserWorkshop = (workshop, user = null) => {
  if (!workshop) return null;

  const src = toPlainWorkshop(workshop);
  const base = toPublicWorkshop(src);
  const { waitingList } = deriveCounts(src, { includeArrays: true });

  const userKey = normalizeEntityKey(user?.entityKey || src.__ownerKey);

  const directMap = src.__userRegistrationMap || new Set();
  const familyMap = src.__familyRegistrationMap || new Map();

  const workshopId = src._id ? String(src._id) : null;

  const isDirectParticipant = workshopId ? directMap.has(workshopId) : false;

  const familyEntries = workshopId ? familyMap.get(workshopId) || [] : [];
  const hasFamilyRegistration = familyEntries.length > 0;
  const myFamilyCountInWorkshop = familyEntries.length;

  const waitlisted = waitingList.some((wl) =>
    matchesUserIdentity(wl.parentKey || wl.parentUser, { userKey })
  );

  const isUserRegistered = isDirectParticipant || hasFamilyRegistration || !!src.isUserRegistered;
  const registrationStatus = isUserRegistered
    ? "registered"
    : waitlisted
      ? "waitlisted"
      : "not_registered";

  return {
    ...base,
    registrationStatus,
    isUserRegistered,
    isUserInWaitlist: waitlisted,
    myFamilyCountInWorkshop,
    isRegisteredDirect: isDirectParticipant,
    isRegisteredFamily: hasFamilyRegistration,
  };
};

const sanitizeWaitingListEntry = (
  entry,
  { adminView = false, includeSensitiveFields = false } = {}
) =>
  formatWaitlistEntry(
    {
      ...entry,
      parentKey: normalizeEntityKey(entry?.parentKey || entry?.parentUser),
      familyMemberKey: normalizeEntityKey(entry?.familyMemberKey),
      isFamily: !!entry?.familyMemberKey || !!entry?.familyMemberId,
    },
    { adminView, includeSensitiveFields }
  );

/**
 * Identity:
 *   - Assumes admin caller validated by entityKey authority checks upstream.
 * Storage:
 *   - Reads Mongo _id for participant joins but omits it from the response body.
 * Notes:
 *   - Can include participant and waitlist details while preserving entityKey boundaries.
 */
const toAdminWorkshop = (
  workshop,
  { includeParticipantDetails = false, includeSensitiveFields = false } = {}
) => {
  if (!workshop) return null;

  const src = toPlainWorkshop(workshop);
  const base = toPublicWorkshop(src);
  const counts = deriveCounts(src, { includeArrays: includeParticipantDetails });
  const payload = {
    ...base,
    adminHidden: !!src.adminHidden,
    participantsCount: counts.participantsCount,
    waitingListCount: counts.waitingListCount,
    familyRegistrationsCount: counts.familyRegistrationsCount,
    stats: {
      participantsTotal: counts.participantsCount,
      waitingListCount: counts.waitingListCount,
      familyRegistrationsCount: counts.familyRegistrationsCount,
    },
  };

  if (includeParticipantDetails) {
    const participantBundle = normalizeWorkshopParticipants(src, {
      adminView: true,
      includeSensitiveFields,
    });
    payload.participants = participantBundle.participants;
    payload.waitingList = (counts.waitingList || []).map((wl) =>
      sanitizeWaitingListEntry(wl, { adminView: true, includeSensitiveFields })
    );
  }

  return payload;
};

const resolveAccessScope = (req) => {
  if (hasAuthority(req?.user, "admin")) return { scope: "admin", principal: req.user };
  if (req?.user) return { scope: "user", principal: req.user };
  return { scope: "public", principal: null };
};

const isHiddenFromAccess = (workshop, access) =>
  access?.scope !== "admin" && !!workshop?.adminHidden;

const rejectHiddenWorkshop = (workshop, access, res) => {
  if (isHiddenFromAccess(workshop, access)) {
    res.status(404).json({ message: "Workshop not found" });
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
    const entityKey = decoded.sub || decoded.entityKey;
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
    ];

    baseSelectFields.push(
      "familyRegistrations.parentKey",
      "familyRegistrations.familyMemberKey"
    );

    if (isUserScope || isAdminScope) {
      baseSelectFields.push("waitingList.parentKey", "waitingList.familyMemberKey");
    } else {
      baseSelectFields.push("waitingList.parentKey", "waitingList.familyMemberKey");
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
        return {
          ...w,
          __ownerKey: registrationMaps.userKey,
          __userRegistrationMap: registrationMaps.directWorkshopIds,
          __familyRegistrationMap: registrationMaps.familyWorkshopMap,
        };
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
    let workshopDoc = await loadWorkshopByIdentifier(id);
    if (!workshopDoc) {
      return res.status(404).json({ message: "Workshop not found" });
    }

    if (rejectHiddenWorkshop(workshopDoc, access, res)) return;

    /* -------------------------------------------------
       3️⃣ Reload clean document (ALWAYS re-fetch)
       ------------------------------------------------- */
    const workshop = await Workshop.findById(workshopDoc._id)
      .select(
        "_id title type description ageGroup coach city address studio startDate endDate inactiveDates days hour time startTime durationMinutes price image available adminHidden maxParticipants waitingListMax sessionsCount participants familyRegistrations waitingList participantsCount workshopKey"
      )
      .lean();

    if (!workshop) {
      return res.status(404).json({ message: "Workshop not found" });
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
  try {
    const access = resolveAccessScope(req);
    const { id } = req.params;

    // 1. Strict Lookup (Returns 404 if id is not a valid workshop UUID)
    const existing = await loadWorkshopByIdentifier(id);
    if (!existing) {
      return res.status(404).json({ message: "Workshop not found" });
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
/**
 * Identity:
 *   - Admin scope enforced via entityKey-based authorities before creation.
 * Storage:
 *   - Writes workshop using Mongo _id internally; returns workshopKey/DTOs to clients.
 * Notes:
 *   - Address validation is non-blocking and does not affect identity handling.
 */
exports.createWorkshop = async (req, res) => {
  try {
    const access = resolveAccessScope(req);
    const data = { ...req.body };

    // 🧩 Required field check
    if (!data.city || !data.address) {
      return res.status(400).json({ message: "City and address are required" });
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
/**
 * Identity:
 *   - Expects admin authority validated via entityKey middleware before deletion.
 * Storage:
 *   - Uses Mongo _id to locate and delete the workshop after resolving workshopKey.
 * Notes:
 *   - Audit logging keyed by entityKey/workshopKey keeps ObjectIds internal.
 */
exports.deleteWorkshop = async (req, res) => {
  try {
    const workshopDoc = await loadWorkshopByIdentifier(req.params.id);
    if (!workshopDoc) {
      return res.status(404).json({ message: "Workshop not found" });
    }

    const ws = await Workshop.findByIdAndDelete(workshopDoc._id);
    if (!ws) return res.status(404).json({ message: "Workshop not found" });
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

    const workshopDoc = await loadWorkshopByIdentifier(req.params.id);
    if (!workshopDoc) {
      return res.status(404).json({ message: "Workshop not found" });
    }

    const limit = clampLimit(req.query.limit, 25, 100);
    const skip = clampSkip(req.query.skip);

    const workshop = await Workshop.findById(workshopDoc._id)
      .populate("participants", "name email phone city canCharge entityKey")
      .populate(
        "familyRegistrations.parentUser",
        "name email phone city canCharge entityKey"
      )
      .populate(
        "familyRegistrations.familyMemberId",
        "name relation phone email city entityKey"
      )
      .lean();

    if (!workshop) return res.status(404).json({ message: "Workshop not found" });

    const normalized = normalizeWorkshopParticipants(workshop, { adminView: true });
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
  try {
    rejectForbiddenFields(req.body);
    const access = resolveAccessScope(req);

    const workshopKey = req.params.id;
    const targetEntityKey = req.body?.entityKey || req.user?.entityKey;

    // Load workshop
    const workshop = await loadWorkshopByIdentifier(workshopKey);
    if (!workshop)
      return res.status(404).json({ message: "Workshop not found" });
    if (rejectHiddenWorkshop(workshop, access, res)) return;

    // Resolve entity
    const resolved = await resolveEntityByKey(targetEntityKey);
    if (!resolved)
      return res.status(404).json({ success: false, message: "Entity not found" });

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
        { new: true }
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
        { new: true }
      );
    }

    if (!updatedWorkshop) {
      // Re-check to return precise reason
      const latest = await Workshop.findById(workshop._id).select(
        "participants familyRegistrations waitingList waitingListMax maxParticipants participantsCount"
      );

      const dupRegistered = member
        ? latest?.familyRegistrations?.some(
            (r) =>
              String(r.familyMemberId) === String(memberId) &&
              String(r.parentUser) === String(parentId)
          )
        : latest?.participants?.some((p) => String(p) === String(parentId));

      if (dupRegistered) {
        return res
          .status(400)
          .json({ success: false, message: "Entity already registered" });
      }

      const alreadyQueued = (latest?.waitingList || []).some((w) => {
        const sameParent = String(w.parentUser) === String(parentId);
        if (member) {
          return sameParent && String(w.familyMemberId) === String(memberId);
        }
        return sameParent && !w.familyMemberId;
      });

      const noSpace =
        latest &&
        latest.maxParticipants > 0 &&
        latest.participantsCount >= latest.maxParticipants;

      if (noSpace) {
        const waitingFull =
          latest.waitingListMax > 0 &&
          latest.waitingList.length >= latest.waitingListMax;
        if (waitingFull) {
          return res.status(400).json({
            success: false,
            message: "Workshop is full and waiting list is full",
          });
        }
        if (alreadyQueued) {
          return res
            .status(400)
            .json({ success: false, message: "Entity already in waiting list" });
        }
        return exports.addEntityToWaitlist(req, res);
      }

      return res
        .status(400)
        .json({ success: false, message: "Unable to register entity" });
    }

    const workshopObjectId = updatedWorkshop._id;

    if (member) {
      const mapUpdate = await User.updateOne(
        { _id: parentId, "familyWorkshopMap.familyMemberId": memberId },
        { $addToSet: { "familyWorkshopMap.$.workshops": workshopObjectId } }
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
          }
        );
      }
    } else {
      await User.updateOne(
        { _id: parentId },
        { $addToSet: { userWorkshopMap: workshopObjectId } }
      );
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

    return res.json({
      success: true,
      workshop: selectWorkshopView(decorated, access, {
        includeParticipantDetails: false,
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
/**
 * Identity:
 *   - Resolves entity by entityKey and enforces ownership or admin before unregistering.
 * Storage:
 *   - Uses Mongo _id for workshop mutations and User map updates after auth check.
 * Notes:
 *   - Waitlist fallback delegates to addEntityToWaitlist without exposing ObjectIds.
 */
exports.unregisterEntityFromWorkshop = async (req, res) => {
  try {
    rejectForbiddenFields(req.body);
    const access = resolveAccessScope(req);

    const workshopKey = req.params.id;
    const targetEntityKey = req.body?.entityKey || req.user?.entityKey;

    const workshop = await loadWorkshopByIdentifier(workshopKey);
    if (!workshop) return res.status(404).json({ message: "Workshop not found" });
    if (rejectHiddenWorkshop(workshop, access, res)) return;

    const resolved = await resolveEntityByKey(targetEntityKey);
    if (!resolved) return res.status(404).json({ message: "Entity not found" });

    const parentUser = resolved.userDoc;
    const member = resolved.type === "familyMember" ? resolved.memberDoc : null;

    assertOwnershipOrAdmin({ ownerKey: parentUser.entityKey, requester: req.user });

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

    return res.json({
      success: true,
      changed,
      message: "Entity unregistered successfully",
      workshop: selectWorkshopView(decorated, access, {
        includeParticipantDetails: false,
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
/**
 * Identity:
 *   - Resolves target via entityKey and enforces ownership/admin before enqueueing.
 * Storage:
 *   - Uses Mongo _id for workshop updates and waitlist documents after authorization.
 * Notes:
 *   - Keeps response DTOs keyed by entityKey/workshopKey only.
 */
exports.addEntityToWaitlist = async (req, res) => {
  try {
    rejectForbiddenFields(req.body);
    const access = resolveAccessScope(req);

    const { id } = req.params;
    const targetEntityKey = req.body?.entityKey || req.user?.entityKey;

    const workshop = await loadWorkshopByIdentifier(id);
    if (!workshop)
      return res.status(404).json({ success: false, message: "Workshop not found" });
    if (rejectHiddenWorkshop(workshop, access, res)) return;

    const resolved = await resolveEntityByKey(targetEntityKey);
    if (!resolved)
      return res.status(404).json({ success: false, message: "Entity not found" });

    const parentUser = resolved.userDoc;
    const member = resolved.type === "familyMember" ? resolved.memberDoc : null;

    assertOwnershipOrAdmin({ ownerKey: parentUser.entityKey, requester: req.user });

    const parentId = parentUser._id;
    const memberId = member?._id || null;

    const capacityFilter =
      workshop.waitingListMax && workshop.waitingListMax > 0
        ? { "waitingList.waitingCount": { $lt: workshop.waitingListMax } }
        : {};

    const entry = buildRegistrationEntry({ parentUser, memberDoc: member });

    const updated = await Workshop.findOneAndUpdate(
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
      { $push: { waitingList: entry } },
      { new: true }
    );

    if (!updated) {
      const latest = await Workshop.findById(workshop._id).select("waitingList waitingListMax");
      const exists = (latest?.waitingList || []).some((e) => {
        const sameParent = String(e.parentUser) === String(parentId);
        if (member) {
          return sameParent && String(e.familyMemberId) === String(memberId);
        }
        return sameParent && !e.familyMemberId;
      });

      if (exists) {
        return res
          .status(400)
          .json({ success: false, message: "Already in waiting list" });
      }

      if (
        latest?.waitingListMax > 0 &&
        latest.waitingList.length >= latest.waitingListMax
      ) {
        return res.status(400).json({
          success: false,
          message: "Waiting list is full",
        });
      }

      return res.status(400).json({
        success: false,
        message: "Unable to add to waiting list",
      });
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

    return res.json({
      success: true,
      message: "Added to waiting list successfully",
      position: updated.waitingList.length,
      workshop: selectWorkshopView(decorated, access, {
        includeParticipantDetails: false,
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
/**
 * Identity:
 *   - Resolves entityKey target and enforces ownership or admin before removal.
 * Storage:
 *   - Uses Mongo _id internally when updating waitlist/registration arrays.
 * Notes:
 *   - Emits entityKey-focused DTOs; ObjectIds remain internal.
 */
exports.removeEntityFromWaitlist = async (req, res) => {
  try {
    rejectForbiddenFields(req.body);
    const access = resolveAccessScope(req);

    const { id } = req.params;
    const targetEntityKey = req.body?.entityKey || req.user?.entityKey;

    const workshop = await loadWorkshopByIdentifier(id);
    if (!workshop)
      return res
        .status(404)
        .json({ success: false, message: "Workshop not found" });
    if (rejectHiddenWorkshop(workshop, access, res)) return;

    const resolved = await resolveEntityByKey(targetEntityKey);
    if (!resolved)
      return res
        .status(404)
        .json({ success: false, message: "Entity not found in waiting list" });

    const parentUser = resolved.userDoc;
    const member = resolved.type === "familyMember" ? resolved.memberDoc : null;

    assertOwnershipOrAdmin({ ownerKey: parentUser.entityKey, requester: req.user });

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
      workshop: selectWorkshopView(decorated, access, {
        includeParticipantDetails: false,
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
    const baseWorkshop = await loadWorkshopByIdentifier(workshopId);
    if (!baseWorkshop) return res.status(404).json({ message: "Workshop not found" });

    const workshopDoc = await Workshop.findById(baseWorkshop._id)
      .populate("participants", "name email phone city birthDate idNumber canCharge")
      .populate("familyRegistrations.parentUser", "name email phone city canCharge")
      .populate("familyRegistrations.familyMemberId", "name relation idNumber phone birthDate")
      .populate("waitingList.parentUser", "name email phone city canCharge")
      .populate("waitingList.familyMemberId", "name relation idNumber phone birthDate email city")
      .lean();

    if (!workshopDoc) return res.status(404).json({ message: "Workshop not found" });

    const workshop = toAdminWorkshop(workshopDoc, {
      includeParticipantDetails: true,
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
    const workshopDoc = await loadWorkshopByIdentifier(id);

    if (!workshopDoc) {
      return res.status(404).json({ message: "Workshop not found" });
    }

    // 2️⃣ Load lean workshop document
    const workshop = await Workshop.findById(workshopDoc._id)
      .populate("waitingList.parentUser", "name email phone city canCharge entityKey")
      .populate("waitingList.familyMemberId", "name relation email phone city entityKey")
      .lean();
    if (!workshop) {
      return res.status(404).json({ message: "Workshop not found" });
    }

    const normalized = (workshop.waitingList || []).map((entry) =>
      formatWaitlistEntry(entry, { adminView: true })
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

    // Clean filter object
    const filterObj = {};
    if (cityFilter) filterObj.city = { $regex: new RegExp(escapeRegex(cityFilter), "i") };
    if (typeFilter) filterObj.type = typeFilter;
    if (coachFilter) filterObj.coach = { $regex: new RegExp(escapeRegex(coachFilter), "i") };
    if (hourFilter) filterObj.hour = { $regex: new RegExp(escapeRegex(hourFilter), "i") };
    if (dayFilter) filterObj.days = dayFilter;
    if (ageGroupFilter) filterObj.ageGroup = ageGroupFilter;
    if (availableFilter !== undefined) filterObj.available = availableFilter;
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
