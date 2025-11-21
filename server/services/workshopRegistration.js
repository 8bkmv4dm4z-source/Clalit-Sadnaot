const Workshop = require("../models/Workshop");
const User = require("../models/User");

/* ============================================================
   👤 Register User
   ============================================================ */
exports.registerUserToWorkshop = async ({ workshopId, userId }) => {
  const workshop = await Workshop.findById(workshopId);
  const user = await User.findById(userId);
  if (!workshop || !user) throw new Error("Workshop or user not found");

  if (!workshop.participants.includes(userId)) {
    workshop.participants.push(userId);
    workshop.participantsCount =
      (workshop.participants?.length || 0) + (workshop.familyRegistrations?.length || 0);
    await workshop.save();
  }

  if (!user.userWorkshopMap.includes(workshopId)) {
    user.userWorkshopMap.push(workshopId);
    await user.save();
  }

  return { changed: true, workshop };
};

/* ============================================================
   👨‍👩‍👧 Register Family Member
   ============================================================ */
exports.registerFamilyToWorkshop = async ({ workshopId, parentUserId, familyMember }) => {
  const workshop = await Workshop.findById(workshopId);
  const parentUser = await User.findById(parentUserId);
  if (!workshop || !parentUser) throw new Error("Workshop or user not found");

  // add to workshop
  workshop.familyRegistrations.push({
    parentUser: parentUserId,
    familyMemberId: familyMember._id,
    name: familyMember.name,
    relation: familyMember.relation,
    idNumber: familyMember.idNumber,
    phone: familyMember.phone,
    birthDate: familyMember.birthDate,
  });
  workshop.participantsCount =
    (workshop.participants?.length || 0) + (workshop.familyRegistrations?.length || 0);
  await workshop.save();

  // sync parent’s map
  const existing = parentUser.familyWorkshopMap.find(f =>
    String(f.familyMemberId) === String(familyMember._id)
  );
  if (existing) {
    if (!existing.workshops.some(wid => String(wid) === String(workshopId)))
      existing.workshops.push(workshopId);
  } else {
    parentUser.familyWorkshopMap.push({
      familyMemberId: familyMember._id,
      workshops: [workshopId],
    });
  }
  await parentUser.save();

  return { changed: true, workshop };
};

/* ============================================================
   ❌ Unregister User
   ============================================================ */
exports.unregisterUserFromWorkshop = async ({ workshopId, userId }) => {
  const workshop = await Workshop.findById(workshopId);
  const user = await User.findById(userId);
  if (!workshop || !user) throw new Error("Workshop or user not found");

  const before = workshop.participants.length;
  workshop.participants = workshop.participants.filter(u => String(u) !== String(userId));
  const changed = before !== workshop.participants.length;

  if (changed) {
    workshop.participantsCount =
      (workshop.participants?.length || 0) + (workshop.familyRegistrations?.length || 0);
    await workshop.save();

    user.userWorkshopMap = user.userWorkshopMap.filter(wid => String(wid) !== String(workshopId));
    await user.save();
  }

  return { changed, workshop };
};

/* ============================================================
   ❌ Unregister Family Member
   ============================================================ */
exports.unregisterFamilyFromWorkshop = async ({ workshopId, parentUserId, familyId }) => {
  const workshop = await Workshop.findById(workshopId);
  const parentUser = await User.findById(parentUserId);
  if (!workshop || !parentUser) throw new Error("Workshop or user not found");

  const before = workshop.familyRegistrations.length;
  workshop.familyRegistrations = workshop.familyRegistrations.filter(f =>
    !(String(f.familyMemberId) === String(familyId) &&
      String(f.parentUser) === String(parentUserId))
  );
  const changed = before !== workshop.familyRegistrations.length;

  if (changed) {
    workshop.participantsCount =
      (workshop.participants?.length || 0) + (workshop.familyRegistrations?.length || 0);
    await workshop.save();

    const mapEntry = parentUser.familyWorkshopMap.find(f =>
      String(f.familyMemberId) === String(familyId)
    );
    if (mapEntry) {
      mapEntry.workshops = mapEntry.workshops.filter(wid => String(wid) !== String(workshopId));
      await parentUser.save();
    }
  }

  return { changed, workshop };
};
