/**
 * 06-auth-abuse-jwt-extended.js
 * -------------------------------
 * Stress test to ensure JWT guards and admin restrictions hold.
 * Verifies that invalid, forged, or missing tokens never grant access.
 */

import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10, // simulate 5 concurrent clients
  iterations: 60, // total 60 requests
  duration: "10s",   // short burst test

};

const BASE = "http://localhost:5000";

const routes = [
  `${BASE}/api/workshops/123/waitlist`, // should be admin-guarded
  `${BASE}/api/users/entity/123`,       // user-level route
  `${BASE}/api/workshops`,              // general data route
];

const fakeTokens = [
  null,
  "Bearer invalidtoken",
  "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.sig", // forged
  "Bearer eyFakeAdmin.eyJyb2xlIjoiYWRtaW4ifQ.fakeSignature", // fake admin payload
];

export default function () {
  for (const url of routes) {
    for (const token of fakeTokens) {
      const headers = token ? { Authorization: token } : {};
      const res = http.get(url, { headers });

      console.log(
        `[${res.status}] ${url} ← ${token || "No token"} (${res.body.slice(
          0,
          80
        )}...)`
      );

      check(res, {
        "❌ access denied (any 4xx/5xx)": (r) => r.status >= 400 && r.status < 600,
      });

      sleep(0.2);
    }
  }
}
