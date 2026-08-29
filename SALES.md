# SALES

How QNTM should use audit output.

## The one rule

**The audit only works as a sales tool for as long as it is an honest
diagnostic.** Every shortcut that makes a lead look better makes the first call
worse. A physician who catches an inflated number discards the whole report, and
with it the reason they were willing to talk to us.

This is why the internal brief has a "Reasons not to pursue" section, why
low-confidence findings are routed to *measure first* instead of to a proposal,
and why the 30-day plan contains nothing anyone has to buy.

## The internal opportunity brief

Every completed audit produces one at
`/internal/brief?a=<encoded answers>`. The route is gated by
`INTERNAL_ACCESS_TOKEN` and returns 404 without it — visit once with
`&key=<token>` and it becomes a 12-hour cookie. A lead notification includes a
direct link, so the brief is one click from the arrival of the lead.

| Section | Use it for |
| --- | --- |
| Size, collections, coverage | Qualification before you spend discovery time |
| Verdict + confidence caution | What the physician was actually told |
| Primary pain, with observed vs inferred evidence | The number you open the call with, and how solid it is |
| Second-order pain | What to move to if the first is dismissed |
| Potential economic range | Your expectation-setting, **never** a quote |
| What the economics rest on | The assumptions to concede before they are challenged |
| Probable QNTM fit | Which service to scope, capped at three "strong" |
| **Do not pitch** | Services with no supporting signal |
| Opening question | The first sentence, in their numbers |
| Discovery questions | Seven, drawn from what the audit could not answer |
| Likely objections | Keyed to the specific findings, with a response |
| What would invalidate this audit | Read before you commit to a claim |
| **Reasons not to pursue** | Read first |
| Suggested next action | What to actually do today |

The brief is generated from the same inputs as the physician's report by the same
pure function. It cannot say anything the report does not support.

## Running the conversation

**Open with their number, not with QNTM.**

> "Your report put fifteen administrative hours a week against thirty-six
> scheduled clinical hours — that is twenty-nine percent of the physician work
> week. Does that match what you actually experience?"

Then ask the next-step question from their own report. If they have done the
measurement, you are talking about real data on the first call. If they have not,
offering to help them measure is a better opening than a proposal.

**Never quote the opportunity range back as savings.** Quote the *finding*. The
range exists so we know whether an engagement is worth scoping; the moment it is
repeated as "we can save you $180,000" it becomes a promise the model was
explicitly built not to make. The report labels every rolled-up figure
*diagnostic opportunity estimates, not promised savings*, and the brief repeats
it — do not be the person who contradicts your own document.

**Concede the weak assumption before they find it.** The brief's *what the
economics rest on* section names the one or two assumptions the whole case
depends on. Raising them yourself — "the phone revenue number leans on an
assumption we cannot support, and a week of call tagging would replace it" —
converts the strongest objection into evidence that you read your own model.

**Know what would prove you wrong.** The *what would invalidate this audit*
section is not hedging. A physician who hears "if your schedule is not actually
full, this finding is worth nothing" is talking to a diagnostician, not a
salesperson.

**Lead with the emotional entry point, scope the economic one.** Physician admin
burden is almost always what the physician wants to talk about. It is often not
the largest dollar item, and the buyer for it is the physician rather than the
administrator. Start there, then widen.

**Sequence matters more than total.** The report already tells them what to do
first. Contradicting its sequencing to reach a bigger engagement is the fastest
way to lose the credibility the report just earned.

## Reading service fit

`strong` — their own numbers make the case; the ROI does not depend on a soft
assumption. Scope this.

`possible` — the signal is there but rests on an assumption or an unanswered
question. Discovery first.

`weak` — nothing in their answers points here. Do not raise it. Introducing a
service with no supporting signal is exactly what makes these tools feel like
brochures.

## Reasons to stand down

The brief flags these automatically:

- **Under 60% of questions answered.** The findings are thin. Treat everything as
  a conversation starter.
- **Score of 78 or above.** The practice is running well. A pitch framed around
  inefficiency will land badly and they will remember it.
- **Small solo practice under $800k.** Verify there is budget before investing
  discovery time.
- **Quantified opportunity under $40k.** Below the cost of most engagements. Do
  not force a proposal.

The verdict also stands down on its own: a `healthy` or `insufficient_data`
audit puts "everything" at the top of the brief's *do not pitch* list, because
the physician has already read us concluding there is nothing to sell. Arriving
with a pitch directly contradicts their own report.

When several fire at once, the right move is to answer their questions, offer to
help them measure, and revisit in a quarter. A practice that remembers us as the
people who told them not to buy anything is a better lead in six months than a
forced proposal is today.

## What the physician sees, and does not

| Physician sees | Internal only |
| --- | --- |
| Full report, immediately, no email | The opportunity brief |
| Every formula and assumption | Service fit ratings |
| Confidence levels and open questions | Recommended conversation |
| One restrained CTA at the end | Disqualifiers |
| A 30-day plan requiring no purchase | Discovery questions |

The internal brief contains no claim the physician's own report does not already
support. If that ever stops being true, the tool has stopped working.
