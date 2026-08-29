# METRICS

Instrumentation is deliberately thin: a typed event vocabulary, a queue that
survives a missing provider, and one place to swap in a real destination. There
is no analytics console in this product.

## Implementation

`lib/analytics.ts` exports `track(event)`. It writes to `sessionStorage` so the
funnel can be inspected locally during development, and POSTs to `/api/events`
when `NEXT_PUBLIC_ANALYTICS_ENABLED=true`. `/api/events` forwards to
`ANALYTICS_WEBHOOK_URL` if set, and otherwise accepts and drops.

`track` never throws. Analytics must not be able to break an audit.

## Events

| Event | Fires when | Payload |
| --- | --- | --- |
| `landing_viewed` | Landing page mounts | — |
| `audit_started` | Audit flow mounts | `source`: cta / demo / resume |
| `demo_profile_loaded` | A synthetic practice is loaded | `profile` |
| `step_completed` | A step is advanced | `step`, `index`, `skipped[]` |
| `field_skipped` | A field is left unanswered on advance | `field` |
| `audit_abandoned` | Tab hidden mid-audit | `step`, `index` |
| `audit_completed` | Final step submitted | `durationMs`, `completeness`, `score`, `skippedCount`, `topCategory` |
| `results_viewed` | Report renders | `score` |
| `assumption_changed` | An assumption slider moves | `key`, `value` |
| `report_downloaded` | PDF print or copy summary | `format`: pdf / clipboard |
| `report_shared` | Share link copied | — |
| `brief_viewed` | Internal brief opened | — |
| `cta_clicked` | Review CTA clicked | `location` |
| `consultation_requested` | Lead form submitted | `hasEmail` |

No practice identifiers, names, figures, or contact details are emitted. The
event vocabulary is the entire payload surface, and it is a closed union type —
adding a field requires editing `AuditEvent`.

## The questions this answers

**Does the audit get finished?**
`audit_completed ÷ audit_started`. Below ~55% the question set is too long or one
step is too hard; `audit_abandoned.step` names which.

**How long does it actually take?**
`audit_completed.durationMs`. The product promises about five minutes. If the
median crosses seven, cut a question.

**Which questions do people not have?**
`field_skipped.field`, and `audit_completed.completeness`. A field skipped by
most respondents is either badly worded or genuinely unknowable — the first is a
copy fix, the second is a finding about what practices can measure.

**Is the score distribution plausible?**
`audit_completed.score`. Everything clustering at one end means the curves are
miscalibrated, not that every practice is the same. This is the single most
important number for model credibility.

**Which problems are actually out there?**
`audit_completed.topCategory`. Tells us which detectors earn their place and
where to build the next one.

**Do people trust it enough to check the arithmetic?**
`assumption_changed`. A physician moving the contribution-margin slider is
engaging with the model rather than skimming it — this is the strongest
qualitative signal in the funnel, and the closest proxy for the credibility the
product is built to earn.

**Does the report leave the browser?**
`report_downloaded`, `report_shared`. A shared report means it is being read by a
partner or administrator, which is where decisions get made.

**Does it start conversations?**
`cta_clicked → consultation_requested`, and `consultation_requested ÷
results_viewed`. This is the only conversion number that matters commercially.

## Targets for the first hundred audits

These are hypotheses to falsify, not goals to hit.

| Metric | Working hypothesis |
| --- | --- |
| Completion rate | ≥ 55% |
| Median time to complete | ≤ 5 min |
| Median fields skipped | ≤ 3 of 17 |
| Reports where an assumption was changed | ≥ 15% |
| Report downloaded or shared | ≥ 30% |
| Consultation requested | ≥ 8% of completed reports |

If completion is high and consultation requests are near zero, the report is
pleasant and not useful. If consultation requests are high but calls go nowhere,
the findings are overstated — check the brief's disqualifiers against what
actually happened on the call.

## Not built

No dashboard, no cohort analysis, no session replay, no per-user identity. The
events above answer the questions that would change the product; anything more is
a second product. See `SCOPE.md`.
