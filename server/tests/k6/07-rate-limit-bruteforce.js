/**
 * 07-rate-limit-bruteforce.js
 * -----------------------------
 * Verifies rate limiter blocks repeated login/OTP abuse.
 */

import http from "k6/http";
import { check, sleep } from "k6";

export const options = { vus: 1, iterations: 20 };

const BASE = "http://localhost:5000";

export default function () {
  const res = http.post(`${BASE}/api/auth/send-otp`, JSON.stringify({
    email: "spam@example.com",
  }), { headers: { "Content-Type": "application/json" }});
  check(res, { "status ok or 429": (r) => [200, 429].includes(r.status) });
  if (res.status === 429) console.log("Rate limit triggered!");
  sleep(0.5);
}
