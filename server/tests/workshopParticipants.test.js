const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || 'test-public-id-secret';

const { hashId } = require('../utils/hashId');
const { __test } = require('../controllers/workshopController');
const { normalizeWorkshopParticipants, toEntityKey } = __test;

const KEY_RE = /^[A-Za-z0-9_-]{10,}$/;

test('toEntityKey returns deterministic public id', () => {
  const userId = '507f1f77bcf86cd799439011';
  const rawHash = hashId('user', userId);
  const key = toEntityKey({ _id: userId }, 'user');
  assert.match(key, KEY_RE);
  assert.equal(key, rawHash);
});

test('normalizeWorkshopParticipants returns only entity keys (no raw ids)', () => {
  const userId = '507f1f77bcf86cd799439011';
  const familyId = '507f191e810c19729de860ea';
  const parentHash = hashId('user', userId);
  const memberHash = hashId('family', familyId);

  const normalized = normalizeWorkshopParticipants({
    participants: [
      { _id: userId, name: 'Admin', email: 'admin@example.com' },
    ],
    familyRegistrations: [
      {
        familyMemberId: { _id: familyId, name: 'Child' },
        parentUser: { _id: userId, email: 'parent@example.com' },
        relation: 'child',
      },
    ],
  }, { adminView: true });

  const participant = normalized.participants.find((p) => p.isFamily === false);
  const family = normalized.participants.find((p) => p.isFamily === true);

  assert.ok(participant);
  assert.match(participant.entityKey, KEY_RE);
  assert.equal(participant.entityKey, parentHash);
  assert.equal(participant._id, undefined);
  assert.equal(participant.idNumber, undefined);
  assert.equal(participant.birthDate, undefined);

  assert.ok(family);
  assert.match(family.entityKey, KEY_RE);
  assert.equal(family.entityKey, memberHash);
  assert.match(family.parentKey, KEY_RE);
  assert.equal(family.parentKey, parentHash);
  assert.equal(family._id, undefined);
  assert.equal(family.familyMemberId, undefined);
  assert.equal(family.parentId, undefined);
  assert.equal(family.idNumber, undefined);
  assert.equal(family.birthDate, undefined);
});

test('normalizeWorkshopParticipants hides participant arrays for non-admin views', () => {
  const normalized = normalizeWorkshopParticipants({
    participants: [{ _id: '1', name: 'Hidden' }],
    familyRegistrations: [{ familyMemberId: { _id: '2' }, parentUser: { _id: '3' } }],
  });

  assert.equal(normalized.participants, undefined);
  assert.equal(typeof normalized.participantsCount, 'number');
});

test('normalizeWorkshopParticipants can include sensitive fields for admin exports', () => {
  const normalized = normalizeWorkshopParticipants(
    {
      participants: [
        { _id: '1', name: 'Admin', email: 'admin@example.com', idNumber: '111', birthDate: '2000-01-01' },
      ],
      familyRegistrations: [
        {
          familyMemberId: { _id: '2', name: 'Child', idNumber: '222', birthDate: '2010-02-02' },
          parentUser: { _id: '1', email: 'parent@example.com', idNumber: '111' },
          relation: 'child',
        },
      ],
    },
    { adminView: true, includeContactFields: true, includeSensitiveFields: true }
  );

  const participant = normalized.participants.find((p) => p.isFamily === false);
  assert.equal(participant.idNumber, '111');
  assert.ok(String(participant.birthDate).startsWith('2000-01-01'));

  const family = normalized.participants.find((p) => p.isFamily === true);
  assert.equal(family.idNumber, '222');
  assert.ok(String(family.birthDate).startsWith('2010-02-02'));
});
