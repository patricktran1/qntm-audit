# MODEL CHANGELOG

Substantive changes to the audit model, versioned so calibration is not aimed
at a moving target. Presentation-only changes are not recorded here; git
history covers those.

**Every entry must state the evidence that motivated the change.** Entries
reconstructed from git history say so, and claim no motivation the repository
does not support.

---

## PILOT MODEL FREEZE — ACTIVE

**The initial real-world pilot runs against `1.1.0`, frozen 2026-08-29.**
Declared in `lib/engine/version.ts` as `PILOT_FREEZE` and asserted by
`tests/integrity.test.ts`, so bumping `MODEL_VERSION` without deliberately
lifting the freeze fails the suite.

While the freeze is active:

- **No threshold tuning based on individual anecdotes.** One dermatologist
  disagreeing is a calibration data point, not a defect report.
- **No detector changes because one prospect disagrees.** Record the
  disagreement in the discovery outcome; the first-ten review decides.
- **No economic-model changes because a number feels uncomfortable.** If a
  range reads high on a call, capture `economic reaction: too high` and move
  on.
- **No landing-experiment winner declared.** The A/B arms both keep running;
  at pilot sample sizes any difference is noise.
- **No benchmark claims.** The benchmark layer stays empty until there is
  defensible data to put in it.
- **No automatic optimisation.** Nothing tunes itself against outcomes.

**A true correctness bug can still be fixed.** The procedure:

1. Document the bug and its evidence here, as its own entry.
2. Add regression coverage first — the failing test is the proof.
3. Decide PATCH / MINOR / MAJOR under the policy below.
4. Preserve comparability: stored sessions keep the version that produced
   them, and calibration segments by it, so a mid-pilot fix never silently
   rewrites earlier evidence.

The freeze lifts at the first-ten review (`PILOT_RUNBOOK.md`, "After the
first ten"), when the calibration data — not an anecdote — decides whether
the next version is a PATCH, MINOR, MAJOR, or nothing.

---

Versioning policy is defined in `lib/engine/version.ts`:

- **MAJOR** — the meaning of a result changes. Results are not comparable
  across the boundary, and calibration must be segmented by it.
- **MINOR** — a result may change for some practices, but the meaning does not.
  Calibration across the boundary is valid when the version is reported.
- **PATCH** — no computed value changes for any input.

---

## 1.1.0 — 2026-08-29

Aggregate conservatism and verdict integrity. Both changes were found by
building the golden fixture set and the integrity suite, then reading what the
model actually did to twelve synthetic practices.

### Aggregate recurring opportunity is capped at 15% of collections

**What changed.** The rolled-up recurring range is capped at
`MAX_RECURRING_SHARE` (15% of annual collections). When the cap binds, the
executive summary says so and points the reader at the individual findings.
Individual finding estimates are untouched.

**Why.** Findings are individually conservative but they overlap — several draw
on the same hours and slots — so summing them compounds. The `very-small`
fixture (a 0.5-FTE practice collecting $420k) was being shown a recurring range
worth **21.9% of everything it collects**. No operator would defend that figure
on a call.

**Evidence.** `scripts/fixture-report.ts` across `PRACTICE_FIXTURES`;
`very-small` at 21.9% and `phone-bottleneck` at 16.3% before the change.

**Expected impact.** Only practices whose findings summed above the ceiling.
Two of twelve fixtures; both now report 15.0%.

**Fixtures affected.** `very-small`, `phone-bottleneck`.

**Compatibility.** Minor. A capped total is strictly lower than before, so no
stored result becomes larger. Sessions recorded under 1.0.0 carry the
uncapped total and their own version.

### Verdict materiality counts confident findings only

**What changed.** The `healthy` verdict's materiality test sums only findings
whose confidence is not `low`. Low-confidence findings still appear in the
report and still affect nothing else.

**Why.** Inflating software spend tenfold on an otherwise excellent practice
dragged it from `healthy` to `watch` — entirely through the `software-stack`
finding, whose own estimate concedes it "assumes an inventory finds overlapping
tools, which is common but not universal". A soft observation quietly
withdrawing a clean bill of health is the exact shape of a sales bias.

**Evidence.** `tests/integrity.test.ts` → "stays healthy when software spend is
inflated tenfold". The test was written first and failed against 1.0.0.

**Expected impact.** Practices that were marginally non-healthy because of a
single low-confidence estimate. Narrow by construction.

**Fixtures affected.** None changed verdict; `efficient-solo` and
`healthy-group` continue to assert `healthy`.

**Compatibility.** Minor. Moves some practices toward `healthy`, never away.

### Skipped fields exclude questions never asked

**What changed.** `skippedFields` is computed from `relevantFields`, so a
question hidden by the billing-model branch is not counted as unanswered.

**Why.** The pilot coverage panel reported "In-house billing staff (FTE)" as
the question practices most often cannot answer. It is never shown to a
practice using an outside biller.

**Evidence.** `/internal/pilot` coverage panel against real session data during
the first end-to-end pilot-loop run.

**Expected impact.** Reporting only. `completeness` already used the same
relevance rule, so no score, verdict, or estimate moves.

**Compatibility.** Minor — it changes stored snapshot content, not any computed
result.

---

## 1.0.0 — 2026-08-29 (reconstructed from git history)

The model as it stood when evidence collection began. Reconstructed from
commits `5dacdf1` through `15bc161`; motivations below are supported by those
commit messages and by the tests added alongside them.

**Established in `5dacdf1`** — the deterministic engine: 17 questions, six
weighted score dimensions on published interpolation curves, thirteen
detectors, prioritization separating significance from rank, contribution-based
physician time value, one-time versus recurring separation, and no benchmark
data.

**Score withheld below 50% model coverage** (`5a7190d`). A sparse audit
previously reported a confident 41/100 built on 27% of the model while
simultaneously stating nothing quantifiable had been found.

**Service fit capped at three "strong" ratings** (`fe367ce`). Five of six
services came back strong on the group profile, including a stack review whose
own rationale calls it a door-opener. A brief where everything is strong is a
brochure.

**Verdict system introduced** (`60a6741`), with four correctness fixes found by
red-teaming as five buyer archetypes:

- *Physician admin detector raised* to require 15% of the work week and at
  least 5 hours. At 3 hours it fired for nearly every practice and led four of
  five archetypes — a finding that headlines every audit reads as canned.
- *Billing-cost estimate scaled* to the excess over a 5% reference rate, capped
  at four points. It was a flat 0.5–1.5 points of collections, so a practice at
  5.6% and one at 12% were told the same thing.
- *Automation candidates gated on bucket*, so a workflow prioritization had
  already placed in low priority is no longer recommended for automation on the
  same page.
- *Verdict aligned to the leading finding*, which it had been contradicting by
  reading the bucket-ordered list while the report leads by significance.

**Copy corrections** (`0ac1043`). Five claims asserting facts about "most
practices" were reframed as our priors; we hold no data behind them.

---

## Adding an entry

1. Change the model.
2. Run `npx vitest run` — fixture and integrity failures are the point. A
   failure means the meaning changed; decide whether that is intended.
3. Update the affected fixture invariants, and say which in the entry.
4. Bump `MODEL_VERSION` per the policy above.
5. Write the entry, including the evidence. An entry without evidence is a
   preference, and preferences are how a diagnostic drifts into a sales tool.
