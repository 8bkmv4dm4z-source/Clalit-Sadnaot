const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const jwt = require('jsonwebtoken');
const nodeCrypto = require('node:crypto');

process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh';
process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || 'test-public-id-secret';

const originalAppend = fs.appendFileSync;
fs.appendFileSync = () => {};

const authController = require('../controllers/authController');
const User = require('../models/User');
const RegistrationRequest = require('../models/RegistrationRequest');

const {
  sendEmail,
  setResendInstance,
  setGmailTransport,
  resetTransports,
  pruneRefreshSessions,
  recordRefreshToken,
} = authController.__test;

function createRes() {
  return {
    statusCode: 200,
    jsonData: null,
    cookies: {},
    clearedCookies: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
    cookie(name, value, options) {
      this.cookies[name] = { value, options };
      return this;
    },
    clearCookie(name, options) {
      this.clearedCookies.push({ name, options });
      return this;
    },
  };
}

test.after(() => {
  fs.appendFileSync = originalAppend;
});

test.afterEach(() => {
  resetTransports();
  setResendInstance(null);
  setGmailTransport(null);
});

test('sendEmail returns true when Resend succeeds', async () => {
  let called = false;
  setResendInstance({
    emails: {
      send: async (payload) => {
        called = true;
        assert.equal(payload.to, 'user@example.com');
        return { id: 'mock' };
      },
    },
  });

  const result = await sendEmail({
    to: 'user@example.com',
    subject: 'Test',
    text: 'Hello',
  });

  assert.equal(result, true);
  assert.equal(called, true);
});

test('sendEmail falls back to Gmail when Resend fails', async () => {
  let gmailCalled = false;
  setResendInstance({
    emails: {
      send: async () => {
        throw new Error('Resend failure');
      },
    },
  });

  setGmailTransport({
    sendMail: async (payload) => {
      gmailCalled = true;
      assert.equal(payload.to, 'user@example.com');
    },
  });

  const result = await sendEmail({
    to: 'user@example.com',
    subject: 'Test',
    text: 'Hello',
  });

  assert.equal(result, true);
  assert.equal(gmailCalled, true);
});

test('sendEmail returns false when no transports succeed', async () => {
  setResendInstance(null);
  setGmailTransport(null);

  const result = await sendEmail({
    to: 'user@example.com',
    subject: 'Test',
    text: 'Hello',
  });

  assert.equal(result, false);
});

test('verifyOtp accepts OTP with trailing whitespace', async () => {
  const originalFindOne = User.findOne;
  const saveCalls = { count: 0 };
  const userDoc = {
    _id: '507f191e810c19729de860ea',
    email: 'user@example.com',
    name: 'Test User',
    role: 'user',
    otpCode: '123456',
    otpExpires: Date.now() + 60_000,
    otpAttempts: 0,
    refreshTokens: [],
    save: async function () {
      saveCalls.count += 1;
      return this;
    },
  };

  User.findOne = () => ({
    select: async () => userDoc,
  });

  const req = {
    body: { email: 'user@example.com', otp: '123456 ' },
    headers: { 'user-agent': 'node-test' },
  };
  const res = createRes();

  try {
    await authController.verifyOtp(req, res);
  } finally {
    User.findOne = originalFindOne;
  }

  assert.equal(res.statusCode, 200);
  assert.ok(res.jsonData?.accessToken);
  assert.equal(saveCalls.count, 2);
  assert.equal(userDoc.otpCode, null);
  assert.equal(userDoc.otpExpires, null);
  assert.equal(userDoc.refreshTokens.length, 1);
  assert.equal(userDoc.refreshTokens[0].userAgent, 'node-test');
  assert.equal(typeof userDoc.refreshTokens[0].token, 'string');
  assert.equal(userDoc.refreshTokens[0].token.length, 64);
  assert.notEqual(
    userDoc.refreshTokens[0].token,
    res.cookies.refreshToken?.value
  );
  assert.equal(res.jsonData.user._id, undefined);
  assert.equal(res.jsonData.user.id, userDoc.entityKey || userDoc._id);
  assert.equal(res.jsonData.user.legacyMongoId, userDoc._id);
});

test('sendOtp returns generic success for unknown email', async () => {
  const originalFindOne = User.findOne;
  User.findOne = () => ({
    select: async () => null,
  });

  const req = { body: { email: 'missing@example.com' } };
  const res = createRes();

  try {
    await authController.sendOtp(req, res);
  } finally {
    User.findOne = originalFindOne;
  }

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.jsonData, {
    success: true,
    message: "If the account is eligible, a verification code has been sent.",
  });
});

test('verifyOtp returns generic failure for unknown email', async () => {
  const originalFindOne = User.findOne;
  User.findOne = () => ({
    select: async () => null,
  });

  const req = { body: { email: 'missing@example.com', otp: '123456' } };
  const res = createRes();

  try {
    await authController.verifyOtp(req, res);
  } finally {
    User.findOne = originalFindOne;
  }

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.jsonData, {
    message: "Invalid or expired verification code. Request a new code and try again.",
  });
});

test('requestRegistration uses generic response when user exists', async () => {
  const originalUserFindOne = User.findOne;
  const originalRegFindOne = RegistrationRequest.findOne;
  let registrationQueried = false;

  User.findOne = async () => ({ _id: 'existing-user' });
  RegistrationRequest.findOne = async () => {
    registrationQueried = true;
    return null;
  };

  const req = {
    body: { email: 'taken@example.com', name: 'Name', password: 'Passw0rd!' },
    ip: '127.0.0.1',
    headers: {},
  };
  const res = createRes();

  try {
    await authController.requestRegistration(req, res);
  } finally {
    User.findOne = originalUserFindOne;
    RegistrationRequest.findOne = originalRegFindOne;
  }

  assert.equal(registrationQueried, false);
  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.jsonData, {
    success: true,
    message: "If the registration is eligible, we started verification. Check your email for next steps.",
  });
});

test('verifyRegistrationOtp returns generic failure when request is missing', async () => {
  const originalRegFindOne = RegistrationRequest.findOne;
  RegistrationRequest.findOne = () => ({
    select: async () => null,
  });

  const req = { body: { email: 'user@example.com', otp: '123456' } };
  const res = createRes();

  try {
    await authController.verifyRegistrationOtp(req, res);
  } finally {
    RegistrationRequest.findOne = originalRegFindOne;
  }

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.jsonData, {
    message: "Registration could not be completed. Request a new code or use password reset if you already have an account.",
  });
});

test('refreshAccessToken rotates token and sets new cookie', async () => {
  const originalFindById = User.findById;

  const refreshToken = authController.generateRefreshToken({ _id: 'user-1' });
  const hashedRefresh = nodeCrypto.createHash('sha256').update(refreshToken).digest('hex');
  let saveCount = 0;

  const userDoc = {
    _id: 'user-1',
    role: 'user',
    refreshTokens: [{ token: hashedRefresh, userAgent: 'old-agent', createdAt: new Date() }],
    save: async function () {
      saveCount += 1;
      return this;
    },
  };

  User.findById = async () => userDoc;

  const req = { cookies: { refreshToken }, headers: { 'user-agent': 'new-agent' } };
  const res = createRes();

  try {
    await authController.refreshAccessToken(req, res);
  } finally {
    User.findById = originalFindById;
  }

  assert.equal(res.statusCode, 200);
  assert.ok(res.jsonData?.accessToken);
  assert.ok(res.cookies.refreshToken?.value);
  assert.notEqual(res.cookies.refreshToken.value, refreshToken);
  assert.equal(userDoc.refreshTokens.length, 1);
  assert.notEqual(userDoc.refreshTokens[0].token, hashedRefresh);
  assert.equal(saveCount >= 1, true);
});

test('refreshAccessToken detects reuse and clears family', async () => {
  const originalFindById = User.findById;

  const stolenToken = authController.generateRefreshToken({ _id: 'user-2' });
  let saveCount = 0;

  const userDoc = {
    _id: 'user-2',
    role: 'user',
    refreshTokens: [],
    save: async function () {
      saveCount += 1;
      return this;
    },
  };

  User.findById = async () => userDoc;

  const req = { cookies: { refreshToken: stolenToken }, headers: { 'user-agent': 'reuse-agent' } };
  const res = createRes();

  try {
    await authController.refreshAccessToken(req, res);
  } finally {
    User.findById = originalFindById;
  }

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.jsonData, { message: "Session invalidated. Please login again." });
  assert.equal(userDoc.refreshTokens.length, 0);
  assert.equal(saveCount >= 1, true);
});

test('pruneRefreshSessions removes expired and caps size', () => {
  const now = Date.now();
  const userDoc = {
    refreshTokens: [
      { token: 'keep-new', createdAt: new Date(now - 1000) },
      { token: 'keep-mid', createdAt: new Date(now - 2000) },
      { token: 'keep-old', createdAt: new Date(now - 3000) },
      { token: 'expired', createdAt: new Date(now - (8 * 24 * 60 * 60 * 1000)) }, // older than 7d default
      { token: 'keep-older', createdAt: new Date(now - 4000) },
      { token: 'keep-oldest', createdAt: new Date(now - 5000) },
    ],
  };

  pruneRefreshSessions(userDoc);

  assert.ok(userDoc.refreshTokens.every((rt) => rt.token !== 'expired'));
  assert.equal(userDoc.refreshTokens.length <= 5, true);
  const tokens = userDoc.refreshTokens.map((rt) => rt.token);
  assert.equal(tokens.includes('keep-new'), true);
});

test('recordRefreshToken prepends and prunes to cap', () => {
  const userDoc = { refreshTokens: [{ token: 'old', createdAt: new Date() }] };

  recordRefreshToken(userDoc, 'new-token', 'ua');

  assert.equal(userDoc.refreshTokens[0].token, 'new-token');
  assert.equal(userDoc.refreshTokens.length <= 5, true);
});
