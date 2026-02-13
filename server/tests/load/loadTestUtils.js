const mongoose = require("mongoose");
const User = require("../../models/User");
const Workshop = require("../../models/Workshop");
const authController = require("../../controllers/authController");

const resolveDatabaseUri = () => process.env.MONGO_URI || process.env.DATABASE_URL;

const resolveDbName = () => process.env.LOADTEST_DB_NAME || "workshops_loadtest";

const connectDatabase = async () => {
  const uri = resolveDatabaseUri();
  if (!uri) {
    throw new Error("MONGO_URI or DATABASE_URL is required for load tests.");
  }
  await mongoose.connect(uri, { dbName: resolveDbName() });
};

const disconnectDatabase = async () => {
  await mongoose.disconnect();
};

const baseUrl = () => process.env.LOADTEST_BASE_URL || "http://127.0.0.1:3000";

const buildUser = (tag, index, overrides = {}) => ({
  name: `LoadTest User ${tag}-${index}`,
  email: `loadtest-${tag}-${index}@example.com`,
  phone: `050-${String(1000000 + index).slice(-7)}`,
  city: "LoadTest City",
  ...overrides,
});

const createUsers = async (count, tag, overrides = {}) => {
  const users = Array.from({ length: count }).map((_, idx) =>
    buildUser(tag, idx, overrides)
  );
  return User.insertMany(users);
};

const createWorkshop = async ({ tag, maxParticipants, waitingListMax }) => {
  return Workshop.create({
    title: `LoadTest Workshop ${tag}`,
    city: "LoadTest City",
    address: "LoadTest Address",
    days: ["Monday"],
    sessionsCount: 4,
    startDate: new Date(),
    maxParticipants,
    waitingListMax,
    participantsCount: 0,
    waitingListCount: 0,
  });
};

const createTokenForUser = (user) =>
  authController.generateAccessToken({ entityKey: user.entityKey });

const request = async (path, { method = "GET", token, body } = {}) => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, body: payload };
};

const summarizeStatuses = (results = []) => {
  const summary = new Map();
  results.forEach((res) => {
    const key = res.status ?? "unknown";
    summary.set(key, (summary.get(key) || 0) + 1);
  });
  return Object.fromEntries(summary.entries());
};

const checkWorkshopInvariants = (workshop) => {
  const participantsTotal =
    (workshop.participants?.length || 0) +
    (workshop.familyRegistrations?.length || 0);
  const waitingTotal = workshop.waitingList?.length || 0;
  const violations = [];

  if (workshop.participantsCount !== participantsTotal) {
    violations.push("participants_count_mismatch");
  }
  if (workshop.waitingListCount !== waitingTotal) {
    violations.push("waitinglist_count_mismatch");
  }
  if (workshop.participantsCount < 0 || workshop.waitingListCount < 0) {
    violations.push("negative_counts");
  }
  if (
    workshop.maxParticipants > 0 &&
    workshop.participantsCount > workshop.maxParticipants
  ) {
    violations.push("participants_exceed_max");
  }
  if (
    workshop.waitingListMax > 0 &&
    workshop.waitingListCount > workshop.waitingListMax
  ) {
    violations.push("waitlist_exceed_max");
  }

  return { ok: violations.length === 0, violations };
};

const cleanupRecords = async ({ userIds = [], workshopIds = [] } = {}) => {
  if (workshopIds.length) {
    await Workshop.deleteMany({ _id: { $in: workshopIds } });
  }
  if (userIds.length) {
    await User.deleteMany({ _id: { $in: userIds } });
  }
};

module.exports = {
  connectDatabase,
  disconnectDatabase,
  createUsers,
  createWorkshop,
  createTokenForUser,
  request,
  summarizeStatuses,
  checkWorkshopInvariants,
  cleanupRecords,
};
