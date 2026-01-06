const test = require("node:test");
const assert = require("node:assert/strict");

const userModulePath = require.resolve("../../models/User");
const migrationPath = require.resolve("../../services/legacyAdminMigration");

test("migrateLegacyAdmins promotes role-only admins and is idempotent", async () => {
  const calls = { findFilters: [], updateCalls: [], logs: [] };

  delete require.cache[userModulePath];
  let run = 0;
  require.cache[userModulePath] = {
    id: userModulePath,
    filename: userModulePath,
    loaded: true,
    exports: {
      find: async (filter) => {
        calls.findFilters.push(filter);
        run += 1;
        if (run === 1) {
          return [
            { _id: "u1", email: "admin1@example.com", authorities: {} },
            { _id: "u2", email: "admin2@example.com", authorities: { admin: false } },
          ];
        }
        return [];
      },
      updateMany: async (filter, update) => {
        calls.updateCalls.push({ filter, update });
        return { matchedCount: 2, modifiedCount: calls.updateCalls.length === 1 ? 2 : 0 };
      },
    },
  };

  delete require.cache[migrationPath];
  const { migrateLegacyAdmins } = require("../../services/legacyAdminMigration");

  const logger = { info: (msg) => calls.logs.push(msg) };

  const firstRun = await migrateLegacyAdmins(logger);
  const secondRun = await migrateLegacyAdmins(logger);

  assert.equal(calls.findFilters.length, 2);
  assert.equal(calls.updateCalls.length, 1);
  assert.deepEqual(calls.updateCalls[0].filter.role, "admin");
  assert.deepEqual(calls.updateCalls[0].update.$set["authorities.admin"], true);
  assert.equal(firstRun.modified, 2);
  assert.equal(secondRun.modified, 0);
  assert.ok(calls.logs.some((msg) => msg.includes("Promoting legacy admin u1")));
  assert.ok(calls.logs.some((msg) => msg.includes("Promoting legacy admin u2")));
});
