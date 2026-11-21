import { test, expect } from "@playwright/test";
import { startServers } from "../../server/serve.mjs";

let srv;
const logs = [];
test.beforeAll(async () => { srv = await startServers({ quiet: true, onLog: (e) => logs.push(e) }); });
test.afterAll(async () => { await srv?.close(); });
const peer = (site) => logs.filter((e) => e.site === site && e.path !== "/favicon.ico");

async function open(page) {
  logs.length = 0;
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForSelector("body[data-ready='1']");
}

test("relay: consent before contact, allowed keys only, no credentials", async ({ page }) => {
  await open(page);
  await page.click("#run");
  await page.waitForSelector("#review-criteria");
  await page.click("#approve-plan");
  await page.waitForSelector("#consent[open]");
  expect(peer("test-planner")).toHaveLength(0);
  await expect(page.locator("#consent-title")).toContainText("localhost:5174");
  await page.click("#consent [data-d=allow]");
  await page.waitForSelector(".receipt");
  const last = await page.evaluate(() => window.__relay.last);
  expect(last.receipt.slyKeysSent).toEqual(["acceptance_criteria", "feature_title", "platform"]);
  expect(last.plan.received_fields).toEqual(["acceptance_criteria", "feature_title", "platform"]);
  expect(last.plan.origin).toBe("localhost:5174");
  expect(last.criteria.origin).toBe("127.0.0.1:5173");
  expect(peer("test-planner").map((entry) => entry.path).sort()).toEqual([
    "/agent-manifest.json", "/links.json", "/test_planner.network.json", "/tools/plan-builder.js",
  ]);
  expect(peer("test-planner").every((e) => e.auth === "no" && e.cookies === "none")).toBe(true);
});

test("unticking platform keeps it home", async ({ page }) => {
  await open(page);
  await page.uncheck('#ledger [data-k="platform"]');
  await page.click("#run");
  await page.waitForSelector("#review-criteria");
  await page.click("#approve-plan");
  await page.click("#consent [data-d=allow]");
  await page.waitForSelector(".receipt");
  const last = await page.evaluate(() => window.__relay.last);
  expect(last.receipt.slyKeysSent).toEqual(["acceptance_criteria", "feature_title"]);
});

test("decline: nothing reaches the peer", async ({ page }) => {
  await open(page);
  await page.click("#run");
  await page.waitForSelector("#review-criteria");
  await page.click("#approve-plan");
  await page.waitForSelector("#consent[open]");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".receipt");
  await expect(page.locator("#timeline")).toContainText("Nothing was sent to localhost:5174");
  expect(peer("test-planner")).toHaveLength(0);
});

test("a short customer name in the request blocks approval", async ({ page }) => {
  await open(page);
  await page.locator('[name="customer_name"]').fill("Bob");
  await page.locator('[name="feature_request"]').fill("Add undo for Bob.");
  await page.click("#run");
  await page.waitForSelector("#review-criteria");
  const rows = JSON.parse(await page.locator("#review-criteria").inputValue());
  rows[0].title = "Bob must approve";
  await page.locator("#review-criteria").fill(JSON.stringify(rows));
  await page.click("#approve-plan");
  await expect(page.locator("#consent .guard")).toContainText("customer_name");
  await expect(page.locator("#consent [data-d=allow]")).toBeDisabled();
  await page.click("#consent [data-d=decline]");
  await page.waitForSelector(".receipt");
  expect(peer("test-planner")).toHaveLength(0);
});

test("swap by URL: wrong name refused, Risk Radar used, links.json untouched", async ({ page }) => {
  await open(page);
  await page.click("#swap-btn");
  await page.fill("#swap-url", "http://localhost:5174/nope");
  await page.click("#check-btn");
  await page.click("#consent [data-d=allow]");
  await expect(page.locator(".verdict")).toHaveText("Not compatible");
  await expect(page.locator("#use-btn")).toBeDisabled();
  await page.fill("#swap-url", "http://[::1]:5175/risk_test_planner/");
  await page.click("#check-btn");
  await expect(page.locator("#consent-title")).toContainText("[::1]:5175");
  expect(peer("risk-radar")).toHaveLength(0);
  await page.click("#consent [data-d=allow]");
  await expect(page.locator(".verdict")).toContainText("Compatible");
  await page.click("#use-btn");
  await page.reload();
  await page.waitForSelector("body[data-ready='1']");
  await expect(page.locator("#slot-owner")).toContainText("your choice");
  const checkedReads = peer("risk-radar").length;
  await page.click("#run");
  await page.waitForSelector("#review-criteria");
  await page.click("#approve-plan");
  await expect(page.locator("#consent-title")).toContainText("[::1]:5175");
  expect(peer("risk-radar")).toHaveLength(checkedReads);
  await page.click("#consent [data-d=allow]");
  await page.waitForSelector(".receipt");
  const last = await page.evaluate(() => window.__relay.last);
  expect(last.plan.kind).toBe("risk_plan");
  expect(last.plan.origin).toBe("[::1]:5175");
  const links = await (await fetch("http://127.0.0.1:5173/links.json")).json();
  expect(links.networks.spec_desk.test_planner).toBe("http://localhost:5174/test_planner");
  await page.click("#reset-btn");
  await expect(page.locator("#slot-target")).toHaveText("localhost:5174/test_planner");
});

test('review edits are the actual peer payload and export becomes stale', async ({ page }) => {
  await open(page);
  await page.click('#run');
  await page.waitForSelector('#review-criteria');
  expect(peer('test-planner')).toHaveLength(0);
  const criteria = [{ id: 'AC-EDIT', title: 'Reviewed unique control', given: 'the new page', when: 'click the edited button', then: 'the edited message appears', status: 'tester reviewed', requirement_ids: ['REQ-1'] }];
  await page.locator('#review-criteria').fill(JSON.stringify(criteria));
  await page.click('#approve-plan');
  await expect(page.locator('#consent')).toContainText('Reviewed unique control');
  await page.click('#consent [data-d=allow]');
  await page.waitForSelector('[aria-label="Test plan"]');
  const last = await page.evaluate(() => window.__relay.last);
  expect(last.approvedCriteria).toEqual(criteria);
  expect(last.plan.plan.cases[0].criterion).toBe('AC-EDIT');
  expect(last.plan.plan.cases[0].steps.join(' ')).toContain('edited button');
  await page.locator('#review-criteria').fill(JSON.stringify([{ ...criteria[0], title: 'Later edit' }]));
  await expect(page.locator('#review-status')).toContainText('stale');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download review Markdown' }).click();
  expect((await download).suggestedFilename()).toBe('spec-relay-review.md');
});

test('standalone drills exercise actual runtime policy functions', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/drills.html');
  await page.click('#run-drills');
  const rows = JSON.parse(await page.locator('#drills').textContent());
  expect(rows).toHaveLength(3);
  expect(rows.every((r) => r.passed)).toBe(true);
});


test('malformed reviewed criteria preserve the draft and never contact a peer', async ({ page }) => {
  await open(page);
  await page.click('#run');
  await page.waitForSelector('#review-criteria');
  await page.locator('#review-criteria').fill(JSON.stringify([{ id: 'AC-X', title: { bad: 'shape' } }]));
  await page.click('#approve-plan');
  await expect(page.locator('#review-status')).toContainText('nonempty title');
  await expect(page.locator('[aria-label="Acceptance criteria"]')).toBeVisible();
  await expect(page.locator('#consent')).not.toBeVisible();
  expect(peer('test-planner')).toHaveLength(0);
  await expect(page.locator('#approve-plan')).toBeEnabled();
});

test('edits while a handoff is pending keep its completed plan stale', async ({ page }) => {
  await open(page);
  await page.click('#run');
  await page.waitForSelector('#review-criteria');
  await page.click('#approve-plan');
  await page.waitForSelector('#consent[open]');
  await expect(page.locator('#approve-plan')).toBeDisabled();
  // Simulate an input event arriving while the async consent request is pending.
  await page.evaluate(() => {
    const input = document.querySelector('#review-criteria');
    const rows = JSON.parse(input.value); rows[0].title = 'Changed during handoff';
    input.value = JSON.stringify(rows); input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('#consent [data-d=allow]');
  await page.waitForSelector('[aria-label="Test plan"]');
  expect(await page.evaluate(() => window.__relay.last.stale)).toBe(true);
  await expect(page.locator('#review-status')).toContainText('Inputs changed during this run');
  expect(await page.evaluate(() => window.__relay.last.approvedCriteria[0].title)).not.toBe('Changed during handoff');
});
