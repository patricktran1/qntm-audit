/**
 * Completes the audit the way a physician would — typing into every field,
 * skipping one, and landing on the report. Fails on any console error, any
 * blocked step, or a report that comes back empty.
 *
 *   node scripts/e2e-walkthrough.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3210";
const CHROME =
  process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const ANSWERS = {
  "Physicians (FTE)": "2",
  "PAs / NPs (FTE)": "1",
  "Clinic days per week": "4",
  "Patients per provider per clinic day": "32",
  "Annual collections": "3200000",
  "Front office (FTE)": "5",
  "Clinical support (FTE)": "6",
  "Billing company fee": "6.5",
  "Days in A/R": "52",
  "Third-next-available new patient appointment": "28",
  "No-show + same-day cancellation rate": "11",
  "Inbound calls on a typical clinic day": "210",
  "Calls that ring out, abandon, or go to voicemail": "23",
  "Physician admin hours per week": "12",
  "Staff hours per week on prior authorizations": "22",
  "Total software spend per month": "5400",
};
// Deliberately left unanswered, to prove a skip does not block the audit.
const SKIP = new Set(["Total software spend per month"]);

const browser = await chromium.launch(
  existsSync(CHROME) ? { executablePath: CHROME } : {},
);
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

const started = Date.now();
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.getByRole("link", { name: "Start audit", exact: true }).first().click();
await page.waitForURL("**/audit");
// Wait for hydration before typing: an uncontrolled pre-hydration input would
// have its value reset the moment React attaches.
await page.waitForLoadState("networkidle");
await page.getByLabel("Physicians (FTE)", { exact: true }).waitFor();

let step = 0;
while (!page.url().includes("/results")) {
  step += 1;
  if (step > 20) throw new Error("Audit did not terminate after 20 steps");

  // Billing model is a choice, not a number.
  const outsourced = page.getByRole("button", { name: /^Outsourced/ });
  if (await outsourced.count()) await outsourced.click();

  for (const [label, value] of Object.entries(ANSWERS)) {
    const field = page.getByLabel(label, { exact: true });
    if (!(await field.count())) continue;
    if (SKIP.has(label)) {
      const dunno = page.getByRole("button", { name: /I don.t know/ });
      if (await dunno.count()) await dunno.first().click();
      continue;
    }
    await field.fill(value);
  }

  const cont = page.getByRole("button", { name: /^(Continue|See results)$/ });
  await cont.waitFor({ state: "visible" });
  if (await cont.isDisabled())
    throw new Error(`Step ${step} could not be completed — Continue stayed disabled`);
  await cont.click();
  await page.waitForTimeout(180);
}

const elapsed = Date.now() - started;
await page.waitForSelector("text=Practice Leverage Score");

const score = await page.locator(".display.tnum").first().innerText();
const headings = await page.locator("h2, h3").allInnerTexts();
const body = await page.locator("body").innerText();

if (/NaN|undefined|Infinity/.test(body)) problems.push("report contains NaN/undefined");
if (!/Top \d opportunit/i.test(body)) problems.push("no opportunities section rendered");
if (!/Next 30 days|Measure before you spend/i.test(body))
  problems.push("no 30-day plan rendered");
if (!/Assumptions/i.test(body)) problems.push("no assumptions section rendered");

// The assumption sliders must actually recompute the report.
const before = await page.locator("body").innerText();
const slider = page.locator('input[type="range"]').first();
await slider.evaluate((el) => {
  const input = el;
  const next = Number(input.min);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(input, String(next));
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForTimeout(300);
const after = await page.locator("body").innerText();
if (before === after) problems.push("changing an assumption did not change the report");

await browser.close();

console.log(`Completed ${step} steps in ${(elapsed / 1000).toFixed(1)}s`);
console.log(`Score rendered: ${score}`);
console.log(`Sections: ${headings.slice(0, 12).join(" | ")}`);
if (problems.length) {
  console.error("\nPROBLEMS:");
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log("\nWalkthrough clean.");
