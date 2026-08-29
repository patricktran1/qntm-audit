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

Every event also carries the assigned experiment `variant` and a session id.

| Event | Fires when | Payload |
| --- | --- | --- |
| `landing_viewed` | Landing page mounts | `variant` |
| `audit_started` | Audit flow mounts | `source`: cta / demo / resume, `variant` |
| `screen_completed` | A screen is advanced | `step`, `index`, `skipped[]` |
| `unknown_selected` | A field is left unanswered on advance | `field`, `step` |
| `audit_abandoned` | Tab hidden mid-audit | `step`, `index`, `furthestIndex` |
| `audit_completed` | Final screen submitted | `durationMs`, `skippedCount`, `dimensions` |
| `report_viewed` | Report renders | `dimensions`, `demo` |
| `score_expanded` | A score dimension is opened | `dimension` |
| `finding_expanded` | A finding's evidence is opened | `findingId`, `category` |
| `methodology_expanded` | Formulas or thresholds opened | `section` |
| `assumption_changed` | An assumption slider moves | `key`, `value`, `direction` |
| `assumptions_reset` | Assumptions restored to defaults | — |
| `summary_copied` | Text summary copied | — |
| `report_printed` | Print/PDF invoked | — |
| `report_shared` | Link shared | `method`: clipboard / web_share |
| `cta_clicked` | Conversion CTA clicked | `location`, `posture`, `topCategory` |
| `lead_form_viewed` | Lead form mounts | `posture`, `topCategory` |
| `lead_submitted` | Lead accepted | `posture`, `topCategory`, `nextStep` |
| `booking_clicked` | Booking link followed | — |
| `brief_viewed` | Internal brief opened | — |

### Dimensions

`dimensions` is the non-identifying shape of the practice, attached to the two
report-stage events:

`providerBand` · `collectionsBand` · `scoreBand` · `coverageBand` · `verdict` ·
`posture` · `topCategory` · `findingCount` · `quantifiedCount` ·
`completenessBand`

**Bands, never values.** Collections is emitted as `3-6M`, never as
`5400000`. This is enforced by the `AuditEvent` union type rather than by
convention, and `tests/security.test.ts` asserts that a report's raw
collections figure appears nowhere in a serialised payload and that no key is
identifier-shaped. Names, emails, practice names, websites, and the lead form's
free-text field are never emitted at all.

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
`dimensions.topCategory`. Tells us which detectors earn their place and where
to build the next one.

**Does the verdict distribution look right?**
`dimensions.verdict`. If nothing is ever `healthy`, the audit has become a sales
tool and the thresholds need revisiting. If almost everything is, the detectors
are too quiet. This is the honesty metric.

**Which findings actually convert?**
`cta_clicked.topCategory` and `lead_submitted.topCategory` against
`report_viewed.dimensions.topCategory`. A category that gets read but never
converts is either not painful enough or not credibly explained.

**Does coverage predict conversion?**
`dimensions.coverageBand` on `report_viewed` versus `lead_submitted`. The
hypothesis is that a physician who answered everything trusts the output more —
if that holds, pushing completion is worth more than pushing traffic.

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

## The experiment

Variant assignment happens in middleware and rides a cookie through the whole
funnel, so every event carries its arm.

- **A** — Practice Leverage Score framing. "Your practice, decoded."
- **B** — physician economics framing. "What is an hour of your time worth?"

Measure per arm: `landing_viewed` → `audit_started` → `audit_completed` →
`cta_clicked` → `lead_submitted`.

Do not compute significance from this. It is a measurable experiment, not a
powered one; with early volume the honest read is directional. Force an arm for
a demo or a test with `/?v=A` or `/?v=B`.

## Targets for the first hundred audits

These are hypotheses to falsify, not goals to hit.

| Metric | Working hypothesis |
| --- | --- |
| Completion rate | ≥ 55% |
| Median time to complete | ≤ 5 min |
| Median fields skipped | ≤ 3 of 17 |
| Reports where an assumption was changed | ≥ 15% |
| Report downloaded or shared | ≥ 30% |
| Lead submitted | ≥ 8% of completed reports |
| Reports reaching a `healthy` verdict | 10–25% — if it is near zero, we have stopped being a diagnostic |

If completion is high and consultation requests are near zero, the report is
pleasant and not useful. If consultation requests are high but calls go nowhere,
the findings are overstated — check the brief's disqualifiers against what
actually happened on the call.

## Not built

No dashboard, no cohort analysis, no session replay, no per-user identity.
`/internal/events` shows the current browser session's own events so the funnel
can be verified end to end before a vendor is wired in; it is a verification
tool, not an analytics product. See `SCOPE.md`.
