const test = require("node:test");
const assert = require("node:assert/strict");

const userModulePath = require.resolve("../../models/User");
const migrationPath = require.resolve("../../services/legacyAdminMigration");

test("migrateLegacyAdmins promotes role-only admins and is idempotent", async () => {
  const calls = [];

  delete require.cache[userModulePath];
  require.cache[userModulePath] = {
    id: userModulePath,
    filename: userModulePath,
    loaded: true,
    exports: {
      updateMany: async (filter, update) => {
        calls.push({ filter, update });
        return { matchedCount: 2, modifiedCount: calls.length === 1 ? 2 : 0 };
      },
    },
  };

  delete require.cache[migrationPath];
  const { migrateLegacyAdmins } = require("../../services/legacyAdminMigration");

  const firstRun = await migrateLegacyAdmins({ info() {} });
  const secondRun = await migrateLegacyAdmins({ info() {} });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].filter.role, "admin");
  assert.deepEqual(calls[0].update.$set["authorities.admin"], true);
  assert.equal(firstRun.modified, 2);
  assert.equal(secondRun.modified, 0);
});
