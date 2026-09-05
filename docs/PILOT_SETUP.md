# PILOT SETUP

One-time production configuration, in order. When every step is done,
`/internal/setup` shows **Ready** and the runbook (`PILOT_RUNBOOK.md`) takes
over. Do not skip step 9 — the walkthrough audit is the only check that
exercises the whole loop with real HTTP.

Nothing in this document contains a secret, and no step ever asks you to
commit one. Every credential lives in Vercel's environment settings.

## 1. Generate a strong internal token

```bash
openssl rand -hex 32
```

Copy the 64-character output. This is `INTERNAL_ACCESS_TOKEN` — the shared
secret behind every `/internal` surface. Treat it like a password: password
manager, not a note.

## 2. Create the Upstash Redis database

1. <https://console.upstash.com> → **Create Database**.
2. Name: `qntm-pilot`. Type: **Regional**. Region: **us-east-1 (N. Virginia)**
   — the Vercel deployment runs in `iad1`, and keeping them adjacent keeps
   store round trips in single-digit milliseconds.
3. Leave TLS on (default). The free tier is far more than a 50-practice pilot
   needs.

## 3. Get its REST credentials

On the database's page, under **REST API**:

- `UPSTASH_REDIS_REST_URL` → this is your `PILOT_KV_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN` → this is your `PILOT_KV_REST_TOKEN`

Use the full-access token, not the read-only one — the store writes.

## 4. Configure Vercel production environment variables

Vercel dashboard → the `qntm-practice-audit` project → **Settings →
Environment Variables**. Add, for the **Production** environment:

| Variable | Value | Required |
| --- | --- | --- |
| `INTERNAL_ACCESS_TOKEN` | output of step 1 | yes |
| `PILOT_KV_REST_URL` | from step 3 | yes |
| `PILOT_KV_REST_TOKEN` | from step 3 | yes |
| `NEXT_PUBLIC_SITE_URL` | `https://qntm-practice-audit.vercel.app` (or the custom domain) | recommended |

## 5. Configure lead delivery

At least one sink, so a physician asking to talk reaches you within minutes:

- **Slack (recommended):** create an incoming webhook — Slack → workspace
  settings → Apps → Incoming Webhooks → pick a private channel like
  `#qntm-leads` → copy the URL into `LEAD_SLACK_WEBHOOK_URL`.
- **Generic webhook:** any endpoint that accepts a JSON POST (Zapier, Make,
  your own service) into `LEAD_WEBHOOK_URL`. The payload is the full lead
  record; treat the receiving end as confidential.

Optional analytics: `NEXT_PUBLIC_ANALYTICS_ENABLED=true` and
`ANALYTICS_WEBHOOK_URL=…`. The pilot's learning loop does not depend on
either.

## 6. Redeploy

Environment variables apply at build/boot, so trigger a redeploy: Vercel →
Deployments → ⋯ on the latest → **Redeploy**. Wait for READY.

## 7. Open /internal/setup

Visit:

```
https://<your-domain>/internal/setup?key=<INTERNAL_ACCESS_TOKEN>
```

The `?key=` exchanges itself for a 12-hour cookie and disappears from the
address bar. Everything after this happens in the browser without the token
in any URL.

## 8. Run the health checks

The page runs them on every load. All of these must be green:

- Internal access — configured
- Pilot store — configured, and the round trip (write → read → delete)
  passes with a sane latency
- Lead delivery — at least one sink configured; press **Send test lead
  notification** and confirm a message headlined `[TEST]` arrives in the
  channel
- Site URL — no mismatch warning
- Model — version 1.1.0, pilot freeze active

From your own machine you can double-check the outside view:

```bash
npm run pilot:check -- --base https://<your-domain>
```

(and with `INTERNAL_ACCESS_TOKEN` exported in that shell, it also verifies
the token opens the gate — the value is never printed.)

## 9. Complete one test audit end to end

1. On `/internal/setup`, press **Mark this browser as a test device**. Every
   audit from this browser is now flagged `isTest` and excluded from learning.
2. Open `/internal/campaigns`, build a link with `source=personal`,
   `campaign=founder_pilot`, `cohort=first10`, copy it, and open it in the
   same browser.
3. Complete the audit with plausible numbers. Read the report. Move one
   assumption slider. Click the CTA and submit the lead form with your own
   email.
4. Confirm: the lead notification arrives (marked `[TEST]`), the session
   appears on `/internal/pilot` flagged `test` with your attribution, and the
   **Call** and **Brief** links open.

## 10. Record one test discovery outcome

From the session's brief, fill in the **After the call** form with anything
and save. Confirm the session shows **Outcome recorded** on `/internal/pilot`
and that `/internal/setup` counts it in the store line.

`/internal/calibration` will still read zero, and that is the point: test
records are excluded from every learning surface by design. An empty
calibration page here is proof the isolation works, not a failure. Do not
unmark the test device to make it appear — that writes QA traffic into the
real dataset.

## 11. Delete the test records

Back on `/internal/setup`, press **Clear test records**. The dashboard should
return to zero real sessions. The pilot now starts from a verifiably clean,
verifiably working state.

Leave the browser marked as a test device on any machine you will demo or QA
from. Unmark it only if you genuinely intend to take the audit as yourself.

---

## Backup and recovery

- **Backup (recommended weekly during the pilot):**
  `/internal/api/export?kind=backup` downloads the complete dataset —
  sessions and outcomes, full fidelity — as JSON. Store it with the same
  care as the store itself.
- **Restore:** `PILOT_KV_REST_URL=… PILOT_KV_REST_TOKEN=… npm run
  pilot:restore -- <backup.json> --yes`. Overwrites records sharing an id
  with the backup; records only in the store are kept. Run without `--yes`
  first for a dry run.
- **If Redis disappeared with no backup:** pilot sessions, assumption
  changes, and discovery outcomes are gone — that is the whole calibration
  dataset, which is why the weekly backup matters. Not lost: leads (they
  live in the Slack channel / webhook receiver), the product itself, and
  every report link a physician holds (share links encode answers, not
  store state).
- **Deleting data** — one practice or everything — is documented with exact
  commands in `PRIVACY.md`.

## Reference: every variable

| Variable | Effect when unset |
| --- | --- |
| `INTERNAL_ACCESS_TOKEN` | `/internal/*` fails closed (404) in production |
| `PILOT_KV_REST_URL` + `PILOT_KV_REST_TOKEN` | persistence is a no-op; nothing recorded, outcomes cannot save |
| `LEAD_WEBHOOK_URL` | webhook sink off |
| `LEAD_SLACK_WEBHOOK_URL` | Slack sink off (with neither sink, leads are logged server-side only) |
| `NEXT_PUBLIC_SITE_URL` | campaign links and notification brief-links fall back to the request host / relative paths |
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | client analytics events stay local |
| `ANALYTICS_WEBHOOK_URL` | no analytics sink |
