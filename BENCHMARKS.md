# BENCHMARKS

## Where we stand today

**This product ships no benchmark data.** `BENCHMARKS` in
`lib/engine/thresholds.ts` is an empty array, and that is deliberate.

We do not hold a defensible distribution of dermatology operating metrics. We
could approximate one from memory or from secondary sources, and a physician
who checked a single figure would then be right to discard the entire report.
Every comparison in the product is therefore either the practice's own
arithmetic or a threshold we openly label as our judgement.

## The four classes of number

Every figure belongs to exactly one, and `THRESHOLDS` in
`lib/engine/thresholds.ts` records which. The report surfaces this list under
*Every threshold we applied, and where it came from*.

| Class | Meaning | Example |
| --- | --- | --- |
| `arithmetic` | Follows from a definition; no judgement | Booked slots = visits ÷ (1 − no-show rate) |
| `product_judgment` | Our chosen threshold or curve | 35-day A/R working target |
| `user_input` | The practice told us | Days in A/R |
| `benchmark` | Derived from a real distribution | *nothing yet* |

If a threshold is not in that registry, it should not exist in the code.

## The contract a real dataset must satisfy

Before anything enters `BENCHMARKS`, it must fill every field of
`BenchmarkSource`:

```ts
interface BenchmarkSource {
  id: string;
  publisher: string;     // the organisation that collected it
  dataset: string;       // the specific report or survey
  dataYear: number;      // collection year, not publication year
  specialty: string;     // never generalised across specialties
  sampleSize: number;    // practices in the sample
  licence: "public" | "licensed" | "internal-anonymised";
  url?: string;
}
```

And describe a **distribution**, not an average:

```ts
interface BenchmarkDistribution {
  metricKey: string;   // must match a Metric.key from derive.ts
  unit: "currency" | "percent" | "number" | "days";
  p25: number; p50: number; p75: number; p90: number;
  n: number;           // practices contributing to this metric specifically
  source: BenchmarkSource;
  segment: { minPhysicians?: number; maxPhysicians?: number } | null;
}
```

### Rules that come with the contract

1. **Percentiles, never a single average.** A central figure hides the variance
   that makes a comparison worth showing. We tell a physician where they sit in
   a range.
2. **Specialty-specific.** A dermatology practice is not compared against a
   multi-specialty distribution. `specialty` is required and never generalised.
3. **Minimum sample.** Below roughly 30 practices for a given metric we do not
   display percentiles at all. `n` is per-metric, not per-source, because
   response rates vary field by field.
4. **Segmented by size where it matters.** Collections per physician means
   something different for a solo practice than for an eight-physician group.
5. **Source shown at the point of use.** Publisher, dataset, data year, and
   sample size appear beside the figure — not in a footnote, and not only in
   this file.
6. **Visually distinct from assumptions.** Benchmark-derived thresholds render
   with their own provenance chip, so a reader can always tell which numbers
   came from data and which are ours.

## Where a benchmark would first earn its place

In priority order, judged by how much a comparison would change a decision:

1. **Collections per patient visit**, segmented by practice size. The single
   figure our economics are most sensitive to and the one physicians most want
   context for.
2. **Days in A/R**, so the 35-day working target can be replaced with a real
   distribution.
3. **Support staff per provider**, which would turn the overhead finding from a
   ratio observation into a comparison.
4. **No-show rate**, segmented by visit type if the data supports it.

## The likeliest first source

Anonymised, aggregated data from practices that have run this audit — which is
why answers are structured rather than free text. That path requires, at
minimum: explicit consent, a floor on contributor count before any figure is
published, and suppression of any cell small enough to identify a practice.
None of that exists yet, and none of it should be built before there is enough
volume for it to mean anything.

Until then, the honest position is the one the product takes: show a physician
their own arithmetic, publish the curves, and say plainly that we hold no
benchmark data.
