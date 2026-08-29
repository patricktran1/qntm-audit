import { chromium } from "playwright";
const OUT = process.argv[2], URL = process.argv[3];
const mobile = process.argv.includes("--mobile");
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext(mobile
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true }
  : { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.4 });
const p = await ctx.newPage();
await p.goto(URL, { waitUntil: "networkidle" });
for (const y of process.argv.slice(4).filter((x) => !x.startsWith("--")).map(Number)) {
  await p.evaluate((yy) => window.scrollTo(0, yy), y);
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${OUT}/c-${mobile ? "m" : "d"}-${y}.png` });
}
await b.close();
