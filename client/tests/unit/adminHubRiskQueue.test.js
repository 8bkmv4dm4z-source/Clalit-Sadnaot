import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";

const ADMIN_HUB_PATH = new URL("../../src/pages/AdminHub/AdminHub.jsx", import.meta.url);
const ADMIN_HUB_CONTEXT_PATH = new URL("../../src/context/AdminHubContext.jsx", import.meta.url);

test("AdminHub risk queue tab is present", async () => {
  const source = await fs.readFile(ADMIN_HUB_PATH, "utf8");
  assert.match(source, /riskQueue:\s*\{\s*\n\s*label:\s*"Risk Queue"/m);
});

test("AdminHub risk queue status copy is deterministic", async () => {
  const source = await fs.readFile(ADMIN_HUB_PATH, "utf8");
  assert.match(source, /pending:\s*"Queued for deterministic processing"/);
  assert.match(source, /processing:\s*"Deterministic processing in progress"/);
  assert.match(source, /failed:\s*"Deterministic processing failed"/);
  assert.match(source, /dead_letter:\s*"Deterministic processing exhausted — moved to dead-letter"/);
  assert.match(source, /completed:\s*"Deterministic processing completed"/);
  assert.match(source, /RISK_STATUS_COPY\[status\]\s*\|\|\s*"Status unavailable"/);
});

test("AdminHub risk queue retry status copy reuses deterministic mapping", async () => {
  const source = await fs.readFile(ADMIN_HUB_PATH, "utf8");
  assert.match(source, /Retry requested\. \$\{resolveRiskStatusCopy\(nextStatus\)\}\./);
});

test("AdminHubContext syncing logic uses backfillInFlight from API response", async () => {
  const source = await fs.readFile(ADMIN_HUB_CONTEXT_PATH, "utf8");
  assert.match(source, /backfillInFlight/);
  assert.match(source, /backfillTriggered\s*\|\|\s*backfillInFlight\s*\|\|\s*prev/);
});
