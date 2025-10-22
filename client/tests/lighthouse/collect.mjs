/**
 * collect.mjs
 * ------------
 * Runs Lighthouse audits for key pages and outputs HTML reports.
 * Measures LCP, FCP, CLS, TTI, and total blocking time.
 */

import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import fs from "fs";

const CLIENT = "http://localhost:5173";

const pages = [
  { name: "workshops", url: `${CLIENT}/#/workshops` },
  { name: "profile", url: `${CLIENT}/#/profile` },
];

for (const { name, url } of pages) {
  const chrome = await launch({ chromeFlags: ["--headless"] });
  const opts = { logLevel: "info", output: "html", port: chrome.port };
  const runnerResult = await lighthouse(url, opts);

  const reportHtml = runnerResult.report;
  const filePath = `tests/results/lighthouse-${name}.html`;
  fs.writeFileSync(filePath, reportHtml);

  console.log(`✅ Lighthouse report for ${name} → ${filePath}`);
  await chrome.kill();
}
