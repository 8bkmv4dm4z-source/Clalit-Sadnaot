const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

process.env.NODE_ENV = 'test';
process.env.DEV_ADMIN_SECRET = 'super-secret-key';
process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || 'test-public-id-secret';
const originalDevRoutesFlag = process.env.ENABLE_DEV_ROUTES;
const originalDevDestructiveFlag = process.env.ENABLE_DEV_DESTRUCTIVE;
process.env.ENABLE_DEV_ROUTES = "true";
process.env.ENABLE_DEV_DESTRUCTIVE = "true";

const User = require('../models/User');

function buildTestApp() {
  delete require.cache[require.resolve('../routes/dev')];
  const devRouter = require('../routes/dev');
  const app = express();
  app.use(express.json());
  app.use('/dev', devRouter);
  return app;
}

async function withServer(app, handler) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await handler(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test.afterEach(() => {
  User.findOneAndDelete = originalFindOneAndDelete;
  process.env.ENABLE_DEV_ROUTES = "true";
  process.env.ENABLE_DEV_DESTRUCTIVE = "true";
});

test.after(() => {
  process.env.ENABLE_DEV_ROUTES = originalDevRoutesFlag;
  process.env.ENABLE_DEV_DESTRUCTIVE = originalDevDestructiveFlag;
});

const originalFindOneAndDelete = User.findOneAndDelete;

test('fails closed when dev routes are disabled', async () => {
  process.env.ENABLE_DEV_ROUTES = "false";
  const app = buildTestApp();

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/dev/cleanup-user`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'blocked@example.com' }),
    });

    assert.equal(res.status, 404);
  });
});

test('rejects cleanup when admin secret is missing', async () => {
  const app = buildTestApp();
  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/dev/cleanup-user`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'victim@example.com' }),
    });

    const data = await res.json();
    assert.equal(res.status, 401);
    assert.match(data.message, /admin secret/i);
  });
});

test('returns 200 when cleanup succeeds with valid secret', async () => {
  let deleteCalledWith = null;
  User.findOneAndDelete = async (query) => {
    deleteCalledWith = query;
    return { _id: '123', email: query.email };
  };

  const app = buildTestApp();
  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/dev/cleanup-user`, {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        'x-dev-admin-key': process.env.DEV_ADMIN_SECRET,
      },
      body: JSON.stringify({ email: 'delete-me@example.com' }),
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(deleteCalledWith.email, 'delete-me@example.com');
    assert.equal(data.message, 'Deleted');
  });
});

test('requires destructive flag for cleanup', async () => {
  process.env.ENABLE_DEV_DESTRUCTIVE = "false";
  const app = buildTestApp();

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/dev/cleanup-user`, {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        'x-dev-admin-key': process.env.DEV_ADMIN_SECRET,
      },
      body: JSON.stringify({ email: 'cannot-delete@example.com' }),
    });

    const data = await res.json();
    assert.equal(res.status, 403);
    assert.match(data.message, /disabled/i);
  });
});

test('applies rate limiting to cleanup endpoint', async () => {
  User.findOneAndDelete = async (query) => ({ _id: '123', email: query.email });
  const app = buildTestApp();

  await withServer(app, async (baseUrl) => {
    const headers = {
      'content-type': 'application/json',
      'x-dev-admin-key': process.env.DEV_ADMIN_SECRET,
    };

    const allowedEmails = ['one', 'two', 'three', 'four', 'five'];
    for (const email of allowedEmails) {
      await fetch(`${baseUrl}/dev/cleanup-user`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ email: `${email}@example.com` }),
      });
    }

    const res = await fetch(`${baseUrl}/dev/cleanup-user`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ email: 'blocked@example.com' }),
    });

    const data = await res.json();
    assert.equal(res.status, 429);
    assert.match(data.message, /too many cleanup/i);
  });
});
