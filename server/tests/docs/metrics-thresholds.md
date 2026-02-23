# WS3 Metrics & Calibration (Backend)

## Metrics export
- Endpoint: `GET /api/admin/hub/metrics`
- Access: same admin hub protections (`authenticate` + `authorizeAdmin` + `x-admin-password`)
- Format: Prometheus text exposition (`text/plain; version=0.0.4`)

## SecurityInsight SLO foundations
| Metric | Description | Baseline target |
|--------|--------------|-----------------|
| `ws3_security_insight_total_events{period}` | Security events seen in hourly/daily SecurityInsight windows | track trend, no blind spots |
| `ws3_security_insight_warnings_total{period}` | Active warning count per window | non-zero triggers investigation |
| `ws3_security_alert_active{period,code,severity}` | Threshold breach state (0/1) for alertable warning codes | should clear after mitigation |
| `ws3_security_event_type_total{period,event_type}` | Event-type breakdown for security signal quality | stable cardinality |
| `ws3_security_severity_total{period,severity}` | Severity distribution for risk posture | critical events remain low |

## API capacity/performance KPI foundations
| Metric | Description | Baseline target |
|--------|--------------|-----------------|
| `ws3_api_requests_total{method,route,status}` | Request throughput by route and status family | monitor growth + hotspots |
| `ws3_api_request_duration_ms` | Route latency histogram (p95/p99 from buckets) | p95 < 300ms for core reads |
| `ws3_api_errors_total{method,route,status="5xx"}` | Server-side failure volume | < 1% of requests |
| `ws3_api_slow_requests_total{method,route,slo="1000ms"}` | Requests breaching 1s latency | < 3% during spikes |

## Calibration hooks tied to existing load/security assets
- Automatic calibration source tagging is inferred from request `User-Agent`:
- `k6` traffic increments `ws3_calibration_requests_total{source="k6",...}`
- `artillery` traffic increments `ws3_calibration_requests_total{source="artillery",...}`
- Optional override header for controlled runs: `x-ws3-calibration-source: <name>`
- Calibration latency histogram: `ws3_calibration_request_duration_ms{source,route}`

## Suggested calibration loop
1. Run k6 security/load scenarios from `server/tests/k6/`.
2. Run artillery scenarios from `server/tests/artillery/`.
3. Pull `/api/admin/hub/metrics` before and after each run.
4. Compare deltas in `ws3_api_*`, `ws3_calibration_*`, and `ws3_security_*` metrics.
