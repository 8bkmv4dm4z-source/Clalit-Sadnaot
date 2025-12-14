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
  };

  const formatted = formatRegistration({ workshop, role: 'admin' });
  const waitlistEntry = formatted.waitingList[0];
  assert.ok(waitlistEntry);
  assert.equal(waitlistEntry.phone, '123');
  assert.equal(waitlistEntry.email, 'secret@example.com');
  assert.equal(waitlistEntry.idNumber, '789');
  assert.equal(waitlistEntry.birthDate, '1990-01-01');
});

test('loadWorkshopByIdentifier only queries public identifiers', async () => {
  const { loadWorkshopByIdentifier } = require('../controllers/workshopController');
  const identifier = '507f1f77bcf86cd799439014';
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
  assert.deepEqual(calls[0], {
    $or: [
      { hashedId: identifier },
      { workshopKey: identifier },
    ],
  });
});
