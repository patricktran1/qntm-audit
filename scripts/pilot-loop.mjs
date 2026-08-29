/**
 * End-to-end pilot loop check.
 *
 * Walks an attributed visitor from an outreach link through the audit, the
 * report, the CTA and lead capture, then records a discovery outcome from the
 * brief and verifies every step is joined by one session id and visible to the
 * operator. This is the path the whole phase exists to make possible.
 *
 *   node scripts/pilot-loop.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3210";
const KEY = process.env.INTERNAL_ACCESS_TOKEN ?? "test-token-abc123";
const CHROME =
  process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const ANSWERS = {
  "Physicians (FTE)": "3",
  "PAs / NPs (FTE)": "1",
  "Clinic days per week": "4",
  "Patients per provider per clinic day": "30",
  "Annual collections": "4200000",
  "Front office (FTE)": "6",
  "Clinical support (FTE)": "7",
  "Billing company fee": "7.5",
  "Days in A/R": "58",
  "Third-next-available new patient appointment": "34",
  "No-show + same-day cancellation rate": "13",
  "Inbound calls on a typical clinic day": "250",
  "Calls that ring out, abandon, or go to voicemail": "21",
  "Physician admin hours per week": "13",
  "Staff hours per week on prior authorizations": "26",
  "Total software spend per month": "6800",
};

const problems = [];
const browser = await chromium.launch(
  existsSync(CHROME) ? { executablePath: CHROME } : {},
);
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text()}`);
});

// ── 1. Arrive from an attributed outreach link ──────────────────────────────
await page.goto(
  `${BASE}/?source=leaderm&campaign=conference-followup&cohort=first10`,
  { waitUntil: "networkidle" },
);

const attribution = await page.evaluate(() =>
  window.localStorage.getItem("qntm.pilot.attribution"),
);
if (!attribution?.includes("leaderm"))
  problems.push(`attribution not captured: ${attribution}`);
if (!attribution?.includes("conference-followup"))
  problems.push("campaign not captured");

// ── 2. Complete the audit ───────────────────────────────────────────────────
await page.getByRole("link", { name: /^(Start audit|Calculate my hourly value)$/ }).first().click();
await page.waitForURL("**/audit");
await page.waitForLoadState("networkidle");
await page.getByLabel("Physicians (FTE)", { exact: true }).waitFor();

let step = 0;
while (!page.url().includes("/results")) {
  if (++step > 20) throw new Error("audit did not terminate");
  const outsourced = page.getByRole("button", { name: /^Outsourced/ });
  if (await outsourced.count()) await outsourced.click();
  for (const [label, value] of Object.entries(ANSWERS)) {
    const field = page.getByLabel(label, { exact: true });
    if (await field.count()) await field.fill(value);
  }
  const cont = page.getByRole("button", { name: /^(Continue|See results)$/ });
  if (await cont.isDisabled()) throw new Error(`step ${step} blocked`);
  await cont.click();
  await page.waitForTimeout(150);
}
await page.waitForSelector("text=Practice Leverage Score");
await page.waitForTimeout(700); // let the pilot write land

const sessionId = await page.evaluate(() =>
  window.localStorage.getItem("qntm.pilot.session"),
);
if (!/^ps_[0-9a-f]{24}$/.test(sessionId ?? ""))
  problems.push(`bad session id: ${sessionId}`);

// ── 3. Move an assumption, so a challenge is recorded ───────────────────────
const slider = page.locator('input[type="range"]').first();
await slider.evaluate((el) => {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(el, el.min);
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForTimeout(300);

// ── 4. Follow the CTA and submit a lead ─────────────────────────────────────
const cta = page
  .getByRole("link", { name: /Review these findings|Pressure-test|Talk through/ })
  .first();
if ((await cta.count()) === 0) problems.push("no CTA on an actionable report");
else {
  await cta.click();
  await page.waitForURL("**/talk**");
  await page.waitForLoadState("networkidle");
  await page.locator("#email").fill("pilot@example.com");
  await page.locator("#name").fill("Dr Pilot");
  await page.locator("#practiceName").fill("Pilot Dermatology");
  await page.getByRole("button", { name: /^Send$/ }).click();
  await page.waitForSelector("text=That came through", { timeout: 10_000 });
}

// ── 5. Operator view: the session must be visible and joined ────────────────
const opCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const op = await opCtx.newPage();
op.on("pageerror", (e) => problems.push(`operator pageerror: ${e.message}`));
// Internal pages are no-store and render server-side; domcontentloaded is the
// right signal, and networkidle would wait on RSC chatter that never settles.
await op.goto(`${BASE}/internal/pilot?key=${KEY}`, { waitUntil: "domcontentloaded" });
await op.waitForSelector("text=Pilot health");

const pilotText = await op.locator("body").innerText();
if (!pilotText.includes(sessionId.slice(3, 11)))
  problems.push("session not listed on the pilot dashboard");
if (!pilotText.includes("leaderm"))
  problems.push("attribution not visible on the pilot dashboard");
if (!/Completed audits/i.test(pilotText))
  problems.push("pilot health panel missing");

// ── 6. Record a discovery outcome from the brief ────────────────────────────
await op.getByRole("link", { name: "Brief" }).first().click();
await op.waitForURL("**/internal/brief**");
await op.waitForSelector("text=After the call");

const briefText = await op.locator("body").innerText();
if (!/After the call/i.test(briefText))
  problems.push("outcome form missing from the brief");

await op.selectOption("#callOutcome", "qualified");
await op.selectOption("#auditAccuracy", "confirmed");
await op.selectOption("#economicReaction", "directionally_credible");
await op.selectOption("#serviceRelevant", "Revenue cycle optimization");
await op.locator("#whyBuy").fill("A/R is visibly their problem.");
await op.getByRole("button", { name: /Record outcome|Update outcome/ }).click();
await op.waitForSelector("text=Saved.", { timeout: 10_000 });

// ── 7. Calibration must now show the comparison ─────────────────────────────
await op.goto(`${BASE}/internal/calibration`, { waitUntil: "domcontentloaded" });
await op.waitForSelector("text=Calibration");
const calibText = await op.locator("body").innerText();
if (!/Outcomes recorded/i.test(calibText)) problems.push("calibration panel missing");
if (/Outcomes recorded\s*\n?\s*0/i.test(calibText))
  problems.push("calibration shows no outcomes after one was recorded");

// ── 8. Export must contain the session ──────────────────────────────────────
const csv = await op.evaluate(async (base) => {
  const res = await fetch(`${base}/internal/api/export?kind=sessions`);
  return res.text();
}, BASE);
if (!csv.includes(sessionId)) problems.push("session missing from CSV export");
if (!csv.includes("leaderm")) problems.push("attribution missing from CSV export");
if (csv.includes("pilot@example.com"))
  problems.push("CSV export leaked a contact email");
if (csv.includes("Dr Pilot")) problems.push("CSV export leaked a contact name");

await browser.close();

console.log(`Session: ${sessionId}`);
console.log(`Steps: ${step}`);
console.log(`CSV rows: ${csv.trim().split("\r\n").length - 1}`);
if (problems.length) {
  console.error("\nPROBLEMS:");
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log("\nPilot loop clean.");
