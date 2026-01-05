import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeMePayload } from '../../src/utils/entityTypes.js'

test('normalizeMePayload unwraps /getme envelope and strips privileged fields', () => {
  const payload = {
    success: true,
    data: {
      entityKey: 'user-123',
      name: 'Alice Example',
      email: 'alice@example.com',
      isAdmin: true,
      role: 'admin',
      roleFingerprint: 'should-be-dropped',
      authorities: { admin: true },
      birthDate: '2000-01-01',
      entities: [
        { entityKey: 'user-123', role: 'admin', authorities: { admin: true } },
        { entityKey: 'family-1', parentKey: 'user-123', role: 'user' },
      ],
    },
  }

  const normalized = normalizeMePayload(payload)
  assert.equal(normalized.entityKey, 'user-123')
  assert.equal(normalized.name, 'Alice Example')
  assert.equal(normalized.email, 'alice@example.com')
  assert.equal(normalized.isAdmin, true)
  assert.equal('role' in normalized, false)
  assert.equal('authorities' in normalized, false)
  normalized.entities.forEach((entity) => {
    assert.equal(entity.role, undefined)
    assert.equal(entity.authorities, undefined)
  })
  assert.equal(normalized.familyMembers.length, 1)
  assert.equal(normalized.familyMembers[0].entityKey, 'family-1')
  assert.equal(normalized.familyMembers[0].parentKey, 'user-123')
})

test('normalizeMePayload returns null when no entityKey is present', () => {
  const normalized = normalizeMePayload({ success: true, data: {} })
  assert.equal(normalized, null)
})
