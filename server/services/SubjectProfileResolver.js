const User = require("../models/User");
const Workshop = require("../models/Workshop");

const USER_SUBJECT_TYPES = new Set(["user", "familyMember"]);

const resolveSubjectProfiles = async (assessments = []) => {
  if (!assessments.length) return assessments;

  const userKeys = new Set();
  const workshopKeys = new Set();

  for (const assessment of assessments) {
    const key = assessment?.subjectKey;
    if (!key || key === "system") continue;
    if (USER_SUBJECT_TYPES.has(assessment.subjectType)) {
      userKeys.add(key);
    } else if (assessment.subjectType === "workshop") {
      workshopKeys.add(key);
    }
  }

  const profileMap = new Map();

  if (userKeys.size > 0) {
    try {
      const keys = [...userKeys];
      const users = await User.find({
        $or: [{ entityKey: { $in: keys } }, { hashedId: { $in: keys } }],
      })
        .select("name email city entityKey hashedId")
        .lean();
      for (const user of users) {
        const resolvedKey = user.entityKey || user.hashedId;
        if (resolvedKey) {
          profileMap.set(resolvedKey, {
            displayName: [user.name?.first, user.name?.last].filter(Boolean).join(" ") || "Unknown User",
            email: user.email || "",
            subjectType: "user",
          });
          if (user.hashedId && user.hashedId !== resolvedKey) {
            profileMap.set(user.hashedId, profileMap.get(resolvedKey));
          }
          if (user.entityKey && user.entityKey !== resolvedKey) {
            profileMap.set(user.entityKey, profileMap.get(resolvedKey));
          }
        }
      }
    } catch (err) {
      console.warn("[SubjectProfileResolver] user lookup failed", err?.message || err);
    }
  }

  if (workshopKeys.size > 0) {
    try {
      const keys = [...workshopKeys];
      const workshops = await Workshop.find({ hashedId: { $in: keys } })
        .select("title city hashedId")
        .lean();
      for (const ws of workshops) {
        if (ws.hashedId) {
          profileMap.set(ws.hashedId, {
            displayName: ws.title || "Unknown Workshop",
            email: ws.city || "",
            subjectType: "workshop",
          });
        }
      }
    } catch (err) {
      console.warn("[SubjectProfileResolver] workshop lookup failed", err?.message || err);
    }
  }

  return assessments.map((assessment) => ({
    ...assessment,
    subjectProfile: profileMap.get(assessment?.subjectKey) || null,
  }));
};

module.exports = { resolveSubjectProfiles };
