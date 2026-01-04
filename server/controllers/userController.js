const User = require("../models/User");
const Workshop = require("../models/Workshop");
const { sanitizeUserForResponse } = require("../utils/sanitizeUser");
const { hasAuthority } = require("../middleware/authMiddleware");
const {
  buildEntityFromUserDoc,
  buildEntityFromFamilyMemberDoc,
} = require("../services/entities/buildEntity");
const { normalizeSearchQuery } = require("../services/entities/normalize");
const { resolveEntity, resolveEntityByKey } = require("../services/entities/resolveEntity");
const { hashId } = require("../utils/hashId");
const pickFields = (obj = {}, allowed = []) =>
  allowed.reduce((acc, key) => {
    if (obj[key] !== undefined) acc[key] = obj[key];
    return acc;
  }, {});

const { runUserIntegrityAudit, getAuditSnapshot } = require("../services/auditService");
const { safeAuditLog } = require("../services/SafeAuditLog");
const { AuditEventTypes } = require("../services/AuditEventRegistry");


// Routes: /api/users/by-entity/:entityKey (legacy /:id proxies entityKey)

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

const stripPrivilegeFields = (payload = {}, actorKey = null) => {
  if (!payload || typeof payload !== "object") return;
  const stripped = [];
  for (const key of ["role", "authorities", "capabilities"]) {
    if (payload[key] !== undefined) {
      stripped.push(key);
      delete payload[key];
    }
  }
  if (stripped.length) {
    safeAuditLog({
      eventType: AuditEventTypes.SECURITY,
      subjectType: "user",
      subjectKey: actorKey || null,
      actorKey: actorKey || null,
      metadata: { action: "privileged_fields_stripped", fields: stripped },
    });
  }
};

const rejectForbiddenFields = (payload = {}, actorKey = null) => {
  stripPrivilegeFields(payload, actorKey);
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
  const isOwner =
    ownerKey && requester?.entityKey && String(ownerKey) === String(requester.entityKey);
  if (!isOwner && !isAdmin) {
    const error = new Error("Unauthorized");
    error.statusCode = 403;
    throw error;
  }
};

const formatBirthDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const asString = String(value).trim();
  if (!asString) return null;

  const [datePart] = asString.split("T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;

  const parsed = new Date(asString);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
};

const ensureEntityKey = (doc, type) => {
  if (!doc) return "";
  if (doc.entityKey) return doc.entityKey;
  if (doc._id) return hashId(type, String(doc._id));
  return "";
};

const buildMinimalIdentityResponse = (userDoc = {}) => {
  const entityKey = ensureEntityKey(userDoc, "user");
  const entities = [
    {
      entityKey,
      name: userDoc.name || "",
    },
    ...(Array.isArray(userDoc.familyMembers)
      ? userDoc.familyMembers.map((member) => ({
          entityKey: ensureEntityKey(member, "family"),
          name: member?.name || "",
        }))
      : []),
  ];

  return {
    entityKey,
    name: userDoc.name || "",
    email: userDoc.email || "",
    phone: userDoc.phone || "",
    city: userDoc.city || "",
    birthDate: formatBirthDate(userDoc.birthDate),
    entities,
  };
};

/**
 * Identity:
 *   - Resolves target via entityKey and enforces ownership or admin authority before deletion.
 * Storage:
 *   - Uses Mongo _id to remove linked workshop registrations and to delete the user document.
 * Notes:
 *   - Relies on userWorkshopMap/familyWorkshopMap for cleanup; no _id values are exposed externally.
 */
exports.deleteUser = async (req, res) => {
  try {
    rejectForbiddenFields(req.body, req.user?.entityKey);

    const entityKey = req.params.entityKey || req.params.id;
    const resolved = await resolveEntity(entityKey, { allowFamily: false });

    if (!resolved || !resolved.userDoc) {
      return res.status(404).json({ success: false, message: "Entity not found" });
    }

    const user = await User.findOne({ entityKey: resolved.userDoc.entityKey }).select(
      "entityKey userWorkshopMap familyWorkshopMap"
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "Entity not found" });
    }

    assertOwnershipOrAdmin({ ownerKey: user.entityKey, requester: req.user });

    const unregisterOps = [];

    const userWorkshops = Array.from(new Set(user.userWorkshopMap || []));
    for (const workshopId of userWorkshops) {
      unregisterOps.push(unregisterUserFromWorkshop({ workshopId, userId: user._id }));
    }

    const familyEntries = Array.isArray(user.familyWorkshopMap) ? user.familyWorkshopMap : [];
    for (const familyEntry of familyEntries) {
      const familyWorkshops = Array.from(new Set(familyEntry.workshops || []));
      for (const workshopId of familyWorkshops) {
        unregisterOps.push(
          unregisterFamilyFromWorkshop({
            workshopId,
            parentUserId: user._id,
            familyId: familyEntry.familyMemberId,
          })
        );
      }
    }

    await Promise.all(unregisterOps);

    await User.deleteOne({ _id: user._id });
    await safeAuditLog({
      eventType: AuditEventTypes.ADMIN_USER_DELETE,
      subjectType: "user",
      subjectKey: user.entityKey || resolved.userDoc.entityKey || null,
      actorKey: req.user?.entityKey,
      metadata: {
        action: "user_delete",
        adminId: req.user?.entityKey || null,
        entityId: user.entityKey || resolved.userDoc.entityKey || null,
        ip: req.ip,
      },
    });
    return res.json({
      success: true,
      message: "המשתמש וכל בני המשפחה המקושרים נמחקו",
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

/**
 * Identity:
 *   - Uses requester.entityKey to decide admin scope; ownership limited to caller’s family otherwise.
 * Storage:
 *   - Mongo _id stays inside aggregation/queries; responses return entityKey-based entities.
 * Notes:
 *   - Supports legacy ObjectId search only through admin Atlas Search, not for auth decisions.
 */
exports.searchUsers = async (req, res) => {
  try {
    const raw = (req.query.q || "").trim();
    if (!raw) return res.json([]);

    const requester = req.user;

    // NORMALIZED QUERY
    const q = normalizeSearchQuery(raw);
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || "60", 10) || 60, 200));
    const escaped = escapeRegex(q);
    const wildcardToken = `*${q}*`;

    // ONLY THESE FIELDS MAY MATCH (your rule)
    const allowedFields = [
      "name",
      "email",
      "phone",
      "city",
      "idNumber",
      "familyMembers.name",
      "familyMembers.email",
      "familyMembers.phone",
      "familyMembers.city",
      "familyMembers.idNumber",
    ];

    // ============================================================
    // ADMIN MODE — global search
    // ============================================================
  if (requester && hasAuthority(requester, "admin")) {
      let docs = [];

      try {
        docs = await User.aggregate([
          {
            $search: {
              index: "UsersIndex",
              compound: {
                should: [
                  { text: { query: q, path: allowedFields } },
                  { wildcard: { path: allowedFields, query: wildcardToken } },
                  { text: { query: q, path: allowedFields, fuzzy: { maxEdits: 1 } } },
                  { regex: { path: allowedFields, query: escaped } },
                ],
                minimumShouldMatch: 1,
              },
            },
          },
          { $limit: Math.max(limit, 40) },
          {
            $project: {
              entityKey: 1,
              name: 1, email: 1, phone: 1, idNumber: 1, city: 1, birthDate: 1,
              canCharge: 1,
              familyMembers: {
                entityKey: 1, name: 1, email: 1, phone: 1,
                idNumber: 1, city: 1, birthDate: 1, relation: 1
              },
            }
          }
        ]).exec();
      } catch (err) {
        // fallback
        const rx = new RegExp(escaped, "i");
        docs = await User.find({
          $or: [
            { name: rx }, { email: rx }, { phone: rx }, { idNumber: rx }, { city: rx },
            { "familyMembers.name": rx },
            { "familyMembers.email": rx },
            { "familyMembers.phone": rx },
            { "familyMembers.idNumber": rx },
            { "familyMembers.city": rx },
          ]
        })
        .limit(limit)
        .lean();
      }

      const flat = [];
      for (const doc of docs) collectEntitiesFromUserDoc(doc, flat);

      // FINAL FILTER enforcing your rule
      const normalized = q;
      const clientMatch = (entity) => {
        const fields = ["name", "email", "phone", "city", "idNumber"];
        return fields.some((f) => {
          if (!entity[f]) return false;
          return normalizeSearchQuery(entity[f]).includes(normalized);
        });
      };

      return res.json(flat.filter(clientMatch));
    }

    // ============================================================
    // REGULAR USER — search only inside own family
    // ============================================================
    const me = await User.findOne({ entityKey: requester.entityKey }).lean();
    if (!me) return res.status(404).json({ message: "User not found" });

    const flat = [];
    collectEntitiesFromUserDoc(me, flat);

    const normalized = q;
    const match = (entity) => {
      const fields = ["name", "email", "phone", "city", "idNumber"];
      return fields.some((f) => {
        if (!entity[f]) return false;
        return normalizeSearchQuery(entity[f]).includes(normalized);
      });
    };

    return res.json(flat.filter(match));

  } catch (err) {
    console.error("❌ searchUsers error:", err);
    res.status(500).json({
      message: "Server error performing hybrid search",
      error: err.message
    });
  }
};


/**
 * Identity:
 *   - Authenticates via req.user.entityKey supplied by JWT middleware.
 * Storage:
 *   - Looks up the user by entityKey and never uses Mongo _id for permission checks.
 * Notes:
 *   - Responds with sanitized profile fields only.
 */
// SECURITY CONTRACT:
// /getMe intentionally returns a minimal identity view.
// Roles, authorities, flags, and internal identifiers must NEVER be exposed here.
exports.getMe = async (req, res) => {
  try {
    if (!req.user?.entityKey) return res.status(401).json({ message: "Unauthorized" });

    const projection = {
      entityKey: 1,
      name: 1,
      email: 1,
      phone: 1,
      city: 1,
      birthDate: 1,
      "familyMembers.entityKey": 1,
      "familyMembers.name": 1,
      "familyMembers._id": 1,
    };

    const user = await User.findOne({ entityKey: req.user.entityKey }).select(projection).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(buildMinimalIdentityResponse(user));
  } catch (err) {
    res.status(500).json({ message: "Server error fetching user" });
  }
};


/**
 * Identity:
 *   - Requires admin authority derived from entityKey-scoped middleware.
 * Storage:
 *   - Uses Mongo _id only implicitly inside Mongoose queries; response is entityKey-centric.
 * Notes:
 *   - Delivers flattened user + family entities without exposing internal identifiers.
 */
exports.getAllUsers = async (req, res) => {
  try {
    if (!hasAuthority(req.user, "admin")) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const limit = Math.min(parseInt(req.query.limit || "1000", 10), 5000);
    // compact projection for the list
    const projection = {
      entityKey: 1,
      name: 1,
      email: 1,
      phone: 1,
      idNumber: 1,
      city: 1,
      birthDate: 1,
      canCharge: 1,
      createdAt: 1,
      updatedAt: 1,
      "familyMembers.entityKey": 1,
      "familyMembers.name": 1,
      "familyMembers.email": 1,
      "familyMembers.phone": 1,
      "familyMembers.idNumber": 1,
      "familyMembers.city": 1,
      "familyMembers.birthDate": 1,
      "familyMembers.relation": 1,
      "familyMembers.createdAt": 1,
      "familyMembers.updatedAt": 1,
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

/**
 * Identity:
 *   - Intended for admin callers validated via entityKey authorities upstream.
 * Storage:
 *   - Runs audit routines that operate on Mongo _id internally; does not expose them.
 * Notes:
 *   - Returns aggregated audit report only; no identity decisions depend on _id.
 */
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

/**
 * Identity:
 *   - Resolves entity by entityKey and enforces ownership/admin via requester.entityKey.
 * Storage:
 *   - Uses Mongo _id only inside resolution and response shaping; no auth decisions rely on it.
 * Notes:
 *   - Family member fetches are parent-key scoped to prevent cross-account access.
 */
exports.getUserById = async (req, res) => {
  try {
    const entityKey = req.params.id;
    const requester = req.user;

    if (!requester?.entityKey) return res.status(401).json({ message: "Unauthorized" });

    const resolved = await resolveEntityByKey(entityKey);
    if (!resolved) return res.status(404).json({ message: "User not found" });

    if (resolved.type === "user") {
      assertOwnershipOrAdmin({ ownerKey: resolved.userDoc.entityKey, requester });
      return res.json(sanitizeUserForResponse(resolved.userDoc, requester));
    }

    assertOwnershipOrAdmin({ ownerKey: resolved.userDoc.entityKey, requester });
    const entity = buildEntityFromFamilyMemberDoc(resolved.memberDoc, resolved.userDoc);
    return res.json(entity);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching user" });
  }
};

/**
 * Identity:
 *   - Authorizes via entityKey ownership or admin before returning any entity.
 * Storage:
 *   - Mongo _id is only used within resolveEntityByKey and Workshop data joins.
 * Notes:
 *   - Supports both user and family members without exposing ObjectIds in responses.
 */
exports.getEntityById = async (req, res) => {
  try {
    const entityKey = req.params.id;
    const requester = req.user;
    if (!requester?.entityKey) return res.status(401).json({ message: "Unauthorized" });

    const resolved = await resolveEntityByKey(entityKey);
    if (!resolved) return res.status(404).json({ message: "Entity not found" });

    if (resolved.type === "user") {
      assertOwnershipOrAdmin({ ownerKey: resolved.userDoc.entityKey, requester });
      const entity = buildEntityFromUserDoc(resolved.userDoc);
      return res.json(entity);
    }

    assertOwnershipOrAdmin({ ownerKey: resolved.userDoc.entityKey, requester });
    const entity = buildEntityFromFamilyMemberDoc(resolved.memberDoc, resolved.userDoc);
    return res.json(entity);
  } catch (err) {
    res.status(500).json({ message: "Server error fetching entity" });
  }
};

/**
 * Identity:
 *   - Admin-driven creation; caller identity validated via entityKey authorities.
 * Storage:
 *   - Persists user with Mongo _id while returning sanitized entityKey-based payload.
 * Notes:
 *   - Strips privilege fields from payload before save to avoid unauthorized role changes.
 */
exports.createUser = async (req, res) => {
  try {
    stripPrivilegeFields(req.body, req.user?.entityKey);
    const { name, email, password, city, phone, birthDate, canCharge } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists" });

    const user = new User({ name, email, city, phone, birthDate, canCharge });
    if (password) await user.setPassword(password);
    await user.save();

    await safeAuditLog({
      eventType: AuditEventTypes.ADMIN_USER_CREATE,
      subjectType: "user",
      subjectKey: user.entityKey || user.hashedId || null,
      actorKey: req.user?.entityKey,
      metadata: {
        action: "user_create",
        adminId: req.user?.entityKey || null,
        entityId: user.entityKey || user.hashedId || null,
        ip: req.ip,
      },
    });

    res.status(201).json({
      message: "User created successfully",
      user: sanitizeUserForResponse(user, req.user),
    });
  } catch (err) {
    res.status(500).json({ message: "Server error creating user" });
  }
};

/**
 * Identity:
 *   - Resolves target via entityKey and enforces owner/admin via requester.entityKey.
 * Storage:
 *   - Uses Mongo _id only to sync workshop subdocuments after updates.
 * Notes:
 *   - Rejects forbidden identity fields to keep requests entityKey-first.
 */
exports.updateEntity = async (req, res) => {
  try {
    rejectForbiddenFields(req.body, req.user?.entityKey);
    const { entityKey, updates: rawUpdates } = req.body;
    stripPrivilegeFields(rawUpdates, req.user?.entityKey);
    const requester = req.user;
    const isAdmin = hasAuthority(requester, "admin");

    if (!entityKey) return res.status(400).json({ message: "Missing entityKey" });
    if (!rawUpdates || typeof rawUpdates !== "object")
      return res.status(400).json({ message: "Missing updates payload" });

    const resolved = await resolveEntityByKey(entityKey);
    if (!resolved) return res.status(404).json({ message: "Entity not found" });

    const baseAllowedKeys = ["name", "phone", "city", "email"];
    const userAllowed = [...baseAllowedKeys, "birthDate", "idNumber"];
    const adminOnlyKeys = ["canCharge"];
    const userAllowedFields = isAdmin ? [...userAllowed, ...adminOnlyKeys] : userAllowed;
    const familyAllowed = [...baseAllowedKeys, "relation", "birthDate", "idNumber"];

  if (resolved.type === "user") {
      assertOwnershipOrAdmin({ ownerKey: resolved.userDoc.entityKey, requester });

      const updates = pickFields(rawUpdates, userAllowedFields);
      const requestedKeys = Object.keys(rawUpdates || {});
      const invalidKeys = requestedKeys.filter((key) => !userAllowedFields.includes(key));
      if (invalidKeys.length) {
        return res
          .status(403)
          .json({ message: "Some fields require admin access", fields: invalidKeys });
      }

      Object.assign(resolved.userDoc, updates);
      await resolved.userDoc.save();
      return res.json({
        success: true,
        message: "User updated successfully",
        user: sanitizeUserForResponse(resolved.userDoc, requester),
      });
    }

    const updates = pickFields(rawUpdates, familyAllowed);
    const requestedKeys = Object.keys(rawUpdates || {});
    const invalidKeys = requestedKeys.filter((key) => !familyAllowed.includes(key));
    if (invalidKeys.length) {
      return res
        .status(400)
        .json({ message: "Invalid fields for family member", fields: invalidKeys });
    }

    assertOwnershipOrAdmin({ ownerKey: resolved.userDoc.entityKey, requester });
    const member = resolved.memberDoc;
    Object.assign(member, updates);

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


/**
 * Identity:
 *   - Authorizes via entityKey ownership or admin before returning workshop summaries.
 * Storage:
 *   - Relies on Mongo _id to join participant records; responses use workshopKey/entityKey only.
 * Notes:
 *   - Supports optional familyEntityKey filter while keeping storage identifiers internal.
 */
exports.getUserWorkshopsList = async (req, res) => {
  try {
    rejectForbiddenFields(req.query, req.user?.entityKey);

    const { id } = req.params; // parent entityKey
    const familyEntityKey = req.query.familyEntityKey || null;

    const resolvedParent = await resolveEntityByKey(id);
    if (!resolvedParent || resolvedParent.type !== "user") {
      return res.status(404).json({ message: "User not found" });
    }

    assertOwnershipOrAdmin({ ownerKey: resolvedParent.userDoc.entityKey, requester: req.user });

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

    let member = null;

    const resolvedMember = await resolveEntityByKey(familyEntityKey);
    if (
      resolvedMember?.type === "familyMember" &&
      String(resolvedMember.userDoc?._id) === String(parentId)
    ) {
      member =
        memberById.get(String(resolvedMember.memberDoc?._id)) ||
        resolvedMember.memberDoc ||
        null;
    }

    if (!member) {
      member = memberByKey.get(String(familyEntityKey));
    }

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
