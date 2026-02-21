const test = require("node:test");
const assert = require("node:assert/strict");

const servicePath = require.resolve("../../services/risk/RiskReviewerService");
const modelPath = require.resolve("../../models/RiskAssessment");
const hmacPath = require.resolve("../../utils/hmacUtil");
const deterministicPath = require.resolve("../../services/risk/DeterministicRiskEngine");
const overlayPath = require.resolve("../../services/risk/AIReasoningOverlay");
const calibrationPath = require.resolve("../../services/risk/RiskCalibrationService");
const adminAuditLogPath = require.resolve("../../models/AdminAuditLog");

const getByPath = (obj, path) =>
  String(path)
    .split(".")
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);

const setByPath = (obj, path, value) => {
  const keys = String(path).split(".");
  let cursor = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
};

const unsetByPath = (obj, path) => {
  const keys = String(path).split(".");
  let cursor = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    cursor = cursor?.[keys[i]];
    if (!cursor) return;
  }
  delete cursor[keys[keys.length - 1]];
};

const normalizeComparable = (value) => {
  if (value instanceof Date) return value.getTime();
  return value;
};

const matchesCondition = (value, condition) => {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
    return value === condition;
  }

  const operators = Object.keys(condition).filter((k) => k.startsWith("$"));
  if (!operators.length) return value === condition;

  const left = normalizeComparable(value);
  return operators.every((operator) => {
    const right = normalizeComparable(condition[operator]);
    if (operator === "$exists") return (value !== undefined) === Boolean(condition.$exists);
    if (operator === "$ne") return left !== right;
    if (operator === "$lte") return left !== undefined && left <= right;
    if (operator === "$lt") return left !== undefined && left < right;
    if (operator === "$gte") return left !== undefined && left >= right;
    if (operator === "$gt") return left !== undefined && left > right;
    if (operator === "$in") return Array.isArray(condition.$in) && condition.$in.includes(value);
    if (operator === "$nin") return !Array.isArray(condition.$nin) || !condition.$nin.includes(value);
    return false;
  });
};

const matchesFilter = (doc, filter = {}) => {
  if (!filter || typeof filter !== "object") return true;
  return Object.entries(filter).every(([key, condition]) => {
    if (key === "$or") return Array.isArray(condition) && condition.some((item) => matchesFilter(doc, item));
    if (key === "$and") return Array.isArray(condition) && condition.every((item) => matchesFilter(doc, item));
    return matchesCondition(getByPath(doc, key), condition);
  });
};

const applyUpdate = (doc, update = {}, isInsert = false) => {
  if (isInsert) {
    for (const [path, value] of Object.entries(update.$setOnInsert || {})) {
      setByPath(doc, path, value);
    }
  }
  for (const [path, value] of Object.entries(update.$set || {})) {
    setByPath(doc, path, value);
  }
  for (const [path, value] of Object.entries(update.$inc || {})) {
    setByPath(doc, path, Number(getByPath(doc, path) || 0) + Number(value || 0));
  }
  for (const path of Object.keys(update.$unset || {})) {
    unsetByPath(doc, path);
  }
};

const loadService = ({ scoreErrorMessage, duplicateClaimErrorOnce = false } = {}) => {
  delete require.cache[servicePath];
  delete require.cache[modelPath];
  delete require.cache[hmacPath];
  delete require.cache[deterministicPath];
  delete require.cache[overlayPath];
  delete require.cache[calibrationPath];
  delete require.cache[adminAuditLogPath];

  const state = {
    saved: null,
    updates: [],
    duplicateClaimErrorPending: duplicateClaimErrorOnce,
  };

  require.cache[modelPath] = {
    id: modelPath,
    filename: modelPath,
    loaded: true,
    exports: {
      findOne: (filters) => ({
        select() {
          return this;
        },
        lean: async () => (state.saved && matchesFilter(state.saved, filters) ? state.saved : null),
      }),
      findOneAndUpdate: (filters, update, options = {}) => ({
        lean: async () => {
          if (state.duplicateClaimErrorPending) {
            state.duplicateClaimErrorPending = false;
            if (!state.saved) {
              state.saved = {
                auditLogId: filters.auditLogId,
                processing: { status: "processing", attempts: 1 },
              };
            }
            const err = new Error("duplicate key");
            err.code = 11000;
            throw err;
          }
          state.updates.push({ filters, update, options });
          const matches = state.saved && matchesFilter(state.saved, filters);
          if (!matches && !(options.upsert && !state.saved)) return null;

          if (!state.saved) state.saved = {};
          applyUpdate(state.saved, update, options.upsert && !matches);
          return state.saved;
        },
      }),
      findById: (id) => ({
        select() {
          return this;
        },
        lean: async () => (state.saved && String(state.saved._id || state.saved.auditLogId) === String(id) ? state.saved : null),
      }),
      findByIdAndUpdate: async (id, update = {}) => {
        if (!state.saved) return null;
        if (String(state.saved._id || state.saved.auditLogId) !== String(id)) return null;
        applyUpdate(state.saved, update, false);
        return state.saved;
      },
    },
  };
  require.cache[hmacPath] = {
    id: hmacPath,
    filename: hmacPath,
    loaded: true,
    exports: { hmacEntityKey: (value) => `hash:${value}` },
  };
  require.cache[deterministicPath] = {
    id: deterministicPath,
    filename: deterministicPath,
    loaded: true,
    exports: {
      scoreAuditEvent: () => {
        if (scoreErrorMessage) throw new Error(scoreErrorMessage);
        return {
          score: 74,
          riskLevel: "high",
          version: "1.0.0",
          summary: "deterministic summary",
          contributions: [{ ruleId: "severity_base", score: 40 }],
        };
      },
    },
  };
  require.cache[overlayPath] = {
    id: overlayPath,
    filename: overlayPath,
    loaded: true,
    exports: {
      buildAIReasoningOverlay: () => ({
        enabled: true,
        summary: "overlay summary",
        confidence: 0.7,
        advisoryScore: 76,
        divergenceScore: 2,
        suggestedActions: [{ actionId: "queue_manual_review", blocked: false }],
        blockedActions: [],
        guardrails: {
          confidenceGateBlocked: false,
          divergenceExceeded: false,
          shadowMode: false,
        },
      }),
    },
  };
  require.cache[calibrationPath] = {
    id: calibrationPath,
    filename: calibrationPath,
    loaded: true,
    exports: {
      getOrCreateCalibrationProfile: async () => ({
        version: 3,
        ruleWeights: { severity_base: 2 },
      }),
    },
  };
  require.cache[adminAuditLogPath] = {
    id: adminAuditLogPath,
    filename: adminAuditLogPath,
    loaded: true,
    exports: {
      findById: (id) => ({
        lean: async () =>
          String(id) === String(state.saved?.auditLogId)
            ? {
                _id: state.saved.auditLogId,
                eventType: "security.auth.failure",
                category: "SECURITY",
                severity: "warn",
                subjectType: "system",
                subjectKey: "actor-1",
                metadata: { organizationId: state.saved.organizationId || "global" },
              }
            : null,
      }),
    },
  };

  return {
    service: require("../../services/risk/RiskReviewerService"),
    state,
  };
};

const withEnv = async (overrides, fn) => {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    const value = overrides[key];
    if (value === undefined || value === null) delete process.env[key];
    else process.env[key] = String(value);
  }

  try {
    return await fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
};

test("processAuditLogRisk persists deterministic source-of-truth assessment", async () => {
  const { service } = loadService();
  const result = await service.processAuditLogRisk({
    _id: "audit-1",
    eventType: "security.auth.failure",
    category: "SECURITY",
    severity: "warn",
    subjectType: "system",
    subjectKey: "actor-1",
    metadata: { organizationId: "org-1" },
  });

  assert.equal(result.organizationId, "org-1");
  assert.equal(result.final.sourceOfTruth, "deterministic");
  assert.equal(result.final.requiresManualReview, true);
  assert.equal(result.processing.status, "completed");
  assert.equal(result.processing.attempts, 1);
  assert.equal(result.processing.maxAttempts, 3);
  assert.equal(result.calibration.profileVersion, 3);
  assert.equal(result.processing.leaseOwner, undefined);
});

test("processAuditLogRisk skips processing when an unexpired lease already exists", async () => {
  const { service, state } = loadService();
  state.saved = {
    auditLogId: "audit-lease",
    processing: {
      status: "processing",
      attempts: 1,
      leaseExpiresAt: new Date(Date.now() + 60000),
    },
  };

  const result = await service.processAuditLogRisk({ _id: "audit-lease" });

  assert.equal(result.processing.status, "processing");
  assert.equal(state.updates.length, 0);
});

test("processAuditLogRisk retries failures and moves to dead-letter at max attempts", async () => {
  await withEnv(
    {
      RISK_REVIEWER_MAX_ATTEMPTS: 2,
      RISK_REVIEWER_RETRY_BASE_MS: 1,
      RISK_REVIEWER_RETRY_MAX_MS: 1,
    },
    async () => {
      const { service, state } = loadService({ scoreErrorMessage: "engine_down" });

      const first = await service.processAuditLogRisk({ _id: "audit-fail" });
      assert.equal(first.processing.status, "failed");
      assert.equal(first.processing.attempts, 1);
      assert.ok(first.processing.nextRetryAt instanceof Date);
      assert.equal(first.processing.deadLetteredAt, null);

      state.saved.processing.nextRetryAt = new Date(Date.now() - 1000);
      const second = await service.processAuditLogRisk({ _id: "audit-fail" });
      assert.equal(second.processing.status, "dead_letter");
      assert.equal(second.processing.attempts, 2);
      assert.equal(second.processing.deadLetterReason, "engine_down");
      assert.ok(second.processing.deadLetteredAt instanceof Date);
      assert.equal(second.processing.nextRetryAt, undefined);
    }
  );
});

test("processAuditLogRisk skips dead-lettered records", async () => {
  const { service, state } = loadService();
  state.saved = {
    auditLogId: "audit-dead-letter",
    processing: {
      status: "dead_letter",
      attempts: 3,
      deadLetterReason: "engine_down",
    },
  };

  const result = await service.processAuditLogRisk({ _id: "audit-dead-letter" });
  assert.equal(result.processing.status, "dead_letter");
  assert.equal(state.updates.length, 0);
});

test("processAuditLogRisk treats duplicate-key lease races as contention and skips failure transition", async () => {
  const { service, state } = loadService({ duplicateClaimErrorOnce: true });
  const result = await service.processAuditLogRisk({ _id: "audit-race" });

  assert.equal(result.processing.status, "processing");
  assert.equal(state.saved.processing.lastError, undefined);
});

test("retryRiskAssessment resets failed assessment to pending", async () => {
  const { service, state } = loadService();
  state.saved = {
    _id: "ra-1",
    auditLogId: "audit-1",
    processing: {
      status: "failed",
      attempts: 2,
      lastError: "boom",
      nextRetryAt: new Date(),
      deadLetteredAt: new Date(),
    },
  };

  const updated = await service.retryRiskAssessment({ assessmentId: "ra-1", actorKey: "actor-1" });
  assert.equal(updated.processing.status, "pending");
  assert.equal(updated.processing.lastError, "");
  assert.equal(updated.processing.nextRetryAt, undefined);
  assert.equal(updated.processing.deadLetteredAt, undefined);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.saved.processing.status, "completed");
});
