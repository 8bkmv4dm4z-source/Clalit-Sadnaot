const test = require("node:test");
const assert = require("node:assert/strict");

const idempotencyPath = require.resolve("../../services/idempotency");
const modelPath = require.resolve("../../models/IdempotencyKey");

const createStore = () => new Map();

const installIdempotencyModelStub = (store) => {
  require.cache[modelPath] = {
    id: modelPath,
    filename: modelPath,
    loaded: true,
    exports: {
      findOne: (query) => ({
        lean: async () => {
          const record = store.get(JSON.stringify(query));
          return record ? { ...record } : null;
        },
      }),
      create: async (doc) => {
        const key = JSON.stringify({
          keyHash: doc.keyHash,
          actorKey: doc.actorKey,
          scope: doc.scope,
          method: doc.method,
        });
        if (store.has(key)) {
          const err = new Error("duplicate");
          err.code = 11000;
          throw err;
        }
        store.set(key, { ...doc });
      },
      updateOne: async (query, update) => {
        const key = JSON.stringify({
          keyHash: query.keyHash,
          actorKey: query.actorKey,
          scope: query.scope,
          method: query.method,
        });
        const existing = store.get(key);
        if (!existing || existing.status !== query.status) return;
        store.set(key, { ...existing, ...update.$set });
      },
      deleteOne: async (query) => {
        const key = JSON.stringify({
          keyHash: query.keyHash,
          actorKey: query.actorKey,
          scope: query.scope,
          method: query.method,
        });
        const existing = store.get(key);
        if (existing && existing.status === query.status) {
          store.delete(key);
        }
      },
    },
  };
};

const buildReq = ({ key = "key-1", actor = "actor-1", baseUrl = "/api/wk", path = "/1", method = "POST" } = {}) => ({
  method,
  baseUrl,
  path,
  user: { entityKey: actor },
  get(header) {
    return header.toLowerCase() === "idempotency-key" ? key : "";
  },
});

const loadService = () => {
  delete require.cache[idempotencyPath];
  return require(idempotencyPath);
};

test("replay returns cached response for completed key", async () => {
  const store = createStore();
  installIdempotencyModelStub(store);
  const { startIdempotentRequest, finalizeIdempotentRequest } = loadService();

  const req = buildReq();
  const state = await startIdempotentRequest(req);
  await finalizeIdempotentRequest(state, 200, { success: true });

  const replay = await startIdempotentRequest(req);
  assert.equal(replay.replay, true);
  assert.equal(replay.record.responseStatus, 200);
  assert.deepEqual(replay.record.responseBody, { success: true });
});

test("duplicate in-progress keys return inProgress without creating a new record", async () => {
  const store = createStore();
  installIdempotencyModelStub(store);
  const { startIdempotentRequest } = loadService();

  const req = buildReq();
  const first = await startIdempotentRequest(req);
  assert.equal(first.inProgress, undefined);

  const second = await startIdempotentRequest(req);
  assert.equal(second.inProgress, true);
});

test("idempotency scope is isolated by actor, path, and method", async () => {
  const store = createStore();
  installIdempotencyModelStub(store);
  const { startIdempotentRequest } = loadService();

  const base = await startIdempotentRequest(buildReq({ key: "iso-key" }));
  assert.ok(base.keyHash);

  const otherActor = await startIdempotentRequest(buildReq({ key: "iso-key", actor: "actor-2" }));
  assert.equal(otherActor.inProgress, undefined);

  const otherPath = await startIdempotentRequest(buildReq({ key: "iso-key", path: "/2" }));
  assert.equal(otherPath.inProgress, undefined);

  const otherMethod = await startIdempotentRequest(buildReq({ key: "iso-key", method: "DELETE" }));
  assert.equal(otherMethod.inProgress, undefined);
});
