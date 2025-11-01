const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh';

const originalAppend = fs.appendFileSync;
fs.appendFileSync = () => {};

const authController = require('../controllers/authController');
const User = require('../models/User');

const {
  sendEmail,
  setResendInstance,
  setGmailTransport,
  resetTransports,
} = authController.__test;

function createRes() {
  return {
    statusCode: 200,
    jsonData: null,
    cookies: {},
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
    clearCookie() {
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
});
