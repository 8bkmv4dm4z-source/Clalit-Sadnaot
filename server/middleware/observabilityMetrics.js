const { recordApiRequest } = require("../services/ObservabilityMetricsService");

const normalizePathSegment = (segment) => {
  if (!segment) return segment;
  if (/^\d+$/.test(segment)) return ":id";
  if (/^[a-f0-9]{8,}$/i.test(segment)) return ":id";
  if (segment.length > 48) return ":id";
  return segment;
};

const normalizeUnmatchedPath = (path = "") =>
  String(path || "")
    .split("/")
    .map(normalizePathSegment)
    .join("/");

const resolveRouteLabel = (req) => {
  if (req.route?.path) {
    const routePath =
      typeof req.route.path === "string" ? req.route.path : req.route.path.toString();
    return `${req.baseUrl || ""}${routePath}`;
  }

  const rawPath = (req.originalUrl || req.url || "").split("?")[0];
  return normalizeUnmatchedPath(rawPath) || "unmatched";
};

const apiMetricsMiddleware = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const elapsedNs = process.hrtime.bigint() - startedAt;
    const durationMs = Number(elapsedNs) / 1e6;
    recordApiRequest({
      method: req.method,
      route: resolveRouteLabel(req),
      statusCode: res.statusCode,
      durationMs,
      headers: req.headers || {},
      userAgent: req.get?.("user-agent") || req.headers?.["user-agent"] || "",
    });
  });
  next();
};

module.exports = { apiMetricsMiddleware };
