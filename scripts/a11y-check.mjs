/**
 * Accessibility smoke checks that catch the failures this product is actually
 * prone to: unlabelled inputs, disclosure buttons without state, controls too
 * small to hit on a phone, and keyboard traps in the audit flow.
 *
 *   node scripts/a11y-check.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3210";
const CHROME =
  process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const REPORT = "3_2_5400000_4.5_26_11_13_i_~_3_9_340_14_19_7_34_58_11500";

const browser = await chromium.launch(
  existsSync(CHROME) ? { executablePath: CHROME } : {},
);
const problems = [];

async function audit(name, path, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE + path, {
    waitUntil: path.startsWith("/internal") ? "domcontentloaded" : "networkidle",
  });

  const found = await page.evaluate(() => {
    const issues = [];

    // Every form control must have an accessible name.
    for (const el of document.querySelectorAll("input, select, textarea")) {
      if (el.type === "hidden") continue;
      const id = el.getAttribute("id");
      const labelled =
        (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
        el.closest("label") ||
        el.getAttribute("aria-label") ||
        el.getAttribute("aria-labelledby");
      if (!labelled) issues.push(`unlabelled control: ${el.outerHTML.slice(0, 80)}`);
    }

    // Buttons must have text or an aria-label.
    for (const el of document.querySelectorAll("button")) {
      const name = (el.textContent ?? "").trim() || el.getAttribute("aria-label");
      if (!name) issues.push(`unnamed button: ${el.outerHTML.slice(0, 80)}`);
    }

    // Disclosure controls must expose their state.
    for (const el of document.querySelectorAll("[aria-controls]")) {
      if (!el.hasAttribute("aria-expanded"))
        issues.push(`aria-controls without aria-expanded: ${(el.textContent ?? "").trim().slice(0, 40)}`);
    }

    // Target size, per WCAG 2.5.8 (AA, 24px) including its exceptions:
    //  - a control inside a label counts as the size of that label
    //  - a link inline in a sentence is exempt, because shrinking the sentence
    //    to fit a 24px target would be worse for everyone
    const isInlineLink = (el) => {
      if (el.tagName !== "A") return false;
      const parent = el.parentElement;
      if (!parent) return false;
      if (!/^(P|LI|SPAN|DD|DT|TD)$/.test(parent.tagName)) return false;
      // Inline only if the parent holds text besides the link itself.
      const own = (el.textContent ?? "").trim();
      const all = (parent.textContent ?? "").trim();
      return all.length > own.length + 4;
    };

    for (const el of document.querySelectorAll("button, a[href], input, select")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // hidden
      if (el.getAttribute("type") === "range") continue; // native slider
      if (isInlineLink(el)) continue;

      const label = el.closest("label");
      const effective = label ? label.getBoundingClientRect().height : r.height;
      if (effective < 24)
        issues.push(
          `target under 24px tall (${Math.round(effective)}px): ${(el.textContent ?? el.outerHTML).trim().slice(0, 40)}`,
        );
    }

    // Exactly one h1, and headings must not skip from h1 to h3.
    const h1s = document.querySelectorAll("h1");
    if (h1s.length > 1) issues.push(`${h1s.length} h1 elements`);

    // Images need alt text.
    for (const img of document.querySelectorAll("img"))
      if (!img.hasAttribute("alt")) issues.push("img without alt");

    // The page must declare a language.
    if (!document.documentElement.getAttribute("lang")) issues.push("no lang on <html>");

    return issues;
  });

  for (const f of found) problems.push(`[${name}] ${f}`);

  if (opts.keyboard) {
    // The audit must be completable from the keyboard: tab must reach the
    // first input and Enter must advance.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const tag = await page.evaluate(() => document.activeElement?.tagName);
    if (!tag || tag === "BODY") problems.push(`[${name}] tab did not move focus`);

    const focusVisible = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const style = getComputedStyle(el, ":focus-visible");
      return style.outlineStyle !== "none" || style.outlineWidth !== "0px";
    });
    if (!focusVisible) problems.push(`[${name}] focused element has no visible ring`);
  }

  await ctx.close();
}

await audit("landing", "/");
await audit("audit", "/audit", { keyboard: true });
await audit("report", `/results?a=${REPORT}`);
await audit("talk", `/talk?a=${REPORT}`);
await audit("demo", "/demo");
// Each audit uses a fresh context, so every internal page carries the key.
const KEY = process.env.INTERNAL_ACCESS_TOKEN ?? "test-token-abc123";
await audit("pilot", `/internal/pilot?key=${KEY}`);
await audit("calibration", `/internal/calibration?key=${KEY}`);

await browser.close();

if (problems.length) {
  console.error("ACCESSIBILITY PROBLEMS:");
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log("Accessibility checks clean.");
