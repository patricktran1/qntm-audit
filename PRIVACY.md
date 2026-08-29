# PRIVACY

Reviewed after adding pilot persistence. This is an operational practice
diagnostic, not a patient-data system, and the data model is built to keep it
that way.

## The line we do not cross

**No patient-level information is requested, stored, or invited anywhere.**

- No question asks about a patient, a diagnosis, a procedure on a named
  individual, or anything from a chart. The seventeen questions are counts,
  rates, hours, and dollars about the practice as a business.
- No free-text field on the physician-facing side invites clinical detail. The
  only public free-text input is "What is actually on your mind?" on the lead
  form, whose placeholder steers explicitly toward disagreeing with our
  findings.
- Operator notes on the discovery outcome form are about a business
  conversation, are bounded to 600 characters, and are excluded from the
  default export.

If a HIPAA question is ever raised, the honest answer is that this product
neither requests nor has any use for protected health information — not that we
handle it carefully.

## What we store

### Always (in the browser only)

| Data | Where | Why |
| --- | --- | --- |
| Audit answers in progress | `sessionStorage` | Resume after a reload |
| Opaque session id `ps_<24 hex>` | `localStorage` | Join audit → lead → outcome |
| Attribution (source/campaign/cohort/ref) | `localStorage` | Cohort analysis |
| Experiment variant | cookie + `localStorage` | Consistent arm across the funnel |
| Analytics event queue | `sessionStorage` | Local funnel verification |

None of this leaves the browser unless a sink is configured. The session id is
random and encodes nothing about the visitor.

### When a pilot store is configured

One `PilotSession` per completed audit:

- Session id, timestamps, experiment variant, attribution, entry mode, and
  whether the record is demo or QA traffic
- The **banded** practice shape: provider band, collections band, score,
  coverage, completeness, verdict, opportunity band
- Which findings fired, which categories, which dimensions were unscored,
  which questions were skipped
- Assumption movements (which assumption, from, to)
- CTA and lead timestamps
- The encoded answers, so an operator can reopen the exact report

One `DiscoveryOutcome` per recorded conversation: controlled enum values plus
three bounded operator notes.

One small operational metadata entry (`qntm:setup:meta`) recording whether the
last lead-delivery test succeeded. No practice data, no contact details.

### When a lead sink is configured

Name, email, practice name, role, city/state, website, and the physician's own
note — the fields they chose to give us so we can reply. These go to the
configured sink and, deliberately, **not** into the pilot store.

## What we do not store

- Patient information of any kind
- Analytics events carrying raw practice figures. Collections is emitted as
  `3-6M`, never as `5400000`, enforced by the `AuditEvent` union type and
  asserted by tests
- Contact details in the pilot store, in any analytics event, or in the default
  CSV export
- Contact details in a shared report URL — asserted end-to-end by
  `scripts/e2e-walkthrough.mjs`, which submits a lead and then re-fetches the
  report looking for the submitted values
- Raw annual collections in the default analytical export. The encoded report
  column is opt-in behind `?full=1`
- IP addresses. Proxy headers are read only to key the in-memory rate limiter
  and are never persisted

## Why we store what we do

The pilot exists to learn whether the audit's predictions survive contact with
real dermatologists. That requires exactly three joins: an audit to its
outcome, an outcome to the model version that produced the prediction, and a
cohort to its conversion. Everything retained serves one of those; anything
that does not is a band or is absent.

## Retention

**Assumed retention is the length of the pilot.** There is no automatic
expiry, because a fifty-practice dataset is small enough that deleting on a
schedule would destroy the calibration history that justifies collecting it.

The store caps its indexes at 2,000 records, so growth is bounded by
construction rather than by policy.

When the pilot ends, the dataset should be either deleted or reduced to the
anonymous analytical export — which is the same file `/internal/api/export`
produces by default.

A full-fidelity JSON backup (`?kind=backup`) is intended for operational
recovery during the pilot, not for retention afterwards. It carries everything
the store holds, including the encoded answers, so it is treated as store-grade
data wherever it is kept.

## How to delete it

**Everything:** delete the Upstash database, or from its console:

```
DEL qntm:pilot:sessions qntm:pilot:session_index
DEL qntm:pilot:outcomes qntm:pilot:outcome_index
```

Removing `PILOT_KV_REST_URL` and `PILOT_KV_REST_TOKEN` returns the product to
no-op persistence immediately; the audit is unaffected.

**QA records only:** `/internal/setup` → **Clear test records**. Scoped by the
stored `isTest` flag rather than by any id supplied to it, so it cannot reach a
real record. This is deliberately the only destructive action in the UI.

**One practice:** session ids are visible on `/internal/pilot`. Delete both the
session and its outcome:

```
HDEL qntm:pilot:sessions <session_id>
LREM qntm:pilot:session_index 0 <session_id>
HDEL qntm:pilot:outcomes <session_id>
LREM qntm:pilot:outcome_index 0 <session_id>
```

**Leads** live wherever the configured sink put them and are deleted there.
They are not in the pilot store.

**A visitor's own data:** clearing site data for the origin removes the session
id, attribution, variant, and any draft. Nothing already written server-side is
tied to them by anything but the opaque id.

## Enforcement

Not policy — tests.

| Property | Where |
| --- | --- |
| First-touch attribution cannot be overwritten | `tests/workflow.test.ts` |
| Demo and QA records can never become real pilot data | `tests/workflow.test.ts` |
| A stored result cannot change retroactively | `tests/workflow.test.ts` |
| Test-record deletion cannot touch a real record | `tests/workflow.test.ts` |
| Storage failure is never reported as success | `tests/workflow.test.ts` |
| The store probe leaks no URL or token | `tests/workflow.test.ts` |
| Exports reconcile with dashboard counts | `tests/workflow.test.ts` |
| Analytics carry bands, never raw collections | `tests/security.test.ts` |
| No event key is identifier-shaped | `tests/security.test.ts` |
| Snapshots band every practice figure | `tests/security.test.ts` |
| Default CSV carries no contact information | `tests/pilot.test.ts` |
| Default CSV excludes the encoded answers | `tests/pilot.test.ts` |
| Operator notes omitted unless requested | `tests/pilot.test.ts` |
| Attribution cannot carry markup or break a CSV | `tests/pilot.test.ts` |
| Operator notes are bounded server-side | `tests/pilot.test.ts` |
| Shared reports leak no lead identity | `scripts/e2e-walkthrough.mjs` |
| Exports leak no contact details | `scripts/pilot-loop.mjs` |

## Caching and indexing

- Every `/internal` response carries `cache-control: no-store, max-age=0` and
  `x-robots-tag: noindex, nofollow, noarchive`, set in middleware.
- Internal pages are `force-dynamic`, so nothing is statically generated with
  pilot data baked in.
- `robots.txt` disallows `/results`, `/talk`, `/demo`, `/internal` and `/api`.
- The CSV export sets `no-store` and a download disposition.

## Known limitations

- **The internal gate is a shared secret, not identity.** Everyone with the
  token sees the same data and there is no audit trail of who read what. Stated
  in `SECURITY.md`; SSO is the upgrade when the number of operators grows.
- **The pilot store is unencrypted at the field level.** It holds business
  operating data behind a provider credential, not health information.
- **A session id in a lead notification is durable.** Anyone who can read the
  notification channel can construct a brief URL — but the brief itself is
  behind the internal gate, so it resolves to a 404 without the token.
