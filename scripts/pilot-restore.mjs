#!/usr/bin/env node
/**
 * PILOT RESTORE
 *
 * Restores a backup produced by /internal/api/export?kind=backup into the
 * Upstash database named by PILOT_KV_REST_URL / PILOT_KV_REST_TOKEN.
 *
 *   PILOT_KV_REST_URL=… PILOT_KV_REST_TOKEN=… \
 *     node scripts/pilot-restore.mjs qntm-pilot-backup-2026-08-29.json --yes
 *
 * Deliberately a CLI and not a button: a restore overwrites records that
 * share ids with the backup, and that decision belongs in a terminal with a
 * file path in hand, not one click from a dashboard. Without --yes it prints
 * what it WOULD do and exits.
 *
 * It never prints credentials. It writes only the four pilot keys.
 */

import { readFileSync } from "node:fs";

const SESSION_HASH = "qntm:pilot:sessions";
const SESSION_INDEX = "qntm:pilot:session_index";
const OUTCOME_HASH = "qntm:pilot:outcomes";
const OUTCOME_INDEX = "qntm:pilot:outcome_index";
const PROGRESS_HASH = "qntm:pilot:progress";
const PROGRESS_INDEX = "qntm:pilot:progress_index";

const args = process.argv.slice(2);
const yes = args.includes("--yes");
const file = args.find((a) => !a.startsWith("--"));

const url = process.env.PILOT_KV_REST_URL?.replace(/\/$/, "");
const token = process.env.PILOT_KV_REST_TOKEN;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!file) fail("Usage: node scripts/pilot-restore.mjs <backup.json> [--yes]");
if (!url || !token)
  fail(
    "PILOT_KV_REST_URL and PILOT_KV_REST_TOKEN must be set in the environment. Their values are never printed.",
  );

let backup;
try {
  backup = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  fail(`Could not read ${file}: ${e.message}`);
}

if (backup.format !== "qntm-pilot-backup" || backup.version !== 1)
  fail(
    `Not a recognised backup (format=${backup.format ?? "?"}, version=${backup.version ?? "?"}).`,
  );

const sessions = Array.isArray(backup.sessions) ? backup.sessions : [];
const outcomes = Array.isArray(backup.outcomes) ? backup.outcomes : [];
// Progress arrived after backup format 1 shipped, so it may be absent.
const progress = Array.isArray(backup.progress) ? backup.progress : [];
const isId = (v) => typeof v === "string" && /^ps_[0-9a-f]{24}$/.test(v);
const badSessions = sessions.filter((s) => !isId(s.sessionId)).length;
const badOutcomes = outcomes.filter((o) => !isId(o.sessionId)).length;
const badProgress = progress.filter((p) => !isId(p.sessionId)).length;
if (badSessions || badOutcomes || badProgress)
  fail(
    `Backup contains malformed ids (${badSessions} sessions, ${badOutcomes} outcomes, ${badProgress} progress). Refusing.`,
  );

console.log(`Backup ${file}`);
console.log(`  exported ${backup.exportedAt} under model ${backup.modelVersion}`);
console.log(
  `  ${sessions.length} sessions, ${outcomes.length} outcomes, ${progress.length} progress`,
);
console.log(
  `  restore overwrites any existing record sharing an id; records only in the store are kept`,
);

if (!yes) {
  console.log("\nDry run. Re-run with --yes to write.");
  process.exit(0);
}

async function pipeline(commands) {
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`store responded ${res.status}`);
  const body = await res.json();
  for (const r of body) if (r.error) throw new Error("store command error");
  return body.map((r) => r.result);
}

try {
  // Write records first, then rebuild each index newest-first in one shot.
  // Batched so a large backup does not build one giant request.
  const writes = [];
  for (const s of sessions)
    writes.push(["HSET", SESSION_HASH, s.sessionId, JSON.stringify(s)]);
  for (const o of outcomes)
    writes.push(["HSET", OUTCOME_HASH, o.sessionId, JSON.stringify(o)]);
  for (const p of progress)
    writes.push(["HSET", PROGRESS_HASH, p.sessionId, JSON.stringify(p)]);
  for (let i = 0; i < writes.length; i += 100)
    await pipeline(writes.slice(i, i + 100));

  const indexCommands = [];
  // Backups hold sessions newest-first (readAll order). LPUSH reverses, so
  // push oldest-first to land newest at the head again.
  for (const s of [...sessions].reverse())
    indexCommands.push(
      ["LREM", SESSION_INDEX, "0", s.sessionId],
      ["LPUSH", SESSION_INDEX, s.sessionId],
    );
  for (const o of [...outcomes].reverse())
    indexCommands.push(
      ["LREM", OUTCOME_INDEX, "0", o.sessionId],
      ["LPUSH", OUTCOME_INDEX, o.sessionId],
    );
  for (const p of [...progress].reverse())
    indexCommands.push(
      ["LREM", PROGRESS_INDEX, "0", p.sessionId],
      ["LPUSH", PROGRESS_INDEX, p.sessionId],
    );
  for (let i = 0; i < indexCommands.length; i += 100)
    await pipeline(indexCommands.slice(i, i + 100));

  const [sessionCount, outcomeCount, progressCount] = await pipeline([
    ["LLEN", SESSION_INDEX],
    ["LLEN", OUTCOME_INDEX],
    ["LLEN", PROGRESS_INDEX],
  ]);
  console.log(
    `✓ Restored. Store now indexes ${sessionCount} sessions, ${outcomeCount} outcomes and ${progressCount} progress records.`,
  );
} catch (e) {
  fail(`Restore failed: ${String(e.message).replace(/https?:\/\/\S+/g, "[url]")}`);
}
