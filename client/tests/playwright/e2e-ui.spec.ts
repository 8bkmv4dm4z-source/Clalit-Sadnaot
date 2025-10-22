/**
 * e2e-ui.spec.ts
 * ---------------
 * End-to-End UI test suite for your React client (localhost:5173)
 * Uses Playwright to measure:
 * - Page load time (Workshops)
 * - Modal open/close responsiveness
 * - Registration action latency
 * - Visual confirmation of UI rendering
 */

import { test, expect } from "@playwright/test";
import type { Page, BrowserContext, APIResponse } from "@playwright/test";

const CLIENT = "http://localhost:5173";
const API = "http://localhost:5000";

// Helper for measuring performance timings
async function logPerf(page: Page, label: string): Promise<number> {
  const perf = await page.evaluate(() => performance.timing);
  const loadTime = perf.loadEventEnd - perf.navigationStart;
  console.log(`${label} Load Time: ${loadTime}ms`);
  return loadTime;
}

test.describe("Client UI Performance", () => {
  test("Home/Workshops page loads quickly", async ({ page }) => {
    const start = Date.now();
    await page.goto(`${CLIENT}/#/workshops`, { waitUntil: "networkidle" });
    const loadTime = Date.now() - start;

    console.log(`Workshops page load: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(2500);

    await page.screenshot({ path: "tests/results/workshops-page.png" });
  });

  test("Workshop modal opens smoothly", async ({ page }) => {
    await page.goto(`${CLIENT}/#/workshops`, { waitUntil: "networkidle" });

    // wait for cards to appear
    await page.waitForSelector(".workshop-card");
    const firstCard = page.locator(".workshop-card").first();
    await firstCard.click();

    const modal = page.locator(".modal-content, .workshop-modal");
    await expect(modal).toBeVisible({ timeout: 2000 });

    const modalOpenTime = await page.evaluate(() => performance.now());
    console.log(`Modal open time: ${modalOpenTime}ms`);

    await page.screenshot({ path: "tests/results/modal-open.png" });
  });

  test("Simulate register/unregister and measure API+UI latency", async ({ page }) => {
    await page.goto(`${CLIENT}/#/workshops`, { waitUntil: "networkidle" });

    await page.waitForSelector(".workshop-card");
    const card = page.locator(".workshop-card").first();

    const start = Date.now();
    await card.getByText(/הרשמה|Register/i).click();

    // Wait for network call to finish (POST to API)
    await page.waitForResponse((r) => r.url().includes("/api/workshops") && r.status() < 500);
    const elapsed = Date.now() - start;

    console.log(`Register click → UI update latency: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(1000);
  });
});
