const test = require("node:test");
const assert = require("node:assert/strict");
const { scrub } = require("../../utils/logScrub");

test("scrubs Bearer tokens", () => {
  const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig";
  assert.equal(scrub(input), "Authorization: Bearer ***");
});

test("scrubs password fields in JSON strings", () => {
  const input = '{"password":"super-secret-123"}';
  assert.equal(scrub(input), '{"password":"***"}');
});

test("scrubs token fields in JSON strings", () => {
  const input = '{"token":"abc123"}';
  assert.equal(scrub(input), '{"token":"***"}');
});

test("scrubs PII email field in JSON strings", () => {
  const input = '{"email":"user@example.com"}';
  assert.equal(scrub(input), '{"email":"***"}');
});

test("scrubs PII phone field in JSON strings", () => {
  const input = '{"phone":"0541234567"}';
  assert.equal(scrub(input), '{"phone":"***"}');
});

test("scrubs PII idNumber field in JSON strings", () => {
  const input = '{"idNumber":"123456789"}';
  assert.equal(scrub(input), '{"idNumber":"***"}');
});

test("scrubs PII birthDate field in JSON strings", () => {
  const input = '{"birthDate":"1990-01-15"}';
  assert.equal(scrub(input), '{"birthDate":"***"}');
});

test("scrubs raw email addresses in non-JSON output", () => {
  const input = "User logged in: admin@company.co.il from 10.0.0.1";
  assert.match(scrub(input), /\[REDACTED_EMAIL\]/);
  assert.ok(!scrub(input).includes("admin@company.co.il"));
});

test("does NOT scrub non-PII keys like workshopId", () => {
  const input = '{"workshopId":"abc123","title":"Yoga"}';
  assert.equal(scrub(input), input);
});

test("does NOT scrub non-PII keys like sessionId", () => {
  const input = '{"sessionId":"sess-xyz"}';
  assert.equal(scrub(input), input);
});

test("handles undefined/empty input", () => {
  assert.equal(scrub(), "");
  assert.equal(scrub(""), "");
});

test("scrubs multiple sensitive fields in one string", () => {
  const input = '{"email":"a@b.com","password":"secret","name":"John"}';
  const result = scrub(input);
  assert.ok(result.includes('"email":"***"'));
  assert.ok(result.includes('"password":"***"'));
  assert.ok(result.includes('"name":"John"'));
});
