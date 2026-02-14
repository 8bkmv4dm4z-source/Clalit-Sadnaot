const test = require('node:test');
const assert = require('node:assert/strict');

const { toAdminListEntity } = require('../../contracts/userContracts');

test('toAdminListEntity includes contact fields for admin list payload', () => {
  const entity = toAdminListEntity({
    entityKey: 'u_1',
    name: 'Parent',
    email: 'p@example.com',
    phone: '0501234567',
    city: 'Tel Aviv',
    birthDate: '1990-01-01',
    entityType: 'user',
    isFamily: false,
  });

  assert.equal(entity.email, 'p@example.com');
  assert.equal(entity.phone, '0501234567');
  assert.equal(entity.city, 'Tel Aviv');
  assert.equal(entity.entityType, 'user');
  assert.equal(entity.isFamily, false);
});

