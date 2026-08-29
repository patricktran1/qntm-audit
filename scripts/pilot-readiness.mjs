#!/usr/bin/env node
/**
 * PILOT READINESS CHECK
 *
 *   npm run pilot:check                                  # against http://localhost:3000
 *   npm run pilot:check -- --base https://example.com    # against production
 *   npm run pilot:check -- --base … --test-lead          # also send a [TEST] lead
 *
 * Verifies from the outside what /internal/setup verifies from the inside:
 * public surfaces up, internal surfaces failing closed, and — when
 * INTERNAL_ACCESS_TOKEN is present in this shell's environment — that the
 * token actually opens the gate. The authoritative environment check for a
 * deployment is /internal/setup itself, because this shell's variables are
 * not the deployment's.
 *
 * Never prints the value of any environment variable. Never sends outreach:
 * the only thing it can send is the clearly-labelled [TEST] lead, and only
 * behind an explicit flag.
 */

const args = process.argv.slice(2);
const baseArg = args.indexOf("--base");
const base = (baseArg >= 0 ? args[baseArg + 1] : "http://localhost:3000")?.replace(/\/$/, "");
const wantTestLead = args.includes("--test-lead");
const token = process.env.INTERNAL_ACCESS_TOKEN;

let failures = 0;
const ok = (name, detail = "") => console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
const warn = (name, detail = "") => console.log(`  ~ ${name}${detail ? ` — ${detail}` : ""}`);
const bad = (name, detail = "") => {
  failures += 1;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
};

async function get(path, headers = {}) {
  const res = await fetch(`${base}${path}`, { headers, redirect: "manual" });
  return res;
}

console.log(`\nPilot readiness against ${base}\n`);

// ── 1. This shell's environment (presence only) ────────────────────────────
console.log("Environment in THIS shell (a Vercel deployment has its own — check /internal/setup there):");
for (const [name, required] of [
  ["INTERNAL_ACCESS_TOKEN", true],
  ["PILOT_KV_REST_URL", true],
  ["PILOT_KV_REST_TOKEN", true],
  ["LEAD_WEBHOOK_URL", false],
  ["LEAD_SLACK_WEBHOOK_URL", false],
  ["NEXT_PUBLIC_SITE_URL", false],
  ["NEXT_PUBLIC_ANALYTICS_ENABLED", false],
]) {
  const present = Boolean(process.env[name]);
  if (present) ok(`${name} present`);
  else if (required) warn(`${name} not set here`, "fine if it is set on the deployment");
  else console.log(`  · ${name} not set (optional)`);
}

// ── 2. Public surfaces ─────────────────────────────────────────────────────
console.log("\nPublic surfaces:");
try {
  const landing = await get("/");
  const html = await landing.text();
  if (landing.status === 200 && html.includes("QNTM")) ok("landing renders");
  else bad("landing", `status ${landing.status}`);

  for (const path of ["/audit", "/demo"]) {
    const res = await get(path);
    if (res.status === 200) ok(`${path} renders`);
    else bad(path, `status ${res.status}`);
  }

  const robots = await get("/robots.txt");
  const robotsText = await robots.text();
  if (robots.status === 200 && robotsText.includes("Disallow: /internal"))
    ok("robots.txt disallows /internal");
  else bad("robots.txt", "missing Disallow: /internal");

  // A known-good share link must render a report server-side.
  const share =
    "1_0_1100000_4_30_2_2_o_7_~_12_130_26_31_8_6_44_2100";
  const results = await get(`/results?a=${share}`);
  if (results.status === 200) ok("share link renders a report");
  else bad("share link", `status ${results.status}`);
} catch (e) {
  bad("public surface check", e.message);
}

// ── 3. Internal surfaces fail closed ───────────────────────────────────────
console.log("\nInternal surfaces without credentials:");
for (const path of [
  "/internal/pilot",
  "/internal/setup",
  "/internal/campaigns",
  "/internal/call",
  "/internal/calibration",
  "/internal/api/export",
]) {
  try {
    const res = await get(path);
    const robotsHeader = res.headers.get("x-robots-tag") ?? "";
    if (res.status === 404 && robotsHeader.includes("noindex"))
      ok(`${path} → 404 + noindex`);
    else if (res.status === 404) warn(`${path} → 404`, "but no x-robots-tag");
    else if (res.status === 200 && base.startsWith("http://localhost"))
      warn(`${path} open`, "expected in development with no token");
    else bad(`${path}`, `status ${res.status} — must fail closed`);
  } catch (e) {
    bad(path, e.message);
  }
}

// ── 4. Authenticated access (only if the token is in this shell) ───────────
if (token) {
  console.log("\nAuthenticated access (token from this shell; value never printed):");
  const cookie = { cookie: `qntm_internal=${encodeURIComponent(token)}` };
  try {
    const setup = await get("/internal/setup", cookie);
    if (setup.status === 200) ok("/internal/setup opens with the token");
    else bad("/internal/setup with token", `status ${setup.status}`);

    const csv = await get("/internal/api/export?kind=sessions", cookie);
    const text = await csv.text();
    if (csv.status === 200 && text.startsWith('"session_id"'))
      ok("session export returns CSV");
    else bad("session export with token", `status ${csv.status}`);
  } catch (e) {
    bad("authenticated check", e.message);
  }

  if (wantTestLead) {
    console.log("\nTest lead (explicitly requested):");
    try {
      const res = await fetch(`${base}/internal/api/test-lead`, {
        method: "POST",
        headers: cookie,
      });
      const body = await res.json();
      if (body.ok) ok(`delivered via [${body.sinks.join(", ")}]`, "check the channel for [TEST]");
      else bad("test lead", body.error ?? `failed for [${(body.failures ?? []).join(", ")}]`);
    } catch (e) {
      bad("test lead", e.message);
    }
  }
} else {
  console.log(
    `\nNo INTERNAL_ACCESS_TOKEN in this shell — skipping authenticated checks${wantTestLead ? " (and the requested test lead)" : ""}.`,
  );
  if (wantTestLead) failures += 1;
}

console.log(
  failures === 0
    ? "\n✓ All checks passed.\n"
    : `\n✗ ${failures} check${failures === 1 ? "" : "s"} failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
