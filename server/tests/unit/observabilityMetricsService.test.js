const test = require("node:test");
const assert = require("node:assert/strict");

const metrics = require("../../services/ObservabilityMetricsService");

test.beforeEach(() => {
  metrics.__resetForTests();
});

test("records API performance and calibration counters from request samples", () => {
  metrics.recordApiRequest({
    method: "GET",
    route: "/api/workshops",
    statusCode: 503,
    durationMs: 1200,
    headers: {},
    userAgent: "k6/0.48.0 (https://k6.io/)",
  });

  const output = metrics.renderPrometheusMetrics();
  assert.match(output, /ws3_api_requests_total\{method="GET",route="\/api\/workshops",status="5xx"\} 1/);
  assert.match(output, /ws3_api_errors_total\{method="GET",route="\/api\/workshops",status="5xx"\} 1/);
  assert.match(output, /ws3_api_slow_requests_total\{method="GET",route="\/api\/workshops",slo="1000ms"\} 1/);
  assert.match(output, /ws3_calibration_requests_total\{method="GET",route="\/api\/workshops",source="k6",status="5xx"\} 1/);
  assert.match(output, /ws3_api_request_duration_ms_count\{method="GET",route="\/api\/workshops"\} 1/);
});

test("tracks security insight gauges and deactivates resolved alerts", () => {
  metrics.recordSecurityInsightSnapshot("hourly", {
    metrics: {
      totalEvents: 7,
      byEventType: { "security.auth.failure": 3 },
      bySeverity: { critical: 1 },
    },
    warnings: [{ code: "HIGH_AUTH_FAILURES", severity: "critical" }],
  });

  let output = metrics.renderPrometheusMetrics();
  assert.match(output, /ws3_security_insight_total_events\{period="hourly"\} 7/);
  assert.match(output, /ws3_security_event_type_total\{event_type="security\.auth\.failure",period="hourly"\} 3/);
  assert.match(output, /ws3_security_alert_active\{code="HIGH_AUTH_FAILURES",period="hourly",severity="critical"\} 1/);

  metrics.recordSecurityInsightSnapshot("hourly", {
    metrics: { totalEvents: 2, byEventType: {}, bySeverity: {} },
    warnings: [],
  });

  output = metrics.renderPrometheusMetrics();
  assert.match(output, /ws3_security_insight_total_events\{period="hourly"\} 2/);
  assert.match(output, /ws3_security_alert_active\{code="HIGH_AUTH_FAILURES",period="hourly",severity="unknown"\} 0/);
});

test("records audit suite run counters and duration histogram", () => {
  metrics.recordAuditSuiteRun({ reason: "scheduled", status: "success", durationMs: 80 });

  const output = metrics.renderPrometheusMetrics();
  assert.match(output, /ws3_audit_suite_runs_total\{reason="scheduled",status="success"\} 1/);
  assert.match(output, /ws3_audit_suite_duration_ms_count\{reason="scheduled"\} 1/);
  assert.match(output, /ws3_audit_suite_last_success_timestamp_seconds\{reason="scheduled"\} \d+/);
});
