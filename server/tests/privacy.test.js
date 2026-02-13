const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || 'test-public-id-secret';

const { sanitizeUserForResponse } = require('../utils/sanitizeUser');
const {
  toPublicWorkshop,
  toUserWorkshop,
  toAdminWorkshop,
  loadWorkshopByIdentifier,
} = require('../controllers/workshopController');
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

test('sanitization strips role/authorities even when present', () => {
  const sanitized = sanitizeUserForResponse(
    { ...baseUser, role: 'admin', authorities: { admin: true } },
    { authorities: { admin: true } },
    { scope: 'profile' }
  );

  assert.equal(sanitized.role, undefined);
  assert.equal(sanitized.authorities, undefined);
  sanitized.entities.forEach((entity) => {
    assert.equal(entity.role, undefined);
    assert.equal(entity.authorities, undefined);
  });
});

test('sanitization includes PII for admin family responses', () => {
  const sanitized = sanitizeUserForResponse(baseUser, { authorities: { admin: true } });
  const child = sanitized.familyMembers[0];
  assert.equal(child.birthDate, '2000-01-01');
  assert.equal(child.idNumber, '321');
});

test('profile scope strips role and flattens family entities with keys', () => {
  const scoped = sanitizeUserForResponse(
    { ...baseUser, role: 'admin', passwordHash: 'secret' },
    { authorities: { admin: true }, entityKey: 'admin-key' },
    { scope: 'profile' }
  );

  assert.equal(scoped.role, undefined);
  assert.ok(scoped.entities?.length === 2);

  const [selfEntity, familyEntity] = scoped.entities;
  assert.equal(selfEntity.entityKey, 'parent-key');
  assert.equal(familyEntity.entityKey, 'child-key');
  assert.equal(familyEntity.parentKey, 'parent-key');
});

test('sanitization strips admin metadata from payloads', () => {
  const scoped = sanitizeUserForResponse(
    { ...baseUser, role: 'admin', authorities: { admin: true } },
    { authorities: { admin: true }, entityKey: 'admin-key' },
    { scope: 'profile' }
  );

  assert.ok(!('isAdmin' in scoped));
  assert.equal(scoped.access, undefined);
  assert.equal(scoped.roleFingerprint, undefined);
});

test('toPublicWorkshop strips internal identifiers and relational arrays', () => {
  const workshop = {
    _id: '507f1f77bcf86cd799439012',
    workshopKey: '11111111-1111-4111-8111-111111111111',
    participants: [{ _id: '1', entityKey: 'user-1' }],
    familyRegistrations: [{ _id: '2', entityKey: 'family-1' }],
    waitingList: [{ _id: '3', entityKey: 'wl-1' }],
    participantsCount: 3,
  };

  const scoped = toPublicWorkshop(workshop);
  assert.equal(scoped.workshopKey, workshop.workshopKey);
  assert.ok(!('_id' in scoped));
  assert.equal(scoped.participants, undefined);
  assert.equal(scoped.familyRegistrations, undefined);
  assert.equal(scoped.waitingList, undefined);
  assert.equal(scoped.participantsCount, 3);
});

test('toUserWorkshop reports registration state without exposing other entities', () => {
  const user = { _id: '507f1f77bcf86cd799439099', entityKey: 'owner-key' };
  const workshop = {
    _id: '507f1f77bcf86cd799439200',
    workshopKey: '22222222-2222-4222-8222-222222222222',
    __userRegistrationMap: new Set(['507f1f77bcf86cd799439200']),
    __familyRegistrationMap: new Map(),
    waitingList: [
      {
        parentUser: '507f1f77bcf86cd799439000',
        phone: '123',
        email: 'secret@example.com',
      },
    ],
  };

  const scoped = toUserWorkshop(workshop, user);
  assert.equal(scoped.registrationStatus, 'registered');
  assert.equal(scoped.isUserRegistered, true);
  assert.equal(scoped.isUserInWaitlist, false);
  assert.equal(scoped.waitingListCount, 1);
  assert.equal(scoped.waitingList, undefined);
});

test('toAdminWorkshop retains participant linkage and waitlist contact data', () => {
  const workshop = {
    workshopKey: '33333333-3333-4333-8333-333333333333',
    participants: [{ entityKey: 'user-key', name: 'User', email: 'user@example.com', phone: '123' }],
    familyRegistrations: [
      {
        parentUser: { entityKey: 'parent-key' },
        familyMemberId: { entityKey: 'child-key', name: 'Child', relation: 'child' },
      },
    ],
    waitingList: [
      {
        parentUser: { entityKey: 'parent-key', phone: '321', email: 'p@example.com' },
        familyMemberId: { entityKey: 'child-key', name: 'Child' },
        phone: '999',
      },
    ],
  };

  const scoped = toAdminWorkshop(workshop, {
    includeParticipantDetails: true,
    includeContactFields: true,
  });
  assert.ok(Array.isArray(scoped.participants));
  assert.equal(scoped.participants[0].email, 'user@example.com');
  assert.equal(scoped.familyRegistrationsCount, 1);
  assert.equal(scoped.waitingList.length, 1);
  assert.equal(scoped.waitingList[0].phone, '999');
  assert.equal(scoped.waitingList[0].email, 'p@example.com');
  assert.equal(scoped.adminHidden, false);
  assert.ok(!('_id' in scoped));
  assert.ok(!('_id' in scoped.waitingList[0]));
});

test('toAdminWorkshop retains adminHidden visibility flag for admins', () => {
  const workshop = {
    workshopKey: '77777777-7777-4777-8777-777777777777',
    adminHidden: true,
    participants: [],
    familyRegistrations: [],
    waitingList: [],
  };

  const scoped = toAdminWorkshop(workshop);
  assert.equal(scoped.adminHidden, true);
});

test('loadWorkshopByIdentifier only queries public identifiers', async () => {
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

test('toPublicWorkshop strips internal identifiers', () => {
  const workshop = {
    _id: '507f1f77bcf86cd799439014',
    workshopKey: '22222222-2222-4222-8222-222222222222',
    hashedId: 'internal-hash',
    participants: [],
    familyRegistrations: [],
    waitingList: [],
  };

  const formatted = toPublicWorkshop(workshop);
  assert.equal(formatted.workshopKey, workshop.workshopKey);
  assert.ok(!('_id' in formatted));
  assert.ok(!('hashedId' in formatted));
  assert.ok(!('mongoId' in formatted));
});

test('Public and User workshop DTOs omit forbidden fields', () => {
  const workshop = {
    _id: '507f1f77bcf86cd799439099',
    workshopKey: '55555555-5555-4555-8555-555555555555',
    participants: [{ _id: '1', entityKey: 'user-1' }],
    familyRegistrations: [{ familyMemberId: '2', parentUser: '3', idNumber: '321', birthDate: '2000-01-01' }],
    waitingList: [{ parentUser: '3', familyMemberId: '2', idNumber: '123', birthDate: '2010-01-01' }],
    participantsCount: 2,
  };

  const userMaps = {
    __userRegistrationMap: new Set(['507f1f77bcf86cd799439099']),
    __familyRegistrationMap: new Map(),
  };

  const forbidden = ["_id", "participants", "familyRegistrations", "waitingList", "parentUser", "familyMemberId", "idNumber", "birthDate"];

  const publicDto = toPublicWorkshop(workshop);
  forbidden.forEach((key) => assert.equal(key in publicDto, false));
  assert.equal(publicDto.workshopKey, workshop.workshopKey);

  const userDto = toUserWorkshop({ ...workshop, ...userMaps }, { _id: '3', entityKey: 'user-3' });
  forbidden.forEach((key) => assert.equal(key in userDto, false));
  assert.equal(userDto.workshopKey, workshop.workshopKey);
});

test('Admin DTO and participant normalization avoid Mongo IDs and PII', () => {
  const workshop = {
    workshopKey: '66666666-6666-4666-8666-666666666666',
    participants: [{ _id: '1', name: 'Admin', idNumber: '123', birthDate: '2000-01-01' }],
    familyRegistrations: [
      { parentUser: { _id: '10', entityKey: 'parent-key', phone: '123' }, familyMemberId: { _id: '11', entityKey: 'child-key', idNumber: '987', birthDate: '2012-01-01' }, phone: '555' },
    ],
    waitingList: [
      { parentKey: 'parent-key', familyMemberKey: 'child-key', idNumber: '999', birthDate: '2013-01-01', phone: '444' },
    ],
  };

  const scoped = toAdminWorkshop(workshop, { includeParticipantDetails: true });
  assert.ok(Array.isArray(scoped.participants));
  scoped.participants.forEach((p) => {
    assert.equal(p._id, undefined);
    assert.equal(p.idNumber, undefined);
    assert.equal(p.birthDate, undefined);
  });

  assert.ok(Array.isArray(scoped.waitingList));
  scoped.waitingList.forEach((wl) => {
    assert.equal(wl.parentUser, undefined);
    assert.equal(wl.familyMemberId, undefined);
    assert.equal(wl.idNumber, undefined);
    assert.equal(wl.birthDate, undefined);
  });

  assert.equal(scoped.workshopKey, workshop.workshopKey);
});
