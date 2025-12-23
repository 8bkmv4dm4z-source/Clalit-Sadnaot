const test = require("node:test");
const assert = require("node:assert/strict");

const originalSecret = process.env.AUDIT_HMAC_SECRET;

const reloadHmacUtil = () => {
  delete require.cache[require.resolve("../../utils/hmacUtil")];
  return require("../../utils/hmacUtil");
};

test("hmacEntityKey produces stable digest with same secret", () => {
  process.env.AUDIT_HMAC_SECRET = "unit-test-secret";
  const { hmacEntityKey } = reloadHmacUtil();

  const first = hmacEntityKey("entity-123");
  const second = hmacEntityKey("entity-123");

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("hmacEntityKey changes when secret changes", () => {
  process.env.AUDIT_HMAC_SECRET = "secret-one";
  const { hmacEntityKey: hmacOne } = reloadHmacUtil();
  const digestOne = hmacOne("entity-123");

  process.env.AUDIT_HMAC_SECRET = "secret-two";
  const { hmacEntityKey: hmacTwo } = reloadHmacUtil();
  const digestTwo = hmacTwo("entity-123");

  assert.notEqual(digestOne, digestTwo);
});

test("hmacEntityKey throws when secret is missing", () => {
  delete process.env.AUDIT_HMAC_SECRET;
  const { hmacEntityKey } = reloadHmacUtil();
  assert.throws(() => hmacEntityKey("entity-123"), /AUDIT_HMAC_SECRET/);
});

// Restore original secret for downstream tests
process.env.AUDIT_HMAC_SECRET = originalSecret;
delete require.cache[require.resolve("../../utils/hmacUtil")];
