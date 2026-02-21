const nodeCrypto = require("crypto");
const IdempotencyKey = require("../models/IdempotencyKey");

const DEFAULT_TTL_HOURS = 24;

const resolveTtlMs = () => {
  const raw = Number(process.env.IDEMPOTENCY_TTL_HOURS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TTL_HOURS * 60 * 60 * 1000;
  return raw * 60 * 60 * 1000;
};

const hashKey = (key) => nodeCrypto.createHash("sha256").update(key).digest("hex");

const resolveActorKey = (req) => req.user?.entityKey || "anonymous";

const resolveScope = (req) => {
  const base = req.baseUrl || "";
  const path = req.path || "";
  return `${base}${path}`;
};

const extractIdempotencyKey = (req) =>
  req.get("Idempotency-Key") || req.get("idempotency-key") || "";

const startIdempotentRequest = async (req, { actorKey } = {}) => {
  const key = extractIdempotencyKey(req);
  if (!key) return { key: null };

  const keyHash = hashKey(key);
  const scope = resolveScope(req);
  const method = req.method;
  const resolvedActorKey = actorKey || resolveActorKey(req);

  const existing = await IdempotencyKey.findOne({
    keyHash,
    actorKey: resolvedActorKey,
    scope,
    method,
  }).lean();

  if (existing) {
    if (existing.status === "completed") {
      return { replay: true, record: existing };
    }
    return { inProgress: true };
  }

  const expiresAt = new Date(Date.now() + resolveTtlMs());

  try {
    await IdempotencyKey.create({
      keyHash,
      actorKey: resolvedActorKey,
      scope,
      method,
      status: "in_progress",
      expiresAt,
    });
  } catch (err) {
    if (err?.code === 11000) {
      const duplicate = await IdempotencyKey.findOne({
        keyHash,
        actorKey: resolvedActorKey,
        scope,
        method,
      }).lean();
      if (duplicate?.status === "completed") {
        return { replay: true, record: duplicate };
      }
      return { inProgress: true };
    }
    throw err;
  }

  return { keyHash, actorKey: resolvedActorKey, scope, method };
};

const finalizeIdempotentRequest = async (state, status, payload) => {
  if (!state?.keyHash) return;
  if (status >= 500 || status === 409) {
    await IdempotencyKey.deleteOne({
      keyHash: state.keyHash,
      actorKey: state.actorKey,
      scope: state.scope,
      method: state.method,
      status: "in_progress",
    });
    return;
  }

  await IdempotencyKey.updateOne(
    {
      keyHash: state.keyHash,
      actorKey: state.actorKey,
      scope: state.scope,
      method: state.method,
      status: "in_progress",
    },
    {
      $set: {
        status: "completed",
        responseStatus: status,
        responseBody: payload,
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + resolveTtlMs()),
      },
    }
  );
};

const clearIdempotentRequest = async (state) => {
  if (!state?.keyHash) return;
  await IdempotencyKey.deleteOne({
    keyHash: state.keyHash,
    actorKey: state.actorKey,
    scope: state.scope,
    method: state.method,
    status: "in_progress",
  });
};

module.exports = {
  startIdempotentRequest,
  finalizeIdempotentRequest,
  clearIdempotentRequest,
};
