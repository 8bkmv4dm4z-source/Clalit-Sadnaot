const Workshop = require("../../models/Workshop");
const User = require("../../models/User");
const {
  connectDatabase,
  disconnectDatabase,
  createUsers,
  createWorkshop,
  createTokenForUser,
  request,
  summarizeStatuses,
  checkWorkshopInvariants,
  cleanupRecords,
} = require("./loadTestUtils");

const RUN_ID = `reg-${Date.now()}`;

const scenarioOneCapacityRace = async () => {
  console.log("Scenario 1: Capacity race");
  const users = await createUsers(25, `${RUN_ID}-cap`);
  const workshop = await createWorkshop({
    tag: `${RUN_ID}-cap`,
    maxParticipants: 20,
    waitingListMax: 5,
  });

  const initialParticipants = users.slice(0, 19);
  workshop.participants = initialParticipants.map((u) => u._id);
  workshop.participantsCount = initialParticipants.length;
  await workshop.save();

  const contenders = users.slice(19, 39);
  const results = await Promise.all(
    contenders.map((user) =>
      request(`/api/workshops/${workshop.workshopKey}/register-entity`, {
        method: "POST",
        token: createTokenForUser(user),
        body: { entityKey: user.entityKey },
      })
    )
  );

  const refreshed = await Workshop.findById(workshop._id).lean();
  const invariant = checkWorkshopInvariants(refreshed);

  console.log("Capacity race summary:", {
    total: results.length,
    statuses: summarizeStatuses(results),
    invariants: invariant,
    participantsCount: refreshed.participantsCount,
  });

  return {
    userIds: users.map((u) => u._id),
    workshopIds: [workshop._id],
    invariants: [invariant],
  };
};

const scenarioTwoWaitlistRace = async () => {
  console.log("Scenario 2: Waitlist max race");
  const users = await createUsers(25, `${RUN_ID}-wait`);
  const workshop = await createWorkshop({
    tag: `${RUN_ID}-wait`,
    maxParticipants: 20,
    waitingListMax: 5,
  });

  workshop.participants = users.slice(0, 20).map((u) => u._id);
  workshop.participantsCount = workshop.participants.length;
  await workshop.save();

  const waitlistUsers = users.slice(20);
  const results = await Promise.all(
    waitlistUsers.map((user) =>
      request(`/api/workshops/${workshop.workshopKey}/waitlist-entity`, {
        method: "POST",
        token: createTokenForUser(user),
        body: { entityKey: user.entityKey },
      })
    )
  );

  const refreshed = await Workshop.findById(workshop._id).lean();
  const invariant = checkWorkshopInvariants(refreshed);

  console.log("Waitlist race summary:", {
    total: results.length,
    statuses: summarizeStatuses(results),
    waitingListCount: refreshed.waitingListCount,
    invariants: invariant,
  });

  return {
    userIds: users.map((u) => u._id),
    workshopIds: [workshop._id],
    invariants: [invariant],
  };
};

const scenarioThreeUnregisterPromotion = async () => {
  console.log("Scenario 3: Unregister triggers promotion");
  const users = await createUsers(25, `${RUN_ID}-promote`);
  const workshop = await createWorkshop({
    tag: `${RUN_ID}-promote`,
    maxParticipants: 20,
    waitingListMax: 5,
  });

  const participants = users.slice(0, 20);
  workshop.participants = participants.map((u) => u._id);
  workshop.participantsCount = participants.length;

  const waitlist = users.slice(20, 25);
  workshop.waitingList = waitlist.map((user) => ({
    parentUser: user._id,
    parentKey: user.entityKey,
    name: user.name,
  }));
  workshop.waitingListCount = waitlist.length;
  await workshop.save();

  const unregisterTargets = participants.slice(0, 5);
  const results = await Promise.all(
    unregisterTargets.map((user) =>
      request(`/api/workshops/${workshop.workshopKey}/unregister-entity`, {
        method: "DELETE",
        token: createTokenForUser(user),
        body: { entityKey: user.entityKey },
      })
    )
  );

  const refreshed = await Workshop.findById(workshop._id).lean();
  const invariant = checkWorkshopInvariants(refreshed);

  console.log("Unregister promotion summary:", {
    total: results.length,
    statuses: summarizeStatuses(results),
    participantsCount: refreshed.participantsCount,
    waitingListCount: refreshed.waitingListCount,
    invariants: invariant,
  });

  return {
    userIds: users.map((u) => u._id),
    workshopIds: [workshop._id],
    invariants: [invariant],
  };
};

const run = async () => {
  const resources = { userIds: [], workshopIds: [], invariants: [] };
  try {
    await connectDatabase();
    const scenario1 = await scenarioOneCapacityRace();
    const scenario2 = await scenarioTwoWaitlistRace();
    const scenario3 = await scenarioThreeUnregisterPromotion();

    resources.userIds.push(...scenario1.userIds, ...scenario2.userIds, ...scenario3.userIds);
    resources.workshopIds.push(
      ...scenario1.workshopIds,
      ...scenario2.workshopIds,
      ...scenario3.workshopIds
    );
    resources.invariants.push(
      ...scenario1.invariants,
      ...scenario2.invariants,
      ...scenario3.invariants
    );

    const invariantFailures = resources.invariants.filter((item) => !item.ok);
    if (invariantFailures.length) {
      console.warn("Invariant failures detected:", invariantFailures);
      process.exitCode = 1;
    } else {
      console.log("All invariants passed.");
    }
  } catch (err) {
    console.error("Load test failed:", err.message);
    process.exitCode = 1;
  } finally {
    await cleanupRecords(resources);
    await disconnectDatabase();
  }
};

run();
