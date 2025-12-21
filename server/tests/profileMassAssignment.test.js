const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || 'test-public-id-secret';

const { updateEntity } = require('../controllers/userController');

test('updateEntity ignores disallowed fields for user', async () => {
  const userId = '507f1f77bcf86cd799439011';
  const userDoc = {
    _id: userId,
    name: 'Old',
    role: 'user',
    save: async function () {
      return this;
    },
  };

  const req = {
    body: {
      entityKey: 'user-key',
      updates: { name: 'New', role: 'admin', passwordHash: 'hack' },
    },
    user: { _id: userId, role: 'user' },
  };

  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };

  const originalResolve = require('../services/entities/resolveEntity').resolveEntityByKey;
  const originalUpdateMany = require('../models/Workshop').updateMany;
  const UserModel = require('../models/User');
  const originalFindOne = UserModel.findOne;
  UserModel.findOne = async () => userDoc;
  require('../models/Workshop').updateMany = async () => ({});
  require('../services/entities/resolveEntity').resolveEntityByKey = async () => ({
    type: 'user',
    userDoc,
  });

  try {
    await updateEntity(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(userDoc.name, 'Old'); // unchanged due to rejection
    assert.equal(userDoc.role, 'user'); // unchanged
    assert.equal(userDoc.passwordHash, undefined);
  } finally {
    require('../services/entities/resolveEntity').resolveEntityByKey = originalResolve;
    require('../models/Workshop').updateMany = originalUpdateMany;
    UserModel.findOne = originalFindOne;
  }
});
