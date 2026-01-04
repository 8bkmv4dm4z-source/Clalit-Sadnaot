const { queryLogs, sanitizeMetadata } = require("../services/AuditLogService");
const { allowedEventTypes, getAuditEventDefinition } = require("../services/AuditEventRegistry");
const {
  getMaxedWorkshops,
  getStaleUsers: fetchStaleUsers,
} = require("../services/AdminHubService");

const ALLOWED_SUBJECT_TYPES = ["user", "familyMember", "workshop"];

const parsePositiveInt = (value, { min, max, fallback }) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.max(min, Math.min(Math.trunc(num), max));
  return clamped;
};

const parseIsoDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

/**
 * Identity:
 *   - Relies on upstream admin authorization tied to entityKey authorities.
 * Storage:
 *   - Removes Mongo _id before responding; database lookups stay internal.
 * Notes:
 *   - Sanitizes metadata to avoid leaking identifiers during admin log reads.
 */
const getLogs = async (req, res) => {
  try {
    const { eventType, subjectType, subjectKey, from, to, page, limit, sort } = req.query;

    if (eventType && !allowedEventTypes.includes(eventType)) {
      return res.status(400).json({ message: "Invalid eventType" });
    }
    if (subjectType && !ALLOWED_SUBJECT_TYPES.includes(subjectType)) {
      return res.status(400).json({ message: "Invalid subjectType" });
    }

    const parsedFrom = parseIsoDate(from);
    const parsedTo = parseIsoDate(to);
    if ((from && !parsedFrom) || (to && !parsedTo)) {
      return res.status(400).json({ message: "Invalid date range" });
    }

    const safeLimit = parsePositiveInt(limit, { min: 1, max: 100, fallback: 50 });
    const safePage = parsePositiveInt(page, { min: 1, max: 1000, fallback: 1 });

    const sortValue = sort === "createdAt_asc" ? "asc" : -1;

    const logs = await queryLogs({
      eventType,
      subjectType,
      subjectKey,
      from: parsedFrom,
      to: parsedTo,
      page: safePage,
      limit: safeLimit,
      sort: sortValue,
    });

    const sanitizedLogs = (logs || []).map((log) => {
      const copy = { ...log };
      delete copy._id;
      delete copy.__v;
      if (copy.metadata) copy.metadata = sanitizeMetadata(copy.metadata);
      if (!copy.category) {
        copy.category = getAuditEventDefinition(copy.eventType)?.category;
      }
      return copy;
    });

    return res.json({ logs: sanitizedLogs });
  } catch (err) {
    console.error("[ADMIN HUB] Failed to fetch logs", err);
    return res.status(500).json({ message: "Failed to fetch logs" });
  }
};

/**
 * Identity:
 *   - Expects admin-scoped callers validated by entityKey-based middleware.
 * Storage:
 *   - Uses Mongo _id only inside AdminHubService queries.
 * Notes:
 *   - Responds with alerts without exposing internal identifiers.
 */
const getMaxedWorkshopAlerts = async (_req, res) => {
  try {
    const alerts = await getMaxedWorkshops();
    return res.json({ alerts });
  } catch (err) {
    console.error("[ADMIN HUB] Failed to fetch maxed workshops", err);
    return res.status(500).json({ message: "Failed to fetch alerts" });
  }
};

/**
 * Identity:
 *   - Admin access enforced upstream via entityKey/authority checks.
 * Storage:
 *   - Pulls stale user data by _id internally without returning it.
 * Notes:
 *   - Outputs sanitized stale user summaries only.
 */
const getStaleUsers = async (_req, res) => {
  try {
    const staleUsers = await fetchStaleUsers();
    return res.json({ staleUsers });
  } catch (err) {
    console.error("[ADMIN HUB] Failed to fetch stale users", err);
    return res.status(500).json({ message: "Failed to fetch stale users" });
  }
};

/**
 * Identity:
 *   - Placeholder handler assumes admin-only routing via entityKey authorities.
 * Storage:
 *   - No database access; no Mongo _id exposure.
 * Notes:
 *   - Stub remains until stats endpoint is implemented.
 */
const getStats = (_req, res) => res.status(501).json({ message: "Not implemented" });

module.exports = {
  getLogs,
  getMaxedWorkshopAlerts,
  getStaleUsers,
  getStats,
};
