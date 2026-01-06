const test = require("node:test");
const assert = require("node:assert/strict");

const userModelPath = require.resolve("../../models/User");

test("authorities.admin defaults to false and persists when set", () => {
  delete require.cache[userModelPath];
  const User = require(userModelPath);

  const user = new User({ email: "authority@example.com" });
  assert.equal(user.authorities.admin, false);

  user.authorities.admin = true;
  const plain = user.toObject({ depopulate: true });

  assert.equal(plain.authorities.admin, true);
});
