const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || 'test-public-id-secret';

const { sanitizeUserForResponse } = require('../utils/sanitizeUser');
const { formatRegistration } = require('../controllers/workshopController');
const Workshop = require('../models/Workshop');


const baseUser = {
  _id: '507f1f77bcf86cd799439011',
  entityKey: 'parent-key',
  name: 'Parent',
  email: 'parent@example.com',
  phone: '123',
  city: 'City',
  familyMembers: [
    {
      _id: '507f191e810c19729de860ea',
      entityKey: 'child-key',
      name: 'Child',
      relation: 'child',
      birthDate: '2000-01-01',
      idNumber: '321',
      phone: '5555',
    },
  ],
};

test('sanitization hides PII for non-admin family responses', () => {
  const sanitized = sanitizeUserForResponse(baseUser, { role: 'user' });
  const child = sanitized.familyMembers[0];
  assert.ok(child);
  assert.equal(child.birthDate, undefined);
  assert.equal(child.idNumber, undefined);
});

test('sanitization includes PII for admin family responses', () => {
  const sanitized = sanitizeUserForResponse(baseUser, { role: 'admin' });
  const child = sanitized.familyMembers[0];
  assert.equal(child.birthDate, '2000-01-01');
  assert.equal(child.idNumber, '321');
});

test('formatRegistration omits sensitive waitlist fields for users', () => {
  const workshop = {
    _id: '507f1f77bcf86cd799439012',
    waitingList: [
      {
        parentKey: 'parent-key',
        name: 'Child',
        relation: 'child',
        phone: '123',
        email: 'secret@example.com',
        idNumber: '789',
        birthDate: '1990-01-01',
      },
    ],
    __ownerKey: 'parent-key',
  };

  const formatted = formatRegistration({ workshop, role: 'user' });
  const waitlistEntry = formatted.waitingList[0];
  assert.ok(waitlistEntry);
  assert.equal(waitlistEntry.phone, undefined);
  assert.equal(waitlistEntry.email, undefined);
  assert.equal(waitlistEntry.idNumber, undefined);
  assert.equal(waitlistEntry.birthDate, undefined);
});

test('formatRegistration includes sensitive waitlist fields for admins', () => {
  const workshop = {
    _id: '507f1f77bcf86cd799439013',
    waitingList: [
      {
        parentKey: 'parent-key',
        name: 'Child',
        relation: 'child',
        phone: '123',
        email: 'secret@example.com',
        idNumber: '789',
        birthDate: '1990-01-01',
      },
    ],
    __ownerKey: 'parent-key',
  };

  const formatted = formatRegistration({ workshop, role: 'admin' });
  const waitlistEntry = formatted.waitingList[0];
  assert.ok(waitlistEntry);
  assert.equal(waitlistEntry.phone, '123');
  assert.equal(waitlistEntry.email, 'secret@example.com');
  assert.equal(waitlistEntry.idNumber, '789');
  assert.equal(waitlistEntry.birthDate, '1990-01-01');
});

test('formatRegistration hides unrelated waitlist entries even for admins', () => {
  const workshop = {
    _id: '507f1f77bcf86cd799439015',
    waitingList: [
      {
        parentKey: 'another-parent',
        name: 'Hidden Child',
        relation: 'child',
        phone: '123',
      },
    ],
    __ownerKey: 'parent-key',
  };

  const formatted = formatRegistration({ workshop, role: 'admin' });
  assert.equal(formatted.waitingList.length, 0);
});

test('formatRegistration only echoes the requester in participants while keeping counts', () => {
  const ownerId = '507f1f77bcf86cd799439099';
  const workshop = {
    _id: '507f1f77bcf86cd799439098',
    participants: [
      ownerId,
      '507f1f77bcf86cd799439097',
    ],
    participantsCount: 4,
    __ownerId: ownerId,
    __ownerKey: 'owner-entity-key',
  };

  const formatted = formatRegistration({ workshop, role: 'user' });
  assert.deepEqual(formatted.participants, ['owner-entity-key']);
  assert.equal(formatted.participantsCount, 4);
});

test('loadWorkshopByIdentifier only queries public identifiers', async () => {
  const { loadWorkshopByIdentifier } = require('../controllers/workshopController');
  const identifier = '11111111-1111-4111-8111-111111111111';
  const calls = [];
  const originalFindOne = Workshop.findOne;

  Workshop.findOne = async (query) => {
    calls.push(query);
    return null;
  };

  try {
    await loadWorkshopByIdentifier(identifier);
  } finally {
    Workshop.findOne = originalFindOne;
  }

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { workshopKey: identifier });
});

test('loadWorkshopByIdentifier rejects non-uuid values', async () => {
  const { loadWorkshopByIdentifier } = require('../controllers/workshopController');
  const calls = [];
  const originalFindOne = Workshop.findOne;

  Workshop.findOne = async (query) => {
    calls.push(query);
    return null;
  };

  try {
    const result = await loadWorkshopByIdentifier('507f1f77bcf86cd799439014');
    assert.equal(result, null);
  } finally {
    Workshop.findOne = originalFindOne;
  }

  assert.equal(calls.length, 0);
});

test('formatRegistration strips internal identifiers', () => {
  const { formatRegistration } = require('../controllers/workshopController');

  const workshop = {
    _id: '507f1f77bcf86cd799439014',
    workshopKey: '22222222-2222-4222-8222-222222222222',
    hashedId: 'internal-hash',
    participants: [],
    familyRegistrations: [],
    waitingList: [],
  };

  const formatted = formatRegistration({ workshop, role: 'user' });
  assert.equal(formatted.workshopKey, workshop.workshopKey);
  assert.ok(!('_id' in formatted));
  assert.ok(!('hashedId' in formatted));
  assert.ok(!('mongoId' in formatted));
});
