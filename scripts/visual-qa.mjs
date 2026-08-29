/**
 * Visual QA harness. Screenshots every surface at desktop and mobile widths
 * against a running server, and fails loudly on any console or page error.
 *
 *   npx next build && npx next start -p 3210
 *   node scripts/visual-qa.mjs <output-dir> [baseUrl]
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";

const OUT = process.argv[2] ?? "./.visual-qa";
const BASE = process.argv[3] ?? "http://localhost:3210";
mkdirSync(OUT, { recursive: true });

const REPORTS = {
  solo: "1_0_1100000_4_30_2_2_o_7_~_12_130_26_31_8_6_44_2100",
  group: "3_2_5400000_4.5_26_11_13_i_~_3_9_340_14_19_7_34_58_11500",
  growth: "2_3_5200000_4.5_36_6_9_h_4.5_1_7_260_11_26_15_28_36_7400",
  sparse: "1_0_900000_4_24_2_2_i_~_~_~_~_~_~_~_~_~_~",
  // A genuinely well-run practice — the report should decline to sell.
  healthy: "1_1_1900000_4_30_2_3_o_4_~_3_110_4_8_4_3_26_2400",
};

const INTERNAL_KEY = process.env.INTERNAL_ACCESS_TOKEN ?? "test-token-abc123";

const DESKTOP = { viewport: { width: 1440, height: 1000 } };
const MOBILE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

// PLAYWRIGHT_BROWSERS_PATH points at a pre-installed Chromium; fall back to
// whatever Playwright resolves on its own if the pinned path is absent.
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch(
  existsSync(CHROME) ? { executablePath: CHROME } : {},
);
const problems = [];

async function shoot(name, path, ctxOpts, opts = {}) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[${name}] console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  await page.goto(BASE + path, {
    waitUntil: path.startsWith("/internal") ? "domcontentloaded" : "networkidle",
  });
  if (path.startsWith("/internal")) await page.waitForTimeout(500);
  if (opts.before) await opts.before(page);
  if (opts.media) await page.emulateMedia(opts.media);

  // Horizontal overflow is the most common responsive defect and the easiest
  // to miss in a screenshot, so assert on it directly.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 1) problems.push(`[${name}] horizontal overflow: ${overflow}px`);

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: opts.full !== false });
  await ctx.close();
}

await shoot("01-landing-A-desktop", "/?v=A", DESKTOP);
await shoot("01b-landing-B-desktop", "/?v=B", DESKTOP);
await shoot("02-landing-A-mobile", "/?v=A", MOBILE);
await shoot("02b-landing-B-mobile", "/?v=B", MOBILE);
await shoot("03-audit-step1-desktop", "/audit", DESKTOP);
await shoot("04-audit-step1-mobile", "/audit", MOBILE);
await shoot("05-audit-billing-desktop", "/audit?demo=group-overhead", DESKTOP, {
  before: async (page) => {
    // Walk to the billing step so the conditional fields render.
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForTimeout(120);
    }
    await page.getByRole("button", { name: /Outsourced/ }).click();
    await page.waitForTimeout(150);
  },
});
await shoot(`06-report-solo-desktop`, `/results?a=${REPORTS.solo}`, DESKTOP);
await shoot(`07-report-solo-mobile`, `/results?a=${REPORTS.solo}`, MOBILE);
await shoot(`08-report-group-desktop`, `/results?a=${REPORTS.group}`, DESKTOP);
await shoot(`09-report-growth-desktop`, `/results?a=${REPORTS.growth}`, DESKTOP);
await shoot(`10-report-sparse-desktop`, `/results?a=${REPORTS.sparse}`, DESKTOP);
await shoot(`11-report-print`, `/results?a=${REPORTS.growth}`, DESKTOP, {
  media: { media: "print" },
});
await shoot(`12-brief-desktop`, `/internal/brief?a=${REPORTS.group}&key=${INTERNAL_KEY}`, DESKTOP);
await shoot(`22-pilot-desktop`, `/internal/pilot?key=${INTERNAL_KEY}`, DESKTOP);
await shoot(`23-pilot-mobile`, `/internal/pilot?key=${INTERNAL_KEY}`, MOBILE);
await shoot(`24-calibration-desktop`, `/internal/calibration?key=${INTERNAL_KEY}`, DESKTOP);
await shoot(`13-brief-mobile`, `/internal/brief?a=${REPORTS.group}&key=${INTERNAL_KEY}`, MOBILE);
await shoot(`26-setup-desktop`, `/internal/setup?key=${INTERNAL_KEY}`, DESKTOP);
await shoot(`27-setup-mobile`, `/internal/setup?key=${INTERNAL_KEY}`, MOBILE);
await shoot(`28-campaigns-desktop`, `/internal/campaigns?key=${INTERNAL_KEY}`, DESKTOP);
await shoot(`29-campaigns-mobile`, `/internal/campaigns?key=${INTERNAL_KEY}`, MOBILE);
// The call view is built for a phone in hand; mobile is the primary check.
await shoot(`30-call-mobile`, `/internal/call?a=${REPORTS.group}&key=${INTERNAL_KEY}`, MOBILE);
await shoot(`31-call-desktop`, `/internal/call?a=${REPORTS.group}&key=${INTERNAL_KEY}`, DESKTOP);
await shoot(`32-pilot-filtered`, `/internal/pilot?filter=no-lead&key=${INTERNAL_KEY}`, DESKTOP);
await shoot(`14-talk-desktop`, `/talk?a=${REPORTS.group}`, DESKTOP);
await shoot(`15-talk-mobile`, `/talk?a=${REPORTS.group}`, MOBILE);
await shoot(`16-results-badlink`, `/results?a=broken`, DESKTOP);
await shoot(`17-report-healthy-desktop`, `/results?a=${REPORTS.healthy}`, DESKTOP);
await shoot(`18-report-healthy-mobile`, `/results?a=${REPORTS.healthy}`, MOBILE);
await shoot(`19-demo-desktop`, `/demo`, DESKTOP);
await shoot(`20-demo-mobile`, `/demo`, MOBILE);
await shoot(`21-report-expanded-desktop`, `/results?a=${REPORTS.group}`, DESKTOP, {
  before: async (page) => {
    // Open every disclosure so the expanded state is inspected too. Each
    // click flips the button label, so re-query rather than caching a list.
    for (let i = 0; i < 12; i++) {
      const next = page.getByRole("button", { name: /Show the evidence/ }).first();
      if ((await next.count()) === 0) break;
      await next.click();
      await page.waitForTimeout(60);
    }
    for (const name of [/How every figure/, /Every threshold/]) {
      const btn = page.getByRole("button", { name }).first();
      if (await btn.count()) await btn.click();
    }
    await page.waitForTimeout(300);
  },
});

await browser.close();

if (problems.length) {
  console.error("PROBLEMS FOUND:");
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(`Clean. Screenshots in ${OUT}`);
