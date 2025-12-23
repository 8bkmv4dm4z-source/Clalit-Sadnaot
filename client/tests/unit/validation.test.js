import assert from 'node:assert/strict'
import test from 'node:test'

import {
  validateIsraeliId,
  validatePasswordComplexity,
} from '../../src/utils/validation.js'

test('validatePasswordComplexity accepts a valid password', () => {
  const result = validatePasswordComplexity('Strong!Pass1')
  assert.equal(result.valid, true)
  assert.equal(result.message, '')
})

test('validatePasswordComplexity rejects password shorter than 10 characters', () => {
  const result = validatePasswordComplexity('Abc!12')
  assert.equal(result.valid, false)
  assert.match(result.message, /8/)
})

test('validatePasswordComplexity rejects password without uppercase letters', () => {
  const result = validatePasswordComplexity('weak!pass1')
  assert.equal(result.valid, false)
  assert.match(result.message, /אות אחת גדולה/)
})

test('validatePasswordComplexity rejects password without special characters', () => {
  const result = validatePasswordComplexity('StrongPass1')
  assert.equal(result.valid, false)
  assert.match(result.message, /תו מיוחד/)
})

test('validatePasswordComplexity rejects password without digits', () => {
  const result = validatePasswordComplexity('Strong!Pass')
  assert.equal(result.valid, false)
  assert.match(result.message, /ספרה אחת/)
})

test('validateIsraeliId accepts a valid ID', () => {
  const result = validateIsraeliId('123456782')
  assert.equal(result.valid, true)
  assert.equal(result.message, '')
})

test('validateIsraeliId rejects invalid checksum', () => {
  const result = validateIsraeliId('123456780')
  assert.equal(result.valid, false)
  assert.match(result.message, /אינו תקין/)
})

test('validateIsraeliId rejects invalid length', () => {
  const result = validateIsraeliId('1234')
  assert.equal(result.valid, false)
  assert.match(result.message, /אינו תקין/)
})
