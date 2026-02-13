const mongoose = require("mongoose");
const { hashId } = require("../utils/hashId");
const { hydrateFamilyMember, hydrateParentFields } = require("../services/entities/hydration");
const { enforceResponseContract } = require("./responseGuards");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value) => UUID_REGEX.test(String(value || ""));

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

const PARTICIPANT_CONTACT_CARD_FIELDS = ["entityKey", "name", "relation", "status", "city"];
const ADMIN_CONTACT_FIELDS = ["email", "phone"];
const SENSITIVE_PARTICIPANT_FIELDS = ["birthDate", "idNumber", "canCharge"];

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

const deriveCounts = (src, { includeArrays = false, adminView = false } = {}) => {
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

  if (!adminView || !includeArrays) return counts;

  return {
    ...counts,
    participants,
    familyRegistrations,
    waitingList,
  };
};

const formatParticipant = (
  participant,
  { adminView = false, includeContactFields = false, includeSensitiveFields = false } = {}
) => {
  const isFamily = !!participant.isFamily;
  const entityKey = toEntityKey(
    isFamily ? participant.entityKey || participant.familyMemberId : participant,
    isFamily ? "family" : "user"
  );

  const base = {
    entityKey,
    name: participant.name || "",
    relation: participant.relation || (isFamily ? "" : "self"),
    status: participant.status || "registered",
    city: participant.city || "",
    birthDate: participant.birthDate || "",
    idNumber: participant.idNumber || "",
    canCharge: participant.canCharge || false,
  };

  if (adminView && includeContactFields) {
    base.email = participant.email || "";
    base.phone = participant.phone || "";
  }

  const contactFields =
    adminView && includeContactFields
      ? [...PARTICIPANT_CONTACT_CARD_FIELDS, ...ADMIN_CONTACT_FIELDS]
      : PARTICIPANT_CONTACT_CARD_FIELDS;
  const allowed =
    adminView && includeSensitiveFields
      ? [...contactFields, ...SENSITIVE_PARTICIPANT_FIELDS]
      : contactFields;
  return pickFields(base, allowed);
};

const formatWaitlistEntry = (
  entry = {},
  { adminView = false, includeContactFields = false, includeSensitiveFields = false } = {}
) => {
  const familyKey = toEntityKey(entry.familyMemberKey || entry.familyMemberId, "family");

  const dto = {
    entityKey: familyKey || null,
    name: entry.name || entry.familyMemberId?.name || "",
    relation: entry.relation || entry.familyMemberId?.relation || "",
    status: "waitlist",
    city: entry.city || entry.familyMemberId?.city || entry.parentUser?.city || "",
    birthDate: entry.birthDate || entry.familyMemberId?.birthDate || "",
    idNumber: entry.idNumber || entry.familyMemberId?.idNumber || "",
    canCharge: entry.canCharge || entry.parentUser?.canCharge || false,
  };

  if (adminView && includeContactFields) {
    dto.email = entry.email || entry.familyMemberId?.email || entry.parentUser?.email || "";
    dto.phone = entry.phone || entry.familyMemberId?.phone || entry.parentUser?.phone || "";
  }

  const contactFields =
    adminView && includeContactFields
      ? [...PARTICIPANT_CONTACT_CARD_FIELDS, ...ADMIN_CONTACT_FIELDS]
      : PARTICIPANT_CONTACT_CARD_FIELDS;
  const allowed =
    adminView && includeSensitiveFields
      ? [...contactFields, ...SENSITIVE_PARTICIPANT_FIELDS]
      : contactFields;

  return pickFields(dto, allowed);
};

const normalizeWorkshopParticipants = (
  workshop,
  { adminView = false, includeContactFields = false, includeSensitiveFields = false } = {}
) => {
  const participants = (workshop?.participants || []).map((u) =>
    formatParticipant(
      {
        ...u,
        isFamily: false,
        status: "registered",
      },
      { adminView, includeContactFields, includeSensitiveFields }
    )
  );

  const familyRegistrations = (workshop?.familyRegistrations || []).map((f) => {
    const parent = f.parentUser || {};
    const parentFields = hydrateParentFields(parent);
    const member = hydrateFamilyMember(f.familyMemberId || {}, parentFields);
    return formatParticipant(
      {
        entityKey: toEntityKey(f.familyMemberId, "family"),
        parentKey: toEntityKey(parent, "user"),
        name: f.name || member.name || "",
        relation: f.relation || member.relation || "",
        email: member.email || parentFields.email || "",
        phone: member.phone || parentFields.phone || "",
        city: member.city || parentFields.city || "",
        birthDate: member.birthDate || "",
        idNumber: member.idNumber || "",
        canCharge: parent.canCharge || false,
        isFamily: true,
        status: "registered",
      },
      { adminView, includeContactFields, includeSensitiveFields }
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

const sanitizeWaitingListEntry = (
  entry,
  { adminView = false, includeContactFields = false, includeSensitiveFields = false } = {}
) =>
  formatWaitlistEntry(
    {
      ...entry,
      familyMemberKey: entry?.familyMemberKey,
      isFamily: !!entry?.familyMemberKey || !!entry?.familyMemberId,
    },
    { adminView, includeContactFields, includeSensitiveFields }
  );

const toPublicWorkshop = (workshop) => {
  if (!workshop) return null;

  const src = toPlainWorkshop(workshop);
  const { participantsCount, familyRegistrationsCount, waitingListCount } = deriveCounts(src);
  const workshopKey = isUuid(src.workshopKey) ? src.workshopKey : null;

  const payload = {
    workshopKey,
    ...mapWorkshopCardFields(src),
    participantsCount,
    waitingListCount,
    familyRegistrationsCount,
  };

  return enforceResponseContract(payload, { context: "toPublicWorkshop", forbidContactFields: true });
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

const toUserWorkshop = (workshop, user = null) => {
  if (!workshop) return null;

  const src = toPlainWorkshop(workshop);
  const base = toPublicWorkshop(src);
  const { waitingListCount } = deriveCounts(src, { adminView: false });

  const userKey = normalizeEntityKey(user?.entityKey || src.__ownerKey);
  const directMap = src.__userRegistrationMap || new Set();
  const familyMap = src.__familyRegistrationMap || new Map();
  const workshopId = src._id ? String(src._id) : null;

  const isDirectParticipant = workshopId ? directMap.has(workshopId) : false;
  const familyEntries = workshopId ? familyMap.get(workshopId) || [] : [];
  const hasFamilyRegistration = familyEntries.length > 0;
  const myFamilyCountInWorkshop = familyEntries.length;

  const waitlisted =
    !!src.__userWaitlisted ||
    (Array.isArray(src.waitingList) &&
      src.waitingList.some((wl) => matchesUserIdentity(wl?.parentKey || wl?.parentUser, { userKey })));

  const isUserRegistered = isDirectParticipant || hasFamilyRegistration || !!src.isUserRegistered;
  const registrationStatus = isUserRegistered
    ? "registered"
    : waitlisted
      ? "waitlisted"
      : "not_registered";

  const payload = {
    ...base,
    registrationStatus,
    isUserRegistered,
    isUserInWaitlist: waitlisted,
    myFamilyCountInWorkshop,
  };

  return enforceResponseContract(payload, { context: "toUserWorkshop", forbidContactFields: true });
};

const toAdminWorkshop = (
  workshop,
  {
    includeParticipantDetails = false,
    includeContactFields = false,
    includeSensitiveFields = false,
  } = {}
) => {
  if (!workshop) return null;

  const src = toPlainWorkshop(workshop);
  const base = toPublicWorkshop(src);
  const counts = deriveCounts(src, { includeArrays: includeParticipantDetails, adminView: true });
  const payload = {
    ...base,
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
      includeContactFields,
      includeSensitiveFields,
    });
    payload.participants = participantBundle.participants;
    payload.waitingList = (counts.waitingList || []).map((wl) =>
      sanitizeWaitingListEntry(wl, {
        adminView: true,
        includeContactFields,
        includeSensitiveFields,
      })
    );
  }

  return enforceResponseContract(payload, {
    context: "toAdminWorkshop",
    allowlist: includeSensitiveFields ? ["canCharge"] : [],
  });
};

async function loadWorkshopByIdentifier(identifier, WorkshopModel) {
  if (!identifier) return null;
  const id = String(identifier).trim();

  if (isUuid(id)) {
    const byKey = await WorkshopModel.findOne({ workshopKey: id });
    if (byKey) return byKey;
  }

  if (/^[A-Za-z0-9_-]{16,}$/.test(id)) {
    const byHash = await WorkshopModel.findOne({ hashedId: id });
    if (byHash) return byHash;
  }

  if (mongoose.Types.ObjectId.isValid(id)) {
    const byObjectId = await WorkshopModel.findById(id);
    if (byObjectId) return byObjectId;
  }

  return null;
}

module.exports = {
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
};
