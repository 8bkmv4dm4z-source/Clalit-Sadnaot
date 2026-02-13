const Workshop = require("../../models/Workshop");
const {
  connectDatabase,
  disconnectDatabase,
  createUsers,
  createWorkshop,
  createTokenForUser,
  request,
  summarizeStatuses,
  cleanupRecords,
} = require("./loadTestUtils");

const RUN_ID = `firstload-${Date.now()}`;

const run = async () => {
  const resources = { userIds: [], workshopIds: [] };
  const clientCount = Number(process.env.LOADTEST_CLIENTS || 20);
  try {
    await connectDatabase();

    const [user] = await createUsers(1, RUN_ID);
    const workshop = await createWorkshop({
      tag: RUN_ID,
      maxParticipants: 20,
      waitingListMax: 5,
    });
    resources.userIds.push(user._id);
    resources.workshopIds.push(workshop._id);

    const token = createTokenForUser(user);

    const clientTasks = Array.from({ length: clientCount }).map(() =>
      Promise.all([
        request("/api/workshops", { method: "GET" }),
        request("/api/workshops/registered", { method: "GET", token }),
        request("/api/workshops/meta/cities", { method: "GET" }),
        request("/api/users/getMe", { method: "GET", token }),
      ])
    );

    const responses = await Promise.all(clientTasks);
    const flattened = responses.flat();

    console.log("First-load burst summary:", {
      total: flattened.length,
      statuses: summarizeStatuses(flattened),
    });
  } catch (err) {
    console.error("First-load burst failed:", err.message);
    process.exitCode = 1;
  } finally {
    await cleanupRecords(resources);
    await disconnectDatabase();
  }
};

run();
