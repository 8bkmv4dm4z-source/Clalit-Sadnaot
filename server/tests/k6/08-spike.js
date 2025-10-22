/**
 * 08-spike.js
 * ------------
 * Sudden traffic spike — tests resilience and recovery.
 */

import http from "k6/http";
import { sleep } from "k6";

export const options = {
  stages: [
    { duration: "5s", target: 0 },
    { duration: "10s", target: 100 },
    { duration: "20s", target: 100 },
    { duration: "10s", target: 0 },
  ],
};

const BASE = "http://localhost:5000";

export default function () {
  http.get(`${BASE}/api/workshops`);
  sleep(0.1);
}
