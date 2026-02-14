const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { errors: celebrateErrors } = require("celebrate");

process.env.NODE_ENV = "test";
process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || "test-public-id-secret";

const {
  validateLogin,
  validateSendOtp,
  validateOTP,
  validateUserRegistration,
  validateUserEdit,
  validateFamilyMember,
  validateWorkshopCreate,
  validateWorkshopEdit,
  validateWorkshopRegistration,
  validateWorkshopUnregister,
  validateProfile,
} = require("../../middleware/validation");

function buildApp(validator, method = "post") {
  const app = express();
  app.use(express.json());
  app[method]("/test", validator, (_req, res) => res.json({ ok: true }));
  app.use(celebrateErrors());
  return app;
}

async function withServer(app, handler) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await handler(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postJson(baseUrl, body) {
  return fetch(`${baseUrl}/test`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function putJson(baseUrl, body) {
  return fetch(`${baseUrl}/test`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("validateLogin rejects unknown fields", async () => {
  const app = buildApp(validateLogin);
  await withServer(app, async (baseUrl) => {
    const res = await postJson(baseUrl, {
      email: "test@example.com",
      password: "test1234",
      malicious: "payload",
    });
    assert.equal(res.status, 400);
  });
});

test("validateLogin accepts captchaToken", async () => {
  const app = buildApp(validateLogin);
  await withServer(app, async (baseUrl) => {
    const res = await postJson(baseUrl, {
      email: "test@example.com",
      password: "test1234",
      captchaToken: "some-token",
    });
    assert.equal(res.status, 200);
  });
});

test("validateSendOtp rejects unknown fields", async () => {
  const app = buildApp(validateSendOtp);
  await withServer(app, async (baseUrl) => {
    const res = await postJson(baseUrl, {
      email: "test@example.com",
      evil: "injection",
    });
    assert.equal(res.status, 400);
  });
});

test("validateOTP rejects unknown fields", async () => {
  const app = buildApp(validateOTP);
  await withServer(app, async (baseUrl) => {
    const res = await postJson(baseUrl, {
      email: "test@example.com",
      otp: "123456",
      extra: "payload",
    });
    assert.equal(res.status, 400);
  });
});

test("validateWorkshopCreate rejects unknown fields", async () => {
  const app = buildApp(validateWorkshopCreate);
  await withServer(app, async (baseUrl) => {
    const res = await postJson(baseUrl, {
      title: "Test",
      city: "Tel Aviv",
      days: ["Sunday"],
      sessionsCount: 10,
      startDate: "2026-03-01",
      __proto__: { admin: true },
      malicious: "field",
    });
    assert.equal(res.status, 400);
  });
});

test("validateWorkshopCreate accepts valid body", async () => {
  const app = buildApp(validateWorkshopCreate);
  await withServer(app, async (baseUrl) => {
    const res = await postJson(baseUrl, {
      title: "Test Workshop",
      city: "Tel Aviv",
      days: ["Sunday"],
      sessionsCount: 10,
      startDate: "2026-03-01",
      maxParticipants: 20,
    });
    assert.equal(res.status, 200);
  });
});

test("validateWorkshopEdit rejects unknown fields", async () => {
  const app = buildApp(validateWorkshopEdit, "put");
  await withServer(app, async (baseUrl) => {
    const res = await putJson(baseUrl, {
      title: "Updated",
      evilField: "injection",
    });
    assert.equal(res.status, 400);
  });
});

test("validateWorkshopRegistration rejects unknown fields", async () => {
  const app = buildApp(validateWorkshopRegistration);
  await withServer(app, async (baseUrl) => {
    const res = await postJson(baseUrl, {
      entityKey: "abc123abc123",
      extra: "field",
    });
    assert.equal(res.status, 400);
  });
});

test("validateWorkshopUnregister rejects unknown fields", async () => {
  const app = buildApp(validateWorkshopUnregister, "post");
  await withServer(app, async (baseUrl) => {
    const res = await postJson(baseUrl, {
      entityKey: "abc123abc123",
      extra: "field",
    });
    assert.equal(res.status, 400);
  });
});

test("validateUserRegistration rejects unknown fields", async () => {
  const app = buildApp(validateUserRegistration);
  await withServer(app, async (baseUrl) => {
    const res = await postJson(baseUrl, {
      name: "Test",
      email: "test@example.com",
      role: "admin",
    });
    assert.equal(res.status, 400);
  });
});

test("validateUserEdit rejects unknown fields", async () => {
  const app = buildApp(validateUserEdit, "put");
  await withServer(app, async (baseUrl) => {
    const res = await putJson(baseUrl, {
      name: "Updated",
      authorities: { admin: true },
    });
    assert.equal(res.status, 400);
  });
});

test("validateFamilyMember rejects unknown fields", async () => {
  const app = buildApp(validateFamilyMember);
  await withServer(app, async (baseUrl) => {
    const res = await postJson(baseUrl, {
      name: "Child",
      evil: "field",
    });
    assert.equal(res.status, 400);
  });
});

test("validateProfile rejects unknown fields", async () => {
  const app = buildApp(validateProfile, "put");
  await withServer(app, async (baseUrl) => {
    const res = await putJson(baseUrl, {
      name: "Updated",
      authorities: { admin: true },
    });
    assert.equal(res.status, 400);
  });
});

test("validateProfile accepts valid body", async () => {
  const app = buildApp(validateProfile, "put");
  await withServer(app, async (baseUrl) => {
    const res = await putJson(baseUrl, {
      name: "Updated Name",
      phone: "0541234567",
      city: "Haifa",
    });
    assert.equal(res.status, 200);
  });
});

test("familyMemberSchema (inline in validateRegister) still allows unknown fields", async () => {
  // familyMemberSchema intentionally keeps .unknown(true)
  const { validateRegister } = require("../../middleware/validation");
  const app = buildApp(validateRegister);
  await withServer(app, async (baseUrl) => {
    const res = await postJson(baseUrl, {
      name: "Test",
      email: "test@example.com",
      password: "Test@1234",
      familyMembers: [
        { name: "Child", isOpen: true, customUiFlag: "something" },
      ],
    });
    assert.equal(res.status, 200);
  });
});
