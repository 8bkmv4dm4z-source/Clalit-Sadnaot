# Metrics Thresholds (Backend)

| Metric | Description | Target |
|--------|--------------|--------|
| Avg Latency | Average request duration | < 200 ms |
| p95 Latency | 95th percentile | < 300 ms |
| Error Rate | Fraction of failed requests | < 1 % |
| Spike Stability | % of failed requests during spike | < 3 % |
| sanitizeBody / Joi | All bad inputs rejected (400), no 500s | ✅ |
| CORS | Only allowed origins pass | ✅ |
| JWT / Auth | Proper 401/403 for invalid or forged tokens | ✅ |
| Rate-Limit | 429 appears after burst traffic | ✅ |

Results are saved automatically in `server/tests/results/`.
