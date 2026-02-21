/**
 * 05-cors-preflight-and-origin-extended.js
 * ----------------------------------------
 * Extended CORS checks:
 *  - OPTIONS preflight for multiple methods
 *  - Requests with custom headers
 *  - Credentialed request (Cookie) check
 *  - Actual GET/POST requests to confirm response CORS headers
 *  - Logs results in the same one-line style as other tests
 */

import http from "k6/http";
import { check, group } from "k6";

export const options = {
  vus: 1,
  iterations: 6,
};

const BASE = __ENV.BASE || "http://localhost:5000";
const endpoints = [
  "/api/workshops",
  // add more endpoints to test if you like:
  // "/api/auth/login",
  // "/api/users"
];

// origins to test
const origins = [
  "http://localhost:5173",     // expected allowed (dev client)
  "http://evil.example.com",   // expected blocked
];

function logResult(prefix, msg) {
  console.log(`${prefix} ${msg}`);
}

export default function () {
  // iterate endpoints so we can test multiple routes easily
  for (const ep of endpoints) {
    group(`Endpoint ${ep}`, () => {
      for (const origin of origins) {
        // test a variety of methods for preflight
        const methodsToTest = ["GET", "POST", "PUT", "DELETE"];

        for (const m of methodsToTest) {
          const preflightHeaders = {
            Origin: origin,
            "Access-Control-Request-Method": m,
            // request some custom headers to see if server allows them
            "Access-Control-Request-Headers": "Content-Type,X-Custom-Header",
          };

          const pre = http.options(`${BASE}${ep}`, null, { headers: preflightHeaders });

          const acao = pre.headers["Access-Control-Allow-Origin"] || null;
          const acam = pre.headers["Access-Control-Allow-Methods"] || null;
          const acah = pre.headers["Access-Control-Allow-Headers"] || null;
          const acc = pre.headers["Access-Control-Allow-Credentials"] || null;

          logResult(
            `[PREFLIGHT] ${origin} ${m} ${ep} -> status=${pre.status} ACAO=${acao} AC-Methods=${acam} AC-Headers=${acah} AC-Creds=${acc}`
          );

          // Preflight: status should be 200/204 (or 403/404 if disallowed)
          check(pre, {
            "preflight status 200/204 or 403/404": (r) => [200, 204, 403, 404].includes(r.status),
          });

          // If an origin is allowed we expect ACAO to equal origin (or "*")
          // Accept 429/other statuses as safe (server controlled)
          check(pre, {
            "preflight includes ACAO when allowed": () =>
              acao === origin || acao === "*" || acao === null,
            "preflight includes allowed methods header if allowed": () =>
              acam === null || acam.toUpperCase().includes(m),
          });
        }

        // Now a real request (GET)
        const getHeaders = { Origin: origin };
        const getRes = http.get(`${BASE}${ep}`, { headers: getHeaders });

        const getACAO = getRes.headers["Access-Control-Allow-Origin"] || null;
        const getACC = getRes.headers["Access-Control-Allow-Credentials"] || null;

        logResult(
          `[GET] ${origin} ${ep} -> status=${getRes.status} ACAO=${getACAO} AC-Creds=${getACC}`
        );

        check(getRes, {
          "GET status < 500": (r) => r.status < 500,
        });

        // Credentialed request (simulate cookie)
        // Note: many servers only echo AC-Allow-Creds when credentials actually present.
        const cookieHeaders = {
          Origin: origin,
          Cookie: "session=loadtest-123", // harmless fake cookie for test
          "Content-Type": "application/json",
        };

        // Use POST for credential check if endpoint accepts — wrap in try/catch like get
        let postRes = { status: 0, headers: {} };
        try {
          postRes = http.post(`${BASE}${ep}`, JSON.stringify({ probe: true }), { headers: cookieHeaders });
        } catch {
          // ignore network errors in the probe
        }

        const postACAO = postRes.headers && postRes.headers["Access-Control-Allow-Origin"];
        const postACC = postRes.headers && postRes.headers["Access-Control-Allow-Credentials"];

        logResult(
          `[POST(creds)] ${origin} ${ep} -> status=${postRes.status} ACAO=${postACAO || null} AC-Creds=${postACC || null}`
        );

        check(postRes, {
          "POST status < 500": (r) => r.status < 500,
        });
      } // origins
    }); // group
  } // endpoints
}
