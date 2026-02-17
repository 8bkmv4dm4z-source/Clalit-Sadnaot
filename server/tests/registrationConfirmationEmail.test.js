const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.JWT_EXPIRY = process.env.JWT_EXPIRY || "15m";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || "7d";
process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || "test-public-id-secret";

const controllerPath = require.resolve("../controllers/authController");
const userModelPath = require.resolve("../models/User");
const registrationRequestPath = require.resolve("../models/RegistrationRequest");
const emailServicePath = require.resolve("../services/emailService");
const safeAuditLogPath = require.resolve("../services/SafeAuditLog");

function createRes() {
  return {
    statusCode: 200,
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
  };
}

function resetAuthDeps() {
  [
    controllerPath,
    userModelPath,
    registrationRequestPath,
    emailServicePath,
    safeAuditLogPath,
  ].forEach((p) => delete require.cache[p]);
}

function loadController({ userFindOne, userCreate, registrationFindOne, sendEmail }) {
  resetAuthDeps();

  require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: {
      findOne: userFindOne,
      create: userCreate,
    },
  };

  require.cache[registrationRequestPath] = {
    id: registrationRequestPath,
    filename: registrationRequestPath,
    loaded: true,
    exports: {
      findOne: registrationFindOne,
    },
  };

  require.cache[emailServicePath] = {
    id: emailServicePath,
    filename: emailServicePath,
    loaded: true,
    exports: {
      sendEmail,
    },
  };

  require.cache[safeAuditLogPath] = {
    id: safeAuditLogPath,
    filename: safeAuditLogPath,
    loaded: true,
    exports: {
      safeAuditLog: async () => {},
    },
  };

  return require(controllerPath);
}

test("registerUser sends registration confirmation email after successful signup", async () => {
  const sent = [];
  const controller = loadController({
    userFindOne: async () => null,
    userCreate: async (payload) => ({
      ...payload,
      _id: "user-1",
      entityKey: "entity-user-1",
    }),
    registrationFindOne: async () => null,
    sendEmail: async (payload) => {
      sent.push(payload);
      return { success: true, id: "mail-1" };
    },
  });

  const req = {
    body: {
      name: "New User",
      email: "new-user@example.com",
      password: "Passw0rd!",
      phone: "0501234567",
      idNumber: "123456789",
    },
  };
  const res = createRes();

  await controller.registerUser(req, res);

  assert.equal(res.statusCode, 202);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "new-user@example.com");
  assert.match(sent[0].subject, /ההרשמה הושלמה בהצלחה/);
});

test("verifyRegistrationOtp sends registration confirmation email after successful OTP verification", async () => {
  const sent = [];
  const registrationDoc = {
    name: "Pending User",
    email: "pending@example.com",
    phone: "0501234567",
    passwordHash: "hash",
    idNumber: "123456789",
    birthDate: "",
    city: "",
    canCharge: false,
    familyMembers: [],
    status: "pending",
    otpCode: "123456",
    otpExpires: Date.now() + 60_000,
    otpAttempts: 0,
    expiresAt: new Date(Date.now() + 10 * 60_000),
    save: async function () {
      return this;
    },
  };

  const controller = loadController({
    userFindOne: async () => null,
    userCreate: async (payload) => ({
      ...payload,
      _id: "user-2",
      entityKey: "entity-user-2",
    }),
    registrationFindOne: () => ({
      select: async () => registrationDoc,
    }),
    sendEmail: async (payload) => {
      sent.push(payload);
      return { success: true, id: "mail-2" };
    },
  });

  const req = {
    body: {
      email: "pending@example.com",
      otp: "123456",
    },
  };
  const res = createRes();

  await controller.verifyRegistrationOtp(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "pending@example.com");
  assert.match(sent[0].subject, /ההרשמה הושלמה בהצלחה/);
});
