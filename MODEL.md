# MODEL

Everything the engine computes, and why. All of it lives in `lib/engine/` and is
covered by `tests/`.

**Model version: see `MODEL_VERSION` in `lib/engine/version.ts`.**
Change history and versioning policy: [`MODEL_CHANGELOG.md`](MODEL_CHANGELOG.md).

This document exists so an informed critic can disagree with us intelligently.
That is the point — a diagnostic nobody can argue with is not a diagnostic. If
something here looks wrong to you, the assumption sliders in the report and the
threshold registry below are where to demonstrate it.

## How to audit this model in fifteen minutes

1. Read *The benchmark decision* — it explains what we deliberately do not have.
2. Read *Verdict* — it is the only conclusion the product stands behind.
3. Read *Threshold provenance* — every judgement call in one registry.
4. Open `lib/engine/fixtures.ts` — twelve synthetic practices, each with the
   invariants it protects.
5. Run `npx vitest run tests/integrity.test.ts` — the tests that make it hard
   for us to bias the audit toward our own services.

## The benchmark decision

**This product ships no industry benchmark data.** Not MGMA, not AMA, not a
scraped composite. The reason is narrow and practical: we cannot verify a
specific figure to a specific source and year, and a physician who catches one
invented "industry average" will correctly discard the entire report.

What replaces benchmarks:

1. **Practice-specific arithmetic.** Collections per clinical hour, overhead as a
   share of collections, and cost per visit are computed from the practice's own
   numbers and need no external comparison to be useful.
2. **Published scoring curves.** Each score dimension is scored against explicit
   anchor points, printed in the report next to the score. They are our
   judgement, and we label them as such, so a practice administrator can
   disagree with the curve rather than having to trust a black box.
3. **Named assumptions.** Every behavioural or economic assumption is listed,
   editable in the UI, and recomputes the report live.

The one place a fixed threshold appears in a dollar calculation is the 35-day
A/R working target in the `ar-aging` detector. It is labelled in the report as a
working target, not an industry benchmark.

## Inputs

Seventeen questions across nine screens (eighteen fields, of which a practice sees
either the billing-vendor fee or the in-house billing FTE, never both). Every
optional field accepts "I don't know", which propagates as `null` rather than
zero — the distinction is enforced by tests.

| Input | Consumed by |
| --- | --- |
| Physicians (FTE) | provider count, collections per physician, admin cost |
| PAs / NPs (FTE) | provider count, visit volume, provider-mix finding |
| Annual collections | every dollar figure in the report |
| Clinic days per week | clinical hours, visit volume, per-day economics |
| Patients per provider per day | visit volume, collections per visit |
| Front office (FTE) | overhead, phone capacity, staffing ratio |
| Clinical support (FTE) | overhead, prior-auth costing |
| Billing model + fee or FTE | billing cost, revenue-operations score |
| Days in A/R | revenue-operations score, A/R finding |
| Third-next-available | access score, access-delay finding |
| No-show rate | access score, no-show finding |
| Calls per day | front-office score, phone finding |
| Unanswered call % | front-office score, phone finding |
| Physician admin hours/week | physician-time score, two findings, time value |
| Prior-auth staff hours/week | overhead score, prior-auth finding |
| Software spend/month | overhead, technology score, stack finding |

## Assumptions

Defaults in `lib/engine/assumptions.ts`. The nine highest-leverage ones are
exposed as sliders in the report.

| Assumption | Default | Why this value |
| --- | --- | --- |
| Clinic weeks per year | 46 | 52 less ~4 vacation, ~1 CME, ~1 holiday-equivalent |
| Patient-facing hours per clinic day | 8 | Scheduled clinical hours, excluding charting |
| Marginal contribution margin | 0.55 | Deliberately below a typical procedural practice's marginal margin |
| Front-office loaded hourly cost | $26 | Wage plus payroll tax and benefits |
| Clinical staff loaded hourly cost | $34 | As above |
| Billing staff loaded hourly cost | $30 | As above |
| Working hours per FTE per year | 2,080 | 40 × 52 |
| No-show slots refillable | 0.50 | Half of missed slots assumed unfillable on short notice |
| Staff minutes per handled call | 4.5 | Talk time plus the work the call creates |
| Unanswered callers who try again | 0.70 | Only the remainder are treated as lost |
| Inbound calls that are new-patient requests | 0.10 | The weakest assumption in the model; see below |
| Visits per new patient, year one | 2.2 | Used only in the phone revenue estimate |

Two of these are behavioural rather than economic — the callback rate and the
new-patient call share. Findings that depend on them are capped at **medium or
low confidence**, the low end of their range halves the new-patient share again,
and the report tells the user that one week of call-reason tagging replaces the
assumption with a real number.

## Core economics

```
clinical days/year        = clinic days/week × clinic weeks/year
provider clinical hrs/yr  = clinical days/year × hours per clinic day
annual visits             = patients/provider/day × providers × clinical days/year

collections per visit     = annual collections ÷ annual visits
collections per physician = annual collections ÷ physician FTE
collections per hour      = annual collections ÷ (providers × provider clinical hrs/yr)
```

### Physician time value

This is the number the whole report hangs on, so it is computed conservatively:

```
contribution per provider hour = collections per provider clinical hour
                               × marginal contribution margin
```

**Gross revenue per hour is never used as a time value.** An hour returned to
clinic does not yield gross revenue; it yields revenue less the variable cost of
delivering it. At the 0.55 default a $747/hour practice values an hour at $411.

The annual figure is then discounted again:

```
value at stake = physician admin hrs/week × clinic weeks/year × physicians
               × contribution per provider hour
opportunity    = value at stake × 25–50%   (share convertible to clinical time)
```

The report states plainly that this is not cash on a table — it is the exchange
rate against which any fix should be weighed.

### Overhead

```
identified overhead = front-office labour + clinical labour + billing + software
overhead share      = identified overhead ÷ annual collections
```

Deliberately **partial**: it excludes rent, supplies, malpractice, physician
compensation, and benefits beyond the loaded hourly rate. The report says so
every time the figure appears, and the 30-day plan asks the practice to rebuild
it from their actual P&L.

### No-shows

No-show rate is a share of *booked* slots, and realized visits are the slots that
were kept:

```
booked slots      = annual visits ÷ (1 − no-show rate)
missed slots      = booked slots × no-show rate
recoverable value = missed slots × collections per visit
                  × contribution margin × refillable share
```

Setting the refillable share to zero collapses this finding to zero, which is the
correct behaviour for a practice with no backfill demand. A test asserts it.

### Phones

Two different figures, kept apart on purpose:

```
capacity currently consumed = handled calls/day × minutes per call ÷ 60
                            × clinical days/year × front-office hourly cost

new patients plausibly lost = unanswered calls/year
                            × (1 − callback rate)
                            × new-patient call share
                            × collections/visit × visits per new patient
                            × contribution margin
```

The first is a cost already being paid; the second is speculative and ranged,
with the low end halving the new-patient share.

### Prior authorization

```
annual labour = PA hrs/week × clinic weeks/year × clinical staff hourly cost
opportunity   = annual labour × 20–40% touch-time reduction
```

Reduction, never elimination — the function does not go away.

### A/R

```
trapped cash = (days in A/R − 35) × (annual collections ÷ 365)
opportunity  = trapped cash × 30–60%
```

Flagged as `recurrence: "one_time"` and totalled separately from the recurring
range. It is a working-capital release, not new revenue.

## Practice Leverage Score

Six weighted dimensions, each 0–100, combined as a weighted mean over the
dimensions that could actually be scored — unscored dimensions are excluded, not
counted as zero.

| Dimension | Weight | Signals |
| --- | --- | --- |
| Physician time | 22 | Admin share of the physician work week |
| Patient access | 18 | No-show rate, third-next-available |
| Revenue operations | 18 | Days in A/R, billing cost as % of collections |
| Overhead load | 17 | Identified overhead share, prior-auth FTE share |
| Front-office leverage | 15 | Unanswered %, calls per FTE, phone share of capacity |
| Technology & visibility | 10 | Software as % of collections, metrics reportable |

Each signal is scored by **linear interpolation across published anchor points**
(`scoreFromAnchors`), so scoring is continuous rather than stepped, and the exact
anchors are shown in the report. Example, no-show rate:

```
0% → 100 · 4% → 90 · 8% → 72 · 12% → 55 · 18% → 35 · 25% → 18 · 40% → 0
```

### The coverage floor

If less than **50%** of the model's weight can be computed, the overall score is
**withheld** rather than published. A composite drawn from a quarter of the model
is an extrapolation, not a score. The dimensions that did compute are still shown.

Two related guards, both driven by the same principle:

- Billing cost is scored on the same curve whether it is an outsourced
  percentage or in-house labour expressed as a share of collections, so the two
  models stay comparable.
- The "metrics you can report" signal is suppressed entirely unless the core
  questions were answered — otherwise an abandoned audit scores 0 and reports a
  confident, terrible number. A test covers this.

Bands: 80+ tight operation · 65–79 solid with named gaps · 50–64 meaningful drag
· below 50 substantial leverage available. Bands are computed from the *rounded*
score so a displayed 65 never carries the band belonging to 64.6.

## Model version and reproducibility

Every stored pilot record carries the `MODEL_VERSION` that produced it, so a
discovery conversation is always compared against what the physician was
actually shown rather than against what today's model would say.

**Share links encode answers only, never a computed result.** The consequence,
stated rather than hidden: a report URL is not a frozen artefact — if the model
changes, the report changes. That keeps links short and inspectable and means a
physician re-opening their link sees the current reading of their practice.

Reproducibility is preserved on the pilot side instead:

- `buildSnapshot` freezes the verdict, score, coverage, categories and banded
  economics at completion time, next to the model version.
- `tests/fixtures.test.ts` pins the model's behaviour against twelve golden
  practices, so an unintended change fails a test rather than silently
  rewriting history.
- `MODEL_CHANGELOG.md` records what changed, why, and which fixtures moved.

## Verdict

`lib/engine/verdict.ts` reduces the whole audit to one of four conclusions, and
the report, the CTA, and the sales brief all read it rather than re-deriving it.

```
insufficient_data   score withheld, or completeness < 50%
healthy             score >= 78 AND no confident high-impact finding
                    AND recurring opportunity < 2% of collections
act                 at least one high-impact finding we are not low-confidence in
watch               everything else
```

The materiality test counts **confident findings only**: a low-confidence
estimate must never be the sole reason we decline to call a practice healthy.
Low-confidence findings still appear in the report; they do not get to overrule
a clean bill of health.

`healthy` suppresses the automation candidates entirely, reframes the dollar
total as noise rather than opportunity, and returns a conversion offer with
posture `none` — a conclusion rather than a CTA. This is the single most
important behaviour in the product: an audit that cannot decline to sell is not
a diagnostic.

The verdict names the finding the report leads with, drawn from the
significance-ordered list rather than the bucket-ordered one, so the conclusion
and the first thing the reader sees are the same finding.

## Findings

Thirteen detectors in `lib/engine/findings.ts`. Each returns `null` when it has
nothing honest to say. Each produces evidence quoting the user's own numbers, an
interpretation, a ranged estimate with its formula and assumptions, impact,
effort, confidence, and a next step requiring no purchase.

Two detector thresholds were corrected after red-teaming the product as five
buyer archetypes:

- **Physician admin load** requires ≥15% of the physician work week *and* ≥5
  hours. It previously fired at 3 hours and became the headline finding for
  four of five archetypes, including a practice at 11% — which is a good
  result, not an opportunity. A finding that fires for everyone is noise.
- **Billing cost** scales with the spread above a 5% reference rate, capped at
  four points, of which 30–60% is treated as recoverable. It was previously a
  flat 0.5–1.5 points of collections, so a practice at 5.6% and one at 12% were
  told the same thing.

**Impact is scaled to the practice**, not to raw dollars: high at ≥3% of
collections, medium at ≥1%. A scale-blind threshold would tell every small
practice that nothing matters. Severe operational signals can floor the impact
upward — one call in five going unanswered is material regardless of the
modelled revenue figure.

## Prioritization

Two different questions, deliberately separated:

```
significance = impact × confidence + magnitude        (what is going on)
rank         = impact × confidence ÷ effort + magnitude   (what to do first)
```

The report **leads with significance** and **sequences by rank**. Ordering the
headline findings by ease would bury a 15-hour-a-week physician admin problem
under a phone script.

Buckets:

| Condition | Bucket |
| --- | --- |
| Low confidence, any impact above low | **Measure first** |
| Low effort, impact above low | **Quick win** |
| High impact | **Strategic bet** |
| Medium impact, high effort | **Measure first** |
| Otherwise | **Low priority** |

Low confidence never routes to a project bucket regardless of impact. That single
rule is what separates a diagnostic from a pitch.

## Threshold provenance

`lib/engine/thresholds.ts` records every judgement threshold in the product
with its class — `arithmetic`, `product_judgment`, `user_input`, or
`benchmark` — its value, its rationale, and where it is applied. The report
surfaces the whole registry. Nothing is currently `benchmark`, and the empty
`BENCHMARKS` array plus its data contract are documented in `BENCHMARKS.md`.

If a threshold is not in that registry, it should not exist in the code.

## Automation mapping and service fit

Automation candidates (`lib/engine/automation.ts`) are derived from findings,
never the reverse, and are capped at three. A candidate requires its finding to
have fired **and** to have survived prioritization — a workflow placed in low
priority is not recommended for automation on the same page that de-prioritised
it. A `healthy` verdict suppresses them entirely.

Service fit (`lib/engine/brief.ts`) is internal only. At most three services
may be rated `strong`, a stack review can never be the lead offer whatever the
spend, and a `healthy` or `insufficient_data` verdict puts *everything* on the
do-not-pitch list. Calibration tracks service false positives specifically,
because a service we led with that turned out irrelevant is where trust is
spent for nothing.

## What rolls up into the headline range

Only findings whose estimate is `recoverable` or `freed_capacity`. Costs the
practice already pays are excluded — counting current spend as "opportunity" is
the oldest trick in consulting and it is why these reports get thrown away.
One-time releases are totalled separately.

The ranges **overlap** — several draw on the same underlying hours and slots —
and the report says so directly rather than presenting the total as a sum.

### Aggregate conservatism ceiling

Individually conservative findings compound when summed. The rolled-up
recurring range is therefore capped at **15% of annual collections**
(`MAX_RECURRING_SHARE`), and when the cap binds the executive summary says so
and points the reader at the individual findings.

The cap changes what we claim in aggregate, never what we observed: individual
finding estimates keep their own arithmetic so the evidence stays inspectable.

This was added after the `very-small` fixture — a part-time practice collecting
$420k — was shown a recurring range worth 21.9% of everything it collects.

## Known limitations

Stated plainly, because a model with no acknowledged limits is not being
honest about itself.

- **No benchmark data.** Nothing here tells a physician how they compare to
  anyone else. See *The benchmark decision*.
- **Visit volume rests on one estimate.** Collections per visit, per hour, and
  every per-visit figure derive from `patients per provider per day`. If that
  number was a guess, the economic base moves with it. The report says so and
  the sales brief lists it as an invalidator.
- **Overhead is partial by construction.** It excludes rent, supplies,
  malpractice, physician compensation, and benefits beyond the loaded hourly
  rate. Never compare it to a published overhead ratio.
- **The new-patient call share is the weakest assumption in the model** and is
  the only support for the phone revenue estimate. One week of call-reason
  tagging replaces it.
- **Findings overlap.** The aggregate is capped and disclosed, but the total is
  an order of magnitude, not a sum.
- **Specialty-specific.** The curves and copy are tuned for dermatology.
  Applying them to another specialty without recalibration would be a mistake.
- **Untested against outcomes.** As of this version the model has no recorded
  discovery outcomes. Its predictions are theory. `/internal/calibration`
  exists to change that, and until it has data the honest position is that we
  do not know how often the audit is right.

## Testing

287 tests in `tests/`:

| Suite | What it protects |
| --- | --- |
| `derive` | Arithmetic against hand-computed values, missing data, divide-by-zero, assumption sensitivity |
| `score` | Curve interpolation, coverage floor, band boundaries, zero-as-an-answer |
| `audit` | Report structure, one-time separation, prioritization, the cap contract |
| `verdict` | The healthy escape hatch and the four detector regressions |
| `fixtures` | Twelve golden practices against their invariants |
| `integrity` | Sales bias, scale invariance, missing data, conservatism, detector dominance, product bias, determinism |
| `share` | Round-tripping and hostile payloads |
| `security` | Boundary validation, analytics leakage, rate limiting |
| `pilot` | Identity, attribution, both write boundaries, demo exclusion, small-sample behaviour, CSV injection |

Notable regressions the tests caught: an empty audit scoring 0/100 with
confidence; the share encoding splitting on `.` and corrupting decimal answers;
blank segments decoding to zero and rendering a confident report about a
practice with no physicians; two findings presenting only derived values with
nothing the user had actually said; a small practice shown a recurring range
worth 22% of its collections; and inflated software spend withdrawing a healthy
verdict through a low-confidence finding.
