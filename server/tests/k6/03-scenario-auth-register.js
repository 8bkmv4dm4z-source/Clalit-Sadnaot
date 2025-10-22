/**
 * 03-scenario-auth-register-cleanup.js
 * ----------------------------------------------------------------------------
 * - Auto-deletes old test users (u1@test.com → u20@test.com) before load test.
 * - Then runs the full login/register/workshop flow for all users.
 * - Ensures clean database state each run → no duplicate 400s.
 */

import http from "k6/http";
import { check, sleep } from "k6";

const BASE = "http://localhost:5000";
const PASSWORD = __ENV.PASSWORD || "LoadTest@1234";
const USERS = (
  __ENV.USERS ||
  "u1@test.com,u2@test.com,u3@test.com,u4@test.com,u5@test.com,u6@test.com,u7@test.com,u8@test.com,u9@test.com,u10@test.com,u11@test.com,u12@test.com,u13@test.com,u14@test.com,u15@test.com,u16@test.com,u17@test.com,u18@test.com,u19@test.com,u20@test.com"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const options = {
  vus: Number(__ENV.VUS || 20),
  iterations: Number(__ENV.ITER || (__ENV.VUS || 20)),
  thresholds: {
    http_req_failed: ["rate<0.5"],
    http_req_duration: ["p(95)<2000"],
  },
};

/* -------------------------------------------------------------------------- */
/*                           PRE-RUN CLEANUP (SETUP)                          */
/* -------------------------------------------------------------------------- */
export function setup() {
  console.log("🧹 Cleaning up old test users...");

  USERS.forEach((email) => {
    const payload = JSON.stringify({ email });
    const res = http.del(`${BASE}/api/dev/cleanup-user`, payload, {
      headers: { "Content-Type": "application/json" },
    });

    if (res.status === 200) {
      console.log(`[CLEANUP] ✅ ${email} deleted`);
    } else if (res.status === 404) {
      console.log(`[CLEANUP] ⚠️ ${email} not found (already clean)`);
    } else {
      console.log(`[CLEANUP] ❌ ${email} -> status=${res.status}`);
    }
  });

  console.log("🧹 Cleanup finished. Proceeding to test...");
  sleep(2);
}

/* -------------------------------------------------------------------------- */
/*                               MAIN SCENARIO                               */
/* -------------------------------------------------------------------------- */
export default function () {
  const vu = __VU;
  const email = USERS[(vu - 1) % USERS.length];
  const ip = `10.0.${vu}.1`;

  const headers = {
    "Content-Type": "application/json",
    "X-Forwarded-For": ip,
  };

  // --- LOGIN ---
  const payload = JSON.stringify({ email, password: PASSWORD });
  const loginRes = http.post(`${BASE}/api/auth/login`, payload, { headers });

  let token = null;
  try {
    token = loginRes.json("accessToken");
  } catch (_) {}

  console.log(
    `[LOGIN] ${email} -> status=${loginRes.status} token=${token ? "yes" : "no"}`
  );

  if (!token && [400, 401, 404].includes(loginRes.status)) {
    // --- REGISTER ---
    const regData = makeRegistrationData(email, vu);
    const regRes = http.post(`${BASE}/api/auth/register`, JSON.stringify(regData), { headers });
    console.log(`[REGISTERED] ${email} -> status=${regRes.status}`);

    // --- LOGIN RETRY ---
    const retry = http.post(`${BASE}/api/auth/login`, payload, { headers });
    let retryToken = null;
    try {
      retryToken = retry.json("accessToken");
    } catch (_) {}
    console.log(
      `[LOGIN_RETRY] ${email} -> status=${retry.status} token=${retryToken ? "yes" : "no"}`
    );

    if (!retryToken) {
      console.error(`[FAILED_AFTER_REGISTER] ${email}`);
      return;
    }

    runAuthenticatedFlow(email, retryToken, headers);
    return;
  }

  if (!token) {
    console.error(`[FAILED_LOGIN] ${email}`);
    return;
  }

  runAuthenticatedFlow(email, token, headers);
}

/* -------------------------------------------------------------------------- */
/*                             HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */

function makeRegistrationData(email, vu) {
  const name = email.split("@")[0];
  const phone = `050${(1000000 + vu).toString().slice(-7)}`;
  const idNumber = `${10000000 + vu}`;
  const city = "LoadCity";
  const birthDate = `199${vu % 10}-0${(vu % 9) + 1}-15`;

  return {
    name,
    email,
    password: PASSWORD,
    idNumber,
    birthDate,
    city,
    phone,
    canCharge: false,
    familyMembers: [],
    role: "user",
  };
}

function runAuthenticatedFlow(email, token, baseHeaders) {
  const headers = { ...baseHeaders, Authorization: `Bearer ${token}` };
  const res = http.get(`${BASE}/api/workshops`, { headers });

  console.log(`[WORKSHOPS] ${email} -> ${res.status}`);

  check(res, { "workshops loaded": (r) => r.status === 200 });
  sleep(0.3);
}
