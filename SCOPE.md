# SCOPE

This is one diagnostic tool, not a platform. The value of writing this down is
that it makes cutting easy later.

## In scope

- A guided audit of seventeen high-signal operating questions across nine screens
- A deterministic calculation engine with published formulas and curves
- A physician-facing report: score, ranked opportunities, economics, time leaks,
  automation candidates, open questions, a 30-day plan, editable assumptions
- Print-to-PDF, copy-summary, and a shareable link that needs no account
- An internal opportunity brief for sales enablement
- Three synthetic demo practices
- Thin analytics behind a swappable sink
- Optional lead capture, only after the complete report, with a server-side
  delivery abstraction that degrades to accept-and-log
- A contextual conversion module derived from the audit's verdict
- A landing-page experiment with persisted assignment
- A gated internal area: pre-call sales brief and a session-events view
- A threshold provenance registry and an empty, documented benchmark contract

## Out of scope

Cut on sight if any of these start appearing:

- Practice management system, EHR, scheduling, or charting
- CRM, pipeline management, or sequenced outreach
- Billing or RCM platform, claims submission, clearinghouse integration
- Accounting, payroll, or bookkeeping
- Bank, credit, or financial-account integration
- Live claims, eligibility, or payer API integration
- A benchmarking database — see below
- Implementation project management or task tracking
- The full QNTM marketing site
- Autonomous financial advice, valuation, or anything a physician could
  reasonably mistake for an audited financial statement
- User accounts, saved history, multi-user workspaces, or a report archive
- Real authentication for the internal area (a shared secret is the current,
  documented trade — see SECURITY.md)
- A distributed rate limiter, an analytics dashboard, or session replay

## Decisions worth recording

**No database.** Reports encode into the URL. This removes accounts, storage,
GDPR/HIPAA surface, and a lead gate in one decision, and it is why the report can
be given away before asking for anything. If report history is ever genuinely
needed, it is a new decision with a new cost, not an obvious next step.

**No benchmark data set.** Covered in `MODEL.md`. The short version: we cannot
verify a specific industry figure to a specific source and year, and one invented
average discredits the whole report. Practice-specific arithmetic and published
scoring curves do the job without the risk. If authoritative licensed data ever
becomes available, it goes in with source and year attached and stays visually
distinct from assumptions.

**No language model.** The report is a pure function. Determinism is testable,
auditable, free, instant, and immune to the "this is just ChatGPT with a form"
objection — which is the objection this category most deserves.

**The verdict lives in the engine, not the UI.** Whether a practice should be
sold to is a conclusion about the data, so it is computed once and consumed by
the report, the CTA, and the sales brief. Putting it in a component would let
the three disagree, and the first physician to notice would be right to stop
reading.

**Bands, not values, in analytics.** Enforced by the event union type. The
alternative — emitting raw collections and promising not to misuse it — is a
policy, and policies are not enforced by anything.

**PDF via the browser's print engine.** No PDF library, no headless render
service. A dedicated print stylesheet produces a text-selectable, correctly
paginated document on every platform, and it looks better than a canvas render.

**Seventeen questions rather than ten to fifteen.** A considered overrun. Every
field has a named consumer — a scored dimension or a detector — and dropping any
of them would silently degrade a finding rather than simplify the product. The
binding constraint is the five-minute promise, which nine short screens meet; an
automated walkthrough completes the flow in seconds and a human takes about four
minutes. If a field ever stops earning its place, `MODEL.md` has the table that
identifies it.

## Deliberately not built in this MVP

Not scope creep — just not first:

- Specialty variants beyond dermatology (the framework generalises; the curves
  and copy do not yet)
- Server-side report persistence and email delivery
- A/B testing of the question set
- Multi-language support
- Real identity behind `/internal`. It is now gated by a shared secret with a
  timing-safe comparison, a 404 rather than a 401, and a fail-closed default in
  production — but everyone with the token has the same access and there is no
  audit trail. That is a good trade for a handful of people and a bad one at
  thirty. SSO in front of `/internal` is the upgrade, and it is a project.
- A globally consistent rate limiter. The current one is per warm instance,
  which stops casual abuse and not a distributed attacker.
- Any benchmark data. The layer is built and the contract documented; the array
  is deliberately empty until real distributions exist.
