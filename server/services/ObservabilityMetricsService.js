const DEFAULT_DURATION_BUCKETS_MS = [25, 50, 100, 200, 300, 500, 1000, 2000, 5000];

const HELP = new Map();
const TYPES = new Map();
const counters = new Map();
const gauges = new Map();
const histograms = new Map();
const knownSecurityAlertCodesByPeriod = new Map();

const sortedEntries = (map) =>
  [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

const normalizeMetricName = (name) => String(name || "").trim();

const escapeLabelValue = (value) =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');

const sanitizeLabelValue = (value, fallback = "unknown") => {
  if (value === null || value === undefined) return fallback;
  const cleaned = String(value).trim();
  if (!cleaned) return fallback;
  return cleaned;
};

const toLabelKey = (labels = {}) => {
  const entries = Object.entries(labels)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
};

const parseLabelKey = (labelKey) => {
  try {
    return Object.fromEntries(JSON.parse(labelKey));
  } catch {
    return {};
  }
};

const labelsToString = (labels = {}) => {
  const entries = Object.entries(labels);
  if (!entries.length) return "";
  const parts = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}="${escapeLabelValue(value)}"`);
  return `{${parts.join(",")}}`;
};

const registerMetric = ({ name, type, help }) => {
  const metricName = normalizeMetricName(name);
  if (!metricName) return;
  if (help) HELP.set(metricName, String(help));
  if (type) TYPES.set(metricName, String(type));
};

const incCounter = (name, labels = {}, value = 1, help) => {
  const metricName = normalizeMetricName(name);
  if (!metricName) return;
  registerMetric({ name: metricName, type: "counter", help });
  const key = `${metricName}|${toLabelKey(labels)}`;
  const prev = counters.get(key) || 0;
  counters.set(key, prev + Number(value || 0));
};

const setGauge = (name, labels = {}, value = 0, help) => {
  const metricName = normalizeMetricName(name);
  if (!metricName) return;
  registerMetric({ name: metricName, type: "gauge", help });
  const key = `${metricName}|${toLabelKey(labels)}`;
  gauges.set(key, Number(value || 0));
};

const ensureHistogram = (name, labels = {}, buckets = DEFAULT_DURATION_BUCKETS_MS, help) => {
  const metricName = normalizeMetricName(name);
  if (!metricName) return null;
  registerMetric({ name: metricName, type: "histogram", help });
  const key = `${metricName}|${toLabelKey(labels)}`;
  if (!histograms.has(key)) {
    const bucketValues = [...buckets]
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b);
    histograms.set(key, {
      buckets: bucketValues,
      counts: new Array(bucketValues.length + 1).fill(0),
      sum: 0,
      count: 0,
    });
  }
  return histograms.get(key);
};

const observeHistogram = (name, labels = {}, value = 0, buckets, help) => {
  const hist = ensureHistogram(name, labels, buckets, help);
  if (!hist) return;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return;

  let bucketIndex = hist.buckets.length;
  for (let i = 0; i < hist.buckets.length; i += 1) {
    if (numericValue <= hist.buckets[i]) {
      bucketIndex = i;
      break;
    }
  }

  hist.counts[bucketIndex] += 1;
  hist.sum += numericValue;
  hist.count += 1;
};

const getStatusFamily = (statusCode) => {
  const status = Number(statusCode) || 0;
  if (status >= 100 && status < 200) return "1xx";
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 300 && status < 400) return "3xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500 && status < 600) return "5xx";
  return "unknown";
};

const detectCalibrationSource = ({ headers = {}, userAgent = "" } = {}) => {
  const explicitHeader = sanitizeLabelValue(headers["x-ws3-calibration-source"], "");
  if (explicitHeader) return explicitHeader.toLowerCase().slice(0, 32);

  const ua = String(userAgent || "").toLowerCase();
  if (ua.includes("k6")) return "k6";
  if (ua.includes("artillery")) return "artillery";
  return null;
};

const recordApiRequest = ({
  method,
  route,
  statusCode,
  durationMs,
  headers,
  userAgent,
}) => {
  const normalizedMethod = sanitizeLabelValue(method, "UNKNOWN").toUpperCase();
  const normalizedRoute = sanitizeLabelValue(route, "unmatched").slice(0, 120);
  const statusFamily = getStatusFamily(statusCode);
  const duration = Math.max(0, Number(durationMs) || 0);

  const labels = { method: normalizedMethod, route: normalizedRoute, status: statusFamily };
  incCounter(
    "ws3_api_requests_total",
    labels,
    1,
    "Total API requests grouped by method, normalized route and status family."
  );
  observeHistogram(
    "ws3_api_request_duration_ms",
    { method: normalizedMethod, route: normalizedRoute },
    duration,
    DEFAULT_DURATION_BUCKETS_MS,
    "API request duration in milliseconds."
  );

  if (Number(statusCode) >= 500) {
    incCounter(
      "ws3_api_errors_total",
      { method: normalizedMethod, route: normalizedRoute, status: "5xx" },
      1,
      "Total API 5xx errors."
    );
  }

  if (duration >= 1000) {
    incCounter(
      "ws3_api_slow_requests_total",
      { method: normalizedMethod, route: normalizedRoute, slo: "1000ms" },
      1,
      "Total API requests slower than 1000ms."
    );
  }

  const source = detectCalibrationSource({ headers, userAgent });
  if (source) {
    incCounter(
      "ws3_calibration_requests_total",
      { source, method: normalizedMethod, route: normalizedRoute, status: statusFamily },
      1,
      "Requests recognized as load/security calibration traffic."
    );
    observeHistogram(
      "ws3_calibration_request_duration_ms",
      { source, route: normalizedRoute },
      duration,
      DEFAULT_DURATION_BUCKETS_MS,
      "Calibration request duration in milliseconds."
    );
  }
};

const setSecurityAlerts = (period, warnings = []) => {
  const periodKey = sanitizeLabelValue(period, "unknown");
  const knownCodes = knownSecurityAlertCodesByPeriod.get(periodKey) || new Set();
  const active = new Set();

  for (const warning of warnings) {
    const code = sanitizeLabelValue(warning?.code, "UNKNOWN");
    const severity = sanitizeLabelValue(warning?.severity, "unknown");
    knownCodes.add(code);
    active.add(code);
    setGauge(
      "ws3_security_alert_active",
      { period: periodKey, code, severity },
      1,
      "Active security alerts produced by SecurityInsight thresholds."
    );
  }

  for (const code of knownCodes) {
    if (active.has(code)) continue;
    setGauge(
      "ws3_security_alert_active",
      { period: periodKey, code, severity: "unknown" },
      0,
      "Active security alerts produced by SecurityInsight thresholds."
    );
  }

  knownSecurityAlertCodesByPeriod.set(periodKey, knownCodes);
};

const recordSecurityInsightSnapshot = (period, insightDoc) => {
  const periodKey = sanitizeLabelValue(period, "unknown");
  const metrics = insightDoc?.metrics || {};
  const warnings = Array.isArray(insightDoc?.warnings) ? insightDoc.warnings : [];
  const byType = metrics.byEventType || {};
  const bySeverity = metrics.bySeverity || {};

  setGauge(
    "ws3_security_insight_total_events",
    { period: periodKey },
    Number(metrics.totalEvents || 0),
    "Total security events observed in the SecurityInsight window."
  );
  setGauge(
    "ws3_security_insight_warnings_total",
    { period: periodKey },
    warnings.length,
    "Total active warnings generated for the SecurityInsight period."
  );
  setGauge(
    "ws3_security_insight_last_aggregation_timestamp_seconds",
    { period: periodKey },
    Math.floor(Date.now() / 1000),
    "Unix timestamp for the latest SecurityInsight aggregation."
  );

  for (const [eventType, count] of Object.entries(byType)) {
    setGauge(
      "ws3_security_event_type_total",
      { period: periodKey, event_type: sanitizeLabelValue(eventType, "unknown") },
      Number(count || 0),
      "Security events by event type and period."
    );
  }

  for (const [severity, count] of Object.entries(bySeverity)) {
    setGauge(
      "ws3_security_severity_total",
      { period: periodKey, severity: sanitizeLabelValue(severity, "unknown") },
      Number(count || 0),
      "Security events by severity and period."
    );
  }

  setSecurityAlerts(periodKey, warnings);
};

const recordAuditSuiteRun = ({ reason = "manual", status = "success", durationMs = 0 } = {}) => {
  const labels = {
    reason: sanitizeLabelValue(reason, "unknown"),
    status: sanitizeLabelValue(status, "unknown"),
  };
  incCounter(
    "ws3_audit_suite_runs_total",
    labels,
    1,
    "Count of audit suite runs by reason and status."
  );
  observeHistogram(
    "ws3_audit_suite_duration_ms",
    { reason: labels.reason },
    Math.max(0, Number(durationMs) || 0),
    DEFAULT_DURATION_BUCKETS_MS,
    "Audit suite execution duration in milliseconds."
  );
  if (status === "success") {
    setGauge(
      "ws3_audit_suite_last_success_timestamp_seconds",
      { reason: labels.reason },
      Math.floor(Date.now() / 1000),
      "Unix timestamp of last successful audit suite run."
    );
  }
};

const renderPrometheusMetrics = () => {
  const lines = [];
  const allMetricNames = new Set([
    ...[...counters.keys()].map((k) => k.split("|")[0]),
    ...[...gauges.keys()].map((k) => k.split("|")[0]),
    ...[...histograms.keys()].map((k) => k.split("|")[0]),
  ]);

  const names = [...allMetricNames].sort((a, b) => a.localeCompare(b));

  for (const metricName of names) {
    const help = HELP.get(metricName);
    const type = TYPES.get(metricName);
    if (help) lines.push(`# HELP ${metricName} ${help}`);
    if (type) lines.push(`# TYPE ${metricName} ${type}`);

    for (const [key, value] of sortedEntries(counters)) {
      const [name, labelKey] = key.split("|");
      if (name !== metricName) continue;
      lines.push(`${name}${labelsToString(parseLabelKey(labelKey))} ${value}`);
    }

    for (const [key, value] of sortedEntries(gauges)) {
      const [name, labelKey] = key.split("|");
      if (name !== metricName) continue;
      lines.push(`${name}${labelsToString(parseLabelKey(labelKey))} ${value}`);
    }

    for (const [key, hist] of sortedEntries(histograms)) {
      const [name, labelKey] = key.split("|");
      if (name !== metricName) continue;
      const baseLabels = parseLabelKey(labelKey);
      let cumulative = 0;
      for (let i = 0; i < hist.buckets.length; i += 1) {
        cumulative += hist.counts[i];
        lines.push(
          `${name}_bucket${labelsToString({ ...baseLabels, le: String(hist.buckets[i]) })} ${cumulative}`
        );
      }
      cumulative += hist.counts[hist.buckets.length];
      lines.push(`${name}_bucket${labelsToString({ ...baseLabels, le: "+Inf" })} ${cumulative}`);
      lines.push(`${name}_sum${labelsToString(baseLabels)} ${hist.sum}`);
      lines.push(`${name}_count${labelsToString(baseLabels)} ${hist.count}`);
    }
  }

  return `${lines.join("\n")}\n`;
};

const resetForTests = () => {
  counters.clear();
  gauges.clear();
  histograms.clear();
  HELP.clear();
  TYPES.clear();
  knownSecurityAlertCodesByPeriod.clear();
};

module.exports = {
  recordApiRequest,
  recordSecurityInsightSnapshot,
  recordAuditSuiteRun,
  renderPrometheusMetrics,
  __resetForTests: resetForTests,
};
