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
};

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
  await page.goto(BASE + path, { waitUntil: "networkidle" });
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

await shoot("01-landing-desktop", "/", DESKTOP);
await shoot("02-landing-mobile", "/", MOBILE);
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
await shoot(`12-brief-desktop`, `/brief?a=${REPORTS.group}`, DESKTOP);
await shoot(`13-brief-mobile`, `/brief?a=${REPORTS.group}`, MOBILE);
await shoot(`14-talk-desktop`, `/talk?a=${REPORTS.solo}`, DESKTOP);
await shoot(`15-talk-mobile`, `/talk?a=${REPORTS.solo}`, MOBILE);
await shoot(`16-results-badlink`, `/results?a=broken`, DESKTOP);

await browser.close();

if (problems.length) {
  console.error("PROBLEMS FOUND:");
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(`Clean. Screenshots in ${OUT}`);
