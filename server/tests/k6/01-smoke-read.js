/**
 * 01-smoke-read.js
 * -----------------
 * Quick sanity check to ensure the API responds correctly.
 * Run this before heavier tests.
 */

import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 1,
  duration: "10s",
};

const BASE = "http://localhost:5000";

// 👇 The main test body must be exported as default
export default function () {
  const res = http.get(`${BASE}/api/workshops`);
  check(res, {
    "status is 200": (r) => r.status === 200,
    "response time < 500ms": (r) => r.timings.duration < 500,
  });
  sleep(1);
}
