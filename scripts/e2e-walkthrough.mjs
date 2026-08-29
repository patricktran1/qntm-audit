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
// Mark this browser as QA traffic before anything loads, so a walkthrough run
// against a store-backed environment cannot pollute pilot learning.
await ctx.addInitScript(() => {
  try {
    window.localStorage.setItem("qntm.pilot.test", "1");
  } catch {
    // Storage unavailable; the walkthrough still runs.
  }
});
const page = await ctx.newPage();
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

// Both experiment arms must lead into the same funnel. Assert the variant the
// server rendered matches the arm we asked for, then enter through its CTA.
const arm = process.env.E2E_VARIANT === "B" ? "B" : "A";
const started = Date.now();
await page.goto(`${BASE}/?v=${arm}`, { waitUntil: "networkidle" });

const heroText = await page.locator("h1").first().innerText();
// The hero renders across two lines, so normalise whitespace before matching.
const expectedHero = arm === "B" ? /hour\s+of your time worth/i : /Your practice/i;
if (!expectedHero.test(heroText.replace(/\s+/g, " ")))
  problems.push(`variant ${arm} rendered the wrong hero: ${heroText}`);

const cookieVariant = (await ctx.cookies()).find((c) => c.name === "qntm_v")?.value;
if (cookieVariant !== arm)
  problems.push(`variant cookie was ${cookieVariant}, expected ${arm}`);

await page
  .getByRole("link", { name: /^(Start audit|Calculate my hourly value)$/ })
  .first()
  .click();
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

const reportParam = new URL(page.url()).searchParams.get("a") ?? "";
const score = await page.locator(".tnum.display").first().innerText();
const headings = await page.locator("h2, h3").allInnerTexts();
const body = await page.locator("body").innerText();

if (/NaN|undefined|Infinity/.test(body)) problems.push("report contains NaN/undefined");
if (!/Top \d findings|What we noticed/i.test(body))
  problems.push("no findings section rendered");
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

// ── The funnel past the report ───────────────────────────────────────────────
// A verdict must be published, and it must drive the offer.
const verdictText = await page.locator("p.eyebrow").first().innerText();
if (!/verdict/i.test(verdictText)) problems.push("no verdict shown on the report");

// Progressive disclosure must actually disclose.
const disclose = page.getByRole("button", { name: /Show the evidence/ }).first();
if ((await disclose.count()) === 0) problems.push("no finding disclosure control");
else {
  await disclose.click();
  await page.waitForTimeout(200);
  const detail = await page.locator("text=The numbers behind it").first().isVisible();
  if (!detail) problems.push("finding detail did not open");
}

// Share controls must exist and must not require an account.
for (const label of [/^Copy/, /^Share/, /PDF$/]) {
  if ((await page.getByRole("button", { name: label }).count()) === 0)
    problems.push(`missing share control ${label}`);
}

// Follow the contextual CTA into lead capture and submit it.
const cta = page.getByRole("link", { name: /Review these findings|Pressure-test|Talk through/ }).first();
if ((await cta.count()) === 0) {
  problems.push("no conversion CTA on an actionable report");
} else {
  await cta.click();
  await page.waitForURL("**/talk**");
  await page.waitForLoadState("networkidle");

  const prefilled = await page.locator("text=Attached to this request").count();
  if (prefilled === 0) problems.push("lead form does not state what the audit already knows");

  await page.locator("#email").fill("e2e@example.com");
  await page.locator("#name").fill("Dr E2E");
  await page.locator("#practiceName").fill("E2E Dermatology");
  await page.getByRole("button", { name: /^Send$/ }).click();
  await page.waitForSelector("text=That came through", { timeout: 10_000 });
}

// The report link must still work, and must carry no contact details.
await page.goto(`${BASE}/results?a=${reportParam}`, { waitUntil: "networkidle" });
const shared = await page.locator("body").innerText();
if (/e2e@example\.com|Dr E2E/.test(shared))
  problems.push("shared report leaked lead contact details");

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
