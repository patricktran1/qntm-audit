# PILOT RUNBOOK

How to operate the first cohort. Written for the person doing it, not for a
process document. The software's job is to make the loop hard to drop;
this document is the loop.

The pilot runs against **model 1.1.0, frozen** (see the freeze section of
`MODEL_CHANGELOG.md`). The question it answers is not "does this convert" —
it is "which parts of the audit are true, useful, challenged, and
commercially relevant."

---

## Before launch

Work through `docs/PILOT_SETUP.md` once, in order. In short:

1. Configure the environment (token, store, lead sink, site URL). Redeploy.
2. Open `/internal/setup` and get every check green.
3. Press **Send test lead notification**; see `[TEST]` arrive in the channel.
4. Mark your browser as a test device, run one complete audit end to end —
   assumption change, CTA, lead, brief, discovery outcome — and watch it move
   through `/internal/pilot`. `/internal/calibration` stays empty throughout:
   QA traffic never reaches a learning surface, which is exactly what you are
   checking.
5. Press **Clear test records**. Confirm the dashboard reads zero.
6. Confirm the internal header badge reads `model 1.1.0 · pilot freeze`.

Do not send a single real link until all six are done.

## For each outreach

1. Generate the link on `/internal/campaigns`. First cohort:
   `source=personal · campaign=founder_pilot · cohort=first10`. Use `ref`
   (e.g. `d3`) if you want to know who is who — never a name.
2. Send it personally, using a template from `PILOT_OUTREACH.md` as a
   starting point. One person, one message. No automation, no BCC.
3. **Do not pre-explain what result they "should" get.** The audit's
   prediction meeting their unprimed reality is the entire experiment. If
   asked what it will say, the honest answer is "that's what I'm trying to
   find out."

There is no invitation tracking in the product, deliberately. If you want a
tally, keep it in your own notes; the dashboard's funnel begins at
completion, and it says so.

## When a lead arrives

1. The notification carries the verdict, the leading finding, one line of
   evidence, and a link to the brief. Open the brief before replying.
2. Reply the same day if you can. The form promised a person, not a funnel.
3. Before the call, open `/internal/call?s=<session>` — the one-screen
   version — on the device you'll have in front of you.
4. On the call: open with their own number, not with QNTM. **Never quote the
   diagnostic opportunity range as promised savings** — quote the finding
   and let them own the number. The call view repeats this where you can
   see it.
5. Ask the five questions on the call view. Listen for the falsifiers — the
   things that, if true, void the finding. Finding out you were wrong on
   the call is a success of the pilot, not a failure of the call.
6. **Record the outcome immediately after hanging up**, from the button at
   the bottom of the call view. Details do not survive the day. Record it
   even when — especially when — the answer is "our finding was wrong" or
   "no identified problem."

## When they disagree

Capture it, thank them, change nothing.

- Their disagreement goes in the outcome form: accuracy `incorrect` or
  `secondary issue`, the pain they actually named, the economics reaction,
  the most-challenged assumption, and their words in the notes.
- **Do not adjust a threshold, detector, or estimate because of one
  conversation.** That is the freeze. One disagreement is a data point;
  the first-ten review is where data points become decisions.
- If what they found looks like a genuine correctness bug — a number that is
  arithmetically wrong, not merely unwelcome — the freeze allows a fix:
  document it in `MODEL_CHANGELOG.md`, write the regression test first,
  bump PATCH/MINOR/MAJOR per policy.

## Daily during the pilot

Five minutes, one page — `/internal/pilot`:

1. **Needs attention** — work it to empty. Leads awaiting response first.
2. **Stop conditions** — if one is firing, take it seriously: it was
   calibrated in advance precisely so it cannot be argued with in the
   moment. Pause new outreach while you understand it.
3. Glance at completions and outstanding outcomes. If outcomes lag leads by
   more than a couple, stop sending links and go record conversations.
4. Weekly: download `/internal/api/export?kind=backup` and keep it somewhere
   safe.

If the dashboard itself misbehaves, `/internal/setup` first — it will tell
you whether the store or a sink is the problem.

## After the first ten

Sit down with `/internal/pilot` (cohort view: `first10`),
`/internal/calibration`, and the two CSV exports. Review, in order:

1. **Verdict distribution** — did the audit ever say "healthy"? A pilot where
   every practice must act is evidence about the model, not the specialty.
2. **Coverage** — which questions could real dermatologists not answer? A
   question nobody can answer is a questionnaire defect, whatever the model
   thinks of it.
3. **topCategory distribution** — is one detector headlining implausibly
   often?
4. **Assumption changes** — which priors did physicians move, and which way?
5. **Economic credibility** — how many calls rated the range credible versus
   too high?
6. **Prediction vs. actual pain** — the confusion table, and then every
   individual disagreement, in the operator's own words. At n=10 the rows
   outrank every rate on the page.

Then decide — in this order of preference:

- **Continue unchanged** into the next wave if nothing above alarms.
- **Fix questionnaire comprehension** (wording, help text, ordering) —
  presentation is PATCH territory and does not disturb calibration.
- **PATCH correction** for anything demonstrably wrong that changes no
  computed value.
- **MINOR recalibration** where the evidence says a threshold or estimate is
  systematically off — with the changelog entry citing the pilot data that
  motivated it.
- **MAJOR redesign** only if the model's meaning is wrong — e.g. the leading
  finding usually misses. This resets comparability, so it must buy its way
  in with evidence.

Update `PILOT_FREEZE` in `lib/engine/version.ts` deliberately as part of
whichever path you choose. Bumping the model without touching the freeze
fails the test suite — that is intentional.

## Reference

| Surface | Purpose |
| --- | --- |
| `/internal/setup` | Is production configured? Health checks, test lead, test-data controls |
| `/internal/campaigns` | Generate attributed outreach links |
| `/internal/pilot` | Who needs attention, statuses, filters, cohorts, stop conditions |
| `/internal/call?s=…` | One-screen instrument panel for a discovery call |
| `/internal/brief?a=…&s=…` | Full pre-call intelligence + outcome form |
| `/internal/calibration` | Predictions vs. what the calls actually said |
| `/internal/api/export` | CSVs (`kind=sessions`, `kind=outcomes`) and JSON backup (`kind=backup`) |
