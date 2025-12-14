const test = require('node:test');
const assert = require('node:assert/strict');

const originalSecret = process.env.PUBLIC_ID_SECRET;
process.env.PUBLIC_ID_SECRET = originalSecret || 'test-public-id-secret';

const reloadHashUtil = () => {
  delete require.cache[require.resolve('../utils/hashId')];
  return require('../utils/hashId');
};

test('hashId output length and non-reversibility placeholder', () => {
  const { hashId } = reloadHashUtil();
  const id = '507f1f77bcf86cd799439011';
  const hashed = hashId('user', id);
  assert.equal(hashed.length, 22);
  assert.notEqual(hashed, id);
});

test('hashId changes when secret changes', () => {
  process.env.PUBLIC_ID_SECRET = 'secret-one';
  const { hashId: hashIdOne } = reloadHashUtil();
  const first = hashIdOne('user', '507f1f77bcf86cd799439011');

  process.env.PUBLIC_ID_SECRET = 'secret-two';
  const { hashId: hashIdTwo } = reloadHashUtil();
  const second = hashIdTwo('user', '507f1f77bcf86cd799439011');

  assert.notEqual(first, second);
});

test('hashId domain separation per type', () => {
  const { hashId } = reloadHashUtil();
  const sourceId = '507f1f77bcf86cd799439011';
  const userHash = hashId('user', sourceId);
  const workshopHash = hashId('workshop', sourceId);
  assert.notEqual(userHash, workshopHash);
  assert.equal(userHash, hashId('user', sourceId));
});

test('hashId throws when PUBLIC_ID_SECRET is missing', () => {
  const prior = process.env.PUBLIC_ID_SECRET;
  delete process.env.PUBLIC_ID_SECRET;
  delete require.cache[require.resolve('../utils/hashId')];
  assert.throws(() => require('../utils/hashId'), /PUBLIC_ID_SECRET is required/);
  process.env.PUBLIC_ID_SECRET = prior || 'test-public-id-secret';
});

// Restore module with original secret for downstream tests
process.env.PUBLIC_ID_SECRET = originalSecret || 'test-public-id-secret';
delete require.cache[require.resolve('../utils/hashId')];
