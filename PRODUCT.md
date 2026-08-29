# PRODUCT

## The promise

> Answer about sixteen questions. Find out where your practice is losing time
> and money, why we think so, and what to measure before you spend anything.

## Who it is for

**Primary ICP:** the owner or physician leader of an independent dermatology
practice, roughly 1–8 physicians, who suspects something is leaking but cannot
name it precisely.

The question set, the scoring curves, and the detectors are tuned for
dermatology specifically: high visit volume, meaningful procedural and pathology
revenue, prior-authorization pressure concentrated in biologics and Mohs
pre-certification, and a front desk absorbing more than it should.

**Adjacent, works well:** Mohs, plastics, allergy/immunology, med spa.

**Explicitly not for:** hospital-employed physicians, multi-site platforms with
a corporate finance function, and anyone looking for a valuation. If the first
question is about EBITDA multiples, this is the wrong tool and the landing page
says so.

## What the physician receives

1. **Executive summary** — three to five sentences, in their own numbers.
2. **Practice Leverage Score** — 0–100 across six weighted dimensions, each with
   its scoring curve one click away. Withheld entirely when too little of the
   model could be computed.
3. **Top 3–4 opportunities** — ordered by how loud the signal is, each with
   evidence, an interpretation, a dollar range, a formula, its assumptions, and
   a next step that costs nothing.
4. **Prioritization matrix** — every finding placed into quick wins, strategic
   bets, measure first, or low priority.
5. **Economic snapshot** — the metrics their answers imply.
6. **Time leaks** — annualised hours, since hours are upstream of dollars.
7. **Automation candidates** — at most three, each with an honest note on what
   today's technology does and does not handle.
8. **Questions this audit cannot answer** — the gaps that most affect the
   reliability of everything above.
9. **Next 30 days** — a measurement plan requiring no purchase.
10. **Assumptions** — live sliders that recompute the entire report.

## The flow

```
Landing  ──►  Audit (9 screens)  ──►  Report  ──►  optional: request a review
   │                                     │
   └──► load a synthetic demo practice ──┘
```

Lead capture sits *after* the complete report and is optional. The report link
works forever with no account. This is the core trust bet of the product: a
physician who gets real value without paying anything, including with their
email address, is far more likely to want the conversation.

## Design principles

**Every number is traceable.** It came from something the user typed, or from a
named assumption they can change. There is no third category, and no undisclosed
benchmark data set. Where a threshold was unavoidable (35 days as an A/R working
target), it is labelled as our judgement rather than dressed up as an industry
figure.

**"I don't know" is a real answer.** Skipping a field never blocks the audit. It
lowers the confidence of findings that needed it, removes the dimension from the
score rather than scoring it zero, and becomes a question at the end.

**Confidence is a first-class output.** A high-impact finding we do not trust
becomes a measurement task, never a project. This is the rule that keeps the
audit a diagnostic instead of a pitch.

**Estimates understate.** Physician time is valued at marginal contribution, not
gross revenue. Freed physician hours are discounted to 25–50% convertible.
No-show slots are half-refillable by default. One-time cash releases are totalled
separately from recurring value. The report should survive a CFO reading it
adversarially.

**Restraint sells better than enthusiasm.** One CTA at the end. No QNTM logo on
every finding. The internal brief has a section listing reasons *not* to pursue
the lead.

## The commercial purpose

The audit is a lead-generation and sales-enablement tool, and it only works as
one for as long as it is a genuinely useful diagnostic. A physician who reads the
report and thinks *"whoever built this understands my practice"* is the entire
conversion mechanism. See `SALES.md`.

## The test this product has to pass

> If I put this in front of a dermatologist I met at a conference, would the
> results teach them something specific enough that they would willingly spend
> another twenty minutes talking with me?

The three things most likely to earn that twenty minutes:

- **The exchange rate.** "An hour of your time is worth $411 in contribution,
  computed from your own collections and clinic hours" reframes every
  administrative decision they make.
- **The access paradox.** A long new-patient wait alongside a meaningful no-show
  rate means demand exists and the matching is failing — which is a workflow
  problem, not a marketing problem, and cheaper to fix than they expect.
- **Being told what not to do.** A report that puts a finding in "measure first"
  and explicitly declines to quantify others reads as a second opinion rather
  than a sales document.
