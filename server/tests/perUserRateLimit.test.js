const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { perUserRateLimit, buildPerUserKey } = require('../middleware/perUserRateLimit');

test('buildPerUserKey prefers user id then email then entityKey then ip', () => {
  const reqWithUser = { user: { _id: 'abc123' }, ip: '1.1.1.1' };
  assert.equal(buildPerUserKey(reqWithUser), 'abc123');

  const reqWithEmail = { body: { email: 'USER@Example.com' }, ip: '2.2.2.2' };
  assert.equal(buildPerUserKey(reqWithEmail), 'user@example.com');

  const reqWithEntity = { body: { entityKey: 'KEY-123' }, ip: '3.3.3.3' };
  assert.equal(buildPerUserKey(reqWithEntity), 'key-123');

  const reqWithIp = { ip: '4.4.4.4' };
  assert.equal(buildPerUserKey(reqWithIp), '4.4.4.4');
});

test('perUserRateLimit enforces limits per user key', async () => {
  const app = express();
  app.use(express.json());
  app.use(
    perUserRateLimit({
      windowMs: 60 * 1000,
      limit: 1,
    })
  );
  app.post('/test', (_req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const first = await fetch(`${baseUrl}/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    assert.equal(first.status, 200);

    const second = await fetch(`${baseUrl}/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    assert.equal(second.status, 429);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
