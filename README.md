# QNTM Practice Audit

A five-minute operational diagnostic for independent dermatology practices. A
physician answers 17 questions about how their practice runs and gets a
transparent, arithmetic-backed read on where physician time, staff capacity, and
collected revenue are leaking — with every formula and assumption printed next
to the number it produced.

There is no language model in this product. The report is a pure function of the
answers and a set of named, user-editable assumptions.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # next lint
npm test             # vitest — the engine, the pilot, and workflow integrity
npm run build        # production build
npm run pilot:check  # readiness against a running deployment
```

## Layout

```
middleware.ts              experiment assignment + /internal access gate
app/
  page.tsx                 landing page (two experiment variants)
  audit/                   guided question flow
  results/                 the physician-facing report
  demo/                    finished sample reports, for live demonstrations
  talk/                    optional lead capture, reachable only after results
  internal/setup/          production readiness: config, store, sinks, test data
  internal/campaigns/      attributed outreach link generator
  internal/pilot/          operator dashboard: attention queue, cohorts, stop conditions
  internal/call/           one-screen instrument panel for a discovery call
  internal/brief/          pre-call sales brief + discovery outcome capture
  internal/calibration/    predicted pain vs. what discovery calls said
  internal/events/         session event log, for verifying the funnel
  internal/api/            gated: outcome writes, exports, test lead, clear test
  api/pilot/               public: session write, questionnaire progress, CTA mark
  api/events/              analytics sink (no-op unless a webhook is configured)
  api/lead/                lead delivery (accepts and logs when unconfigured)
lib/
  engine/                  all business logic — no React, no UI
    types.ts               domain model
    questions.ts           the question set and step flow
    assumptions.ts         every assumption, with defaults and editable metadata
    derive.ts              practice economics; each metric carries its formula
    score.ts               Practice Leverage Score and its published curves
    findings.ts            13 opportunity detectors
    prioritize.ts          significance vs. rank, and the four buckets
    automation.ts          automation candidates, capped at three
    verdict.ts             the conclusion, and the conversion offer it drives
    thresholds.ts          threshold provenance + the empty benchmark contract
    version.ts             MODEL_VERSION, the compatibility contract, PILOT_FREEZE
    fixtures.ts            twelve golden practices and their invariants
    audit.ts               runAudit() — the one entry point
    brief.ts               internal sales brief
    profiles.ts            three synthetic demo practices
  share.ts                 URL encoding for shareable reports
  experiment.ts            landing-page variant copy
  rate-limit.ts            in-memory fixed-window limiter
  leads/                   lead types, boundary validation, delivery sinks
  pilot/                   identity, attribution, store, snapshot, analysis,
                           deterministic guidance, CSV export
  summary.ts               plain-text report for "Copy summary"
  analytics.ts             event vocabulary and a swappable sink
components/                UI only; no formulas live here
tests/                     engine tests
scripts/
  visual-qa.mjs            screenshots every surface, fails on console errors
                           and horizontal overflow
  e2e-walkthrough.mjs      completes the audit in a real browser
  a11y-check.mjs           labels, disclosure state, target size, keyboard
  pilot-loop.mjs           outreach link → audit → lead → outcome → export
  fake-kv.mjs              in-memory stand-in for the Upstash REST endpoint
  fixture-report.ts        one line per golden practice
  redteam.ts               runs the audit as each buyer archetype
  inspect.ts               prints full audit output for the demo profiles
  dump-report.ts           prints the text report for an encoded answer string
  print-links.ts           prints shareable report links for the demo profiles
```

The rule the codebase enforces: **no business logic in `components/`**. If a
number appears on screen, it came out of `lib/engine`, and it arrived with a
formula string attached.

## No database

Reports are encoded entirely into the URL (`/results?a=...`). There is no
account, no storage, and no lead gate — a physician sees the complete report
before being asked for anything, and the link keeps working whether or not they
ever talk to QNTM. This is a product decision, not a shortcut; see `SCOPE.md`.

## Environment

Everything is optional. With none of these set, the app runs fully and both API
routes accept-and-drop.

| Variable | Purpose |
| --- | --- |
| `INTERNAL_ACCESS_TOKEN` | Gates `/internal/*`. **Unset in production means those routes 404.** |
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | `"true"` to POST events to `/api/events` |
| `ANALYTICS_WEBHOOK_URL` | Downstream analytics destination |
| `LEAD_WEBHOOK_URL` | JSON lead delivery |
| `LEAD_SLACK_WEBHOOK_URL` | Slack message per lead, with a link to the brief |
| `NEXT_PUBLIC_SITE_URL` | Origin used to build absolute brief links in notifications |
| `PILOT_KV_REST_URL` | Upstash Redis REST endpoint. **Unset means no pilot data is retained.** |
| `PILOT_KV_REST_TOKEN` | Upstash REST token |

### Turning the pilot on

The product is fully functional without a pilot store; it simply learns
nothing, and `/internal/pilot` stays empty and says so.

**[`docs/PILOT_SETUP.md`](docs/PILOT_SETUP.md) is the step-by-step version** —
token, Upstash database, Vercel variables, lead sink, redeploy, then the
walkthrough that proves the loop works before real outreach. In short: create
an Upstash Redis database (free tier is ample), set `PILOT_KV_REST_URL` and
`PILOT_KV_REST_TOKEN`, redeploy, and check `/internal/setup`.

No SDK is added and no schema is required. Swapping the backend later means
writing one more implementation of `PilotStore`.

Reach the internal area by visiting `/internal/brief?a=<report>&key=<token>`
once; the key is exchanged for a 12-hour cookie and removed from the URL.

Copy `.env.example` to `.env.local` to set them.

## Deployment

Vercel-ready with no configuration: it is a stock Next.js App Router project
with no database, no queues, and no server state.

```bash
npx vercel        # preview
npx vercel --prod
```

Any Node host works too — `npm run build && npm start`.

## Verification

```bash
npm test && npm run typecheck && npm run lint && npm run build

# Then, against a running server:
INTERNAL_ACCESS_TOKEN=test-token-abc123 npx next start -p 3210

# For the full pilot loop, with a local stand-in for the store:
node scripts/fake-kv.mjs 3311 &
INTERNAL_ACCESS_TOKEN=test-token-abc123 \
  PILOT_KV_REST_URL=http://127.0.0.1:3311 \
  PILOT_KV_REST_TOKEN=test-kv-token npx next start -p 3210
node scripts/pilot-loop.mjs

node scripts/e2e-walkthrough.mjs              # variant A, landing → lead
E2E_VARIANT=B node scripts/e2e-walkthrough.mjs
node scripts/a11y-check.mjs                   # labels, state, targets, keyboard
node scripts/visual-qa.mjs ./.visual-qa       # 34 surfaces, desktop + mobile
npm run pilot:check -- --base http://localhost:3210
```

`visual-qa.mjs` screenshots both landing variants, the audit flow, all three
demo reports, a healthy report, a deliberately sparse report, an expanded
report, the print stylesheet, the demo index, the brief, and the lead form, at
desktop and mobile widths — and exits non-zero on any console error or
horizontal overflow.

`e2e-walkthrough.mjs` completes the audit in a real browser, asserts the
variant the server rendered matches the arm requested, opens a finding, follows
the contextual CTA into lead capture, submits it, and then re-fetches the
report to confirm no contact details leaked into the shareable link.

## Further reading

- [`PILOT_RUNBOOK.md`](PILOT_RUNBOOK.md) — how to operate the first cohort
- [`docs/PILOT_SETUP.md`](docs/PILOT_SETUP.md) — one-time production configuration
- [`PILOT_OUTREACH.md`](PILOT_OUTREACH.md) — message templates for pilot invitations
- [`PRODUCT.md`](PRODUCT.md) — who this is for, the promise, the user flow
- [`MODEL.md`](MODEL.md) — every calculation, curve, and assumption
- [`SALES.md`](SALES.md) — how QNTM should use the output
- [`METRICS.md`](METRICS.md) — instrumentation and the funnel
- [`MODEL_CHANGELOG.md`](MODEL_CHANGELOG.md) — what changed in the model, and why
- [`PRIVACY.md`](PRIVACY.md) — what is stored, what is not, and how to delete it
- [`SECURITY.md`](SECURITY.md) — what is protected, and what is not
- [`BENCHMARKS.md`](BENCHMARKS.md) — the contract real data must satisfy
- [`SCOPE.md`](SCOPE.md) — what this is deliberately not
