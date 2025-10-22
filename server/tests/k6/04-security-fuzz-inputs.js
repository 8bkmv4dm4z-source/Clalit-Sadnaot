/**
 * 04-security-fuzz-inputs.js
 * ---------------------------
 * Sends malformed / potentially malicious inputs to test sanitizeBody & Joi.
 */

import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 1,
  iterations: 10,
};

const BASE = "http://localhost:5000";

const payloads = [
  { email: "<script>alert(1)</script>", password: "123" },
  { email: "test@example.com", password: "${{constructor.constructor('return globalThis')()}}" },
  { name: "{ $ne: null }", city: "B'Sheva" },
  { email: "user@example.com", password: "💣💣💣" },
];

export default function () {
  for (const p of payloads) {
    const res = http.post(`${BASE}/api/auth/login`, JSON.stringify(p), {
      headers: { "Content-Type": "application/json" },
    });
    check(res, {
      "no 500 crash": (r) => r.status < 500,
      "rejected bad input": (r) => [400, 401].includes(r.status),
    });
  }
}
