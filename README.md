# QNTM Practice Audit

A five-minute operational diagnostic for independent dermatology practices. A
physician answers ~16 questions about how their practice runs and gets a
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
npm test             # vitest — 84 tests over the calculation engine
npm run build        # production build
```

## Layout

```
app/
  page.tsx                 landing page
  audit/                   guided question flow
  results/                 the physician-facing report
  brief/                   internal opportunity brief (sales, noindex)
  talk/                    optional lead capture, reachable only after results
  api/events/              analytics sink (no-op unless a webhook is configured)
  api/lead/                consultation requests (no-op unless configured)
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
    audit.ts               runAudit() — the one entry point
    brief.ts               internal sales brief
    profiles.ts            three synthetic demo practices
  share.ts                 URL encoding for shareable reports
  summary.ts               plain-text report for "Copy summary"
  analytics.ts             event vocabulary and a swappable sink
components/                UI only; no formulas live here
tests/                     engine tests
scripts/
  visual-qa.mjs            screenshots every surface, fails on console errors
                           and horizontal overflow
  e2e-walkthrough.mjs      completes the audit in a real browser
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
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | `"true"` to POST events to `/api/events` |
| `ANALYTICS_WEBHOOK_URL` | Downstream analytics destination |
| `LEAD_WEBHOOK_URL` | Where consultation requests are forwarded |

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
npx next start -p 3210
node scripts/e2e-walkthrough.mjs
node scripts/visual-qa.mjs ./.visual-qa
```

`visual-qa.mjs` screenshots the landing page, the audit flow, all three demo
reports, a deliberately sparse report, the print stylesheet, the brief, and the
lead form, at desktop and mobile widths — and exits non-zero on any console
error or horizontal overflow.

## Further reading

- [`PRODUCT.md`](PRODUCT.md) — who this is for, the promise, the user flow
- [`MODEL.md`](MODEL.md) — every calculation, curve, and assumption
- [`SALES.md`](SALES.md) — how QNTM should use the output
- [`METRICS.md`](METRICS.md) — instrumentation and the funnel
- [`SCOPE.md`](SCOPE.md) — what this is deliberately not
