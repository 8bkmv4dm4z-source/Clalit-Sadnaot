/**
 * 02-load-read-heavy.js
 * ----------------------
 * Load test for GET /api/workshops
 * Measures latency and throughput under sustained load.
 */

import http from "k6/http";
import { sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "1m", target: 30 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<300"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE = "http://localhost:5000";

export default function () {
  http.get(`${BASE}/api/workshops`);
  sleep(1);
}
