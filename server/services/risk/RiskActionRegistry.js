const ACTION_REGISTRY = Object.freeze({
  notify_admin: {
    actionId: "notify_admin",
    description: "Notify security/admin channel with full risk context.",
    minimumScore: 70,
    minimumConfidence: 0.6,
    mutationAllowed: false,
  },
  queue_manual_review: {
    actionId: "queue_manual_review",
    description: "Queue the event for manual review in admin hub.",
    minimumScore: 50,
    minimumConfidence: 0.5,
    mutationAllowed: false,
  },
  flag_subject: {
    actionId: "flag_subject",
    description: "Flag subject for closer monitoring only.",
    minimumScore: 80,
    minimumConfidence: 0.65,
    mutationAllowed: false,
  },
  request_additional_context: {
    actionId: "request_additional_context",
    description: "Collect more context before escalation.",
    minimumScore: 30,
    minimumConfidence: 0.45,
    mutationAllowed: false,
  },
});

const listRegisteredActions = () => Object.values(ACTION_REGISTRY);

const validateActions = (actions = [], { score = 0, confidence = 0 } = {}) => {
  const allowed = [];
  const blocked = [];

  for (const candidate of actions) {
    const id = candidate?.actionId;
    const definition = ACTION_REGISTRY[id];
    if (!definition) {
      blocked.push({ ...candidate, blocked: true, blockedReason: "unregistered_action" });
      continue;
    }
    if (definition.mutationAllowed) {
      blocked.push({ ...candidate, blocked: true, blockedReason: "mutation_forbidden" });
      continue;
    }
    if (score < definition.minimumScore) {
      blocked.push({ ...candidate, blocked: true, blockedReason: "score_below_threshold" });
      continue;
    }
    if (confidence < definition.minimumConfidence) {
      blocked.push({ ...candidate, blocked: true, blockedReason: "confidence_below_threshold" });
      continue;
    }
    allowed.push({ ...candidate, blocked: false });
  }

  return { allowed, blocked };
};

module.exports = {
  listRegisteredActions,
  validateActions,
};

