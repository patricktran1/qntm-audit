# SECURITY

What is protected, how, and — more usefully — what is not.

## Threat model

This product holds no patient data, no accounts, and no database. The realistic
risks are therefore narrow:

1. A competitor or a curious visitor finding the internal sales brief.
2. A malformed or hand-edited share link producing a nonsense report, or worse,
   an error that leaks a stack trace.
3. Someone flooding the lead endpoint with junk.
4. Practice figures or contact details leaking into analytics.

Each is addressed below. There is deliberately no authentication system,
because there is nothing to authenticate to.

## Internal surfaces

`/internal/*` — the sales brief and the session-events view — is gated in
`middleware.ts`:

- Requires `INTERNAL_ACCESS_TOKEN`. A `?key=` parameter is exchanged for an
  `httpOnly`, `secure`, 12-hour cookie scoped to `/internal`, then removed from
  the URL by redirect so the secret does not persist in browser history or in a
  screen-shared address bar.
- Comparison is length-checked then constant-time, so the token cannot be
  probed by timing.
- Failure returns **404, not 401** — an unauthorised visitor learns nothing
  exists at that path.
- With no token configured the gate **refuses in production** and allows in
  development, so a missing environment variable fails closed.
- Responses carry `x-robots-tag: noindex, nofollow, noarchive` and
  `cache-control: no-store`.

**Limitation, stated plainly:** this is a shared secret, not identity. Everyone
with the link has the same access, there is no audit trail of who viewed what,
and revocation means rotating the token for everybody. That is an acceptable
trade for an internal tool used by a handful of people and a bad one at thirty.
The upgrade path is SSO in front of `/internal`, and it is a genuine project,
not a config change.

## Share links

Reports encode into the URL, so the payload is attacker-controlled by design.
`decodeAnswers` therefore:

- Rejects anything that is not exactly the expected field count.
- Treats a blank segment as *unknown*, never as zero. (This was a real bug: a
  truncated link previously decoded to a practice with zero physicians and zero
  collections and rendered a confident report about it.)
- Rejects a payload that decodes no usable values at all.
- Drops non-finite and out-of-range numbers rather than rendering them.
- Writes only into a fixed key list, so no `__proto__` or constructor key can
  be introduced.

Covered by `tests/security.test.ts`, including prototype-pollution attempts,
`1e400`, `NaN`, negative values, and 5,000-character payloads.

A share link contains **only audit answers**. No contact details, no lead
state, no identity — asserted by an end-to-end test that submits a lead and
then re-fetches the report looking for the submitted values.

## API routes

Both routes cap the body, parse defensively, and rate-limit.

| Route | Limit | Body cap |
| --- | --- | --- |
| `/api/lead` | 5 per client per 10 min | 16 KB |
| `/api/events` | 240 per client per min | 8 KB |

`/api/lead` validation (`lib/leads/validate.ts`) runs server-side and trusts
nothing from the form: every string is bounded and stripped of control
characters, unknown enum values fall back to safe defaults, websites that are
not `http(s)` are dropped entirely, and the encoded report is verified by
decoding it before use. Practice context on the delivered record is derived
**server-side from the answers**, never from what the client claims about the
audit.

The response never echoes submitted values back, and when no sink is
configured, the server-side log line deliberately omits name, email, practice,
and free text.

**Limitation:** the rate limiter is in-memory and therefore per warm serverless
instance, not global. It stops casual abuse and scripted floods; it does not
stop a distributed attacker. A real limiter belongs at the edge or in a shared
store. This is documented in `lib/rate-limit.ts` rather than pretended
otherwise.

## Analytics

Events carry **bands, not values** — `collectionsBand`, `providerBand`,
`scoreBand`, `coverageBand` — enforced by the `AuditEvent` union type. A test
asserts that a report's raw collections figure appears nowhere in a serialised
event payload, and that no event key contains an identifier-shaped name.

Free text (the lead form's "what is on your mind") is never emitted.

## Not addressed

- **No CSRF token** on `/api/lead`. The endpoint is unauthenticated and
  performs no state change on behalf of a user, so a forged request achieves
  nothing an attacker could not do directly.
- **No CAPTCHA.** Rate limiting plus email validation is proportionate at this
  volume. Revisit if spam becomes real.
- **No signed share links.** Anyone can construct a report URL for a practice
  that does not exist. Since reports contain only what the constructor typed,
  this forges nothing.
- **No transport-level secrets.** The product holds none.
