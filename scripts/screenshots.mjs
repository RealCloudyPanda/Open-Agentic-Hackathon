import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { startServers } from "../server/serve.mjs";

const OUT = fileURLToPath(new URL("../docs/images/", import.meta.url));
const srv = await startServers({ quiet: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const shot = async (name, opts = {}) => { await page.waitForTimeout(350); await page.screenshot({ path: `${OUT}${name}.png`, ...opts }); };
try {
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForSelector("body[data-ready='1']");
  await page.click("#run");
  await page.waitForSelector("#consent[open]");
  await shot("consent");
  await page.click("#consent [data-d=allow]");
  await page.waitForSelector(".receipt");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("hero");
  await page.locator(".receipt").scrollIntoViewIfNeeded();
  await page.locator(".receipt").screenshot({ path: `${OUT}receipt.png` });
  await page.click("#swap-btn");
  await page.click(".pick >> nth=0");
  await page.click("#check-btn");
  await page.click("#consent [data-d=allow]");
  await page.waitForSelector(".verdict");
  await shot("swap-checker");
  await page.click("#use-btn");
  await page.click("#run");
  await page.click("#consent [data-d=allow]");
  await page.waitForSelector(".receipt");
  await page.locator(".art >> nth=1").scrollIntoViewIfNeeded();
  await page.locator(".art >> nth=1").screenshot({ path: `${OUT}risk-plan.png` });
  await page.click("#reset-btn");
  await page.goto("http://localhost:5174/");
  await page.waitForSelector("body[data-ready='1']");
  await page.click("#run");
  await page.waitForSelector(".art");
  await shot("test-planner");
} finally {
  await browser.close();
  await srv.close();
}
console.log("screenshots written to docs/images/");
