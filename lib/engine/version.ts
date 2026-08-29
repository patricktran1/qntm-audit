/**
 * AUDIT MODEL VERSION
 *
 * From the pilot onward we are collecting evidence *against* this model, so
 * every stored record must say which model produced it. Calibrating a moving
 * target is worthless.
 *
 * ── Versioning policy ──────────────────────────────────────────────────────
 *
 * MAJOR — the meaning of a result changes. A verdict level is added, removed,
 *   or redefined; a score dimension is added or dropped; the question set
 *   changes such that an old share link no longer decodes to the same
 *   practice. Historical results are NOT comparable across a major bump and
 *   calibration must be segmented by it.
 *
 * MINOR — a result may change for some practices, but the meaning does not.
 *   A detector threshold moves, a scoring curve is re-anchored, a new detector
 *   is added, an economic formula is corrected. Calibration across a minor
 *   bump is valid if the version is reported alongside.
 *
 * PATCH — no computed value changes for any input. Copy, ordering, comments,
 *   presentation. A patch bump must never move a fixture assertion.
 *
 * Every substantive change gets an entry in MODEL_CHANGELOG.md. Bumping this
 * constant without one is a defect.
 */
export const MODEL_VERSION = "1.1.0";

/**
 * Share-link compatibility contract.
 *
 * A share link encodes **answers only** — never a computed result. That is
 * deliberate: it keeps links short, keeps the payload inspectable, and means a
 * physician re-opening their link always sees the current model's reading of
 * their practice rather than a stale one.
 *
 * The consequence, stated rather than hidden: a report URL is not a frozen
 * artefact. If the model changes, the report changes.
 *
 * Reproducibility is preserved on the pilot side instead. When an audit is
 * completed we store the computed snapshot *and* the model version that
 * produced it, so calibration always compares a discovery conversation against
 * what the physician was actually shown — not against what today's model would
 * say. Fixtures in tests/fixtures.test.ts pin the model's behaviour so that an
 * unintended change fails a test rather than silently rewriting history.
 */
export const SHARE_ENCODING_VERSION = 1;

/**
 * PILOT MODEL FREEZE
 *
 * The initial real-world pilot runs against MODEL_VERSION exactly as pinned
 * here. While `active` is true:
 *
 *   - no threshold tuning based on individual anecdotes
 *   - no detector changes because one prospect disagrees
 *   - no economic-model changes because a number feels uncomfortable
 *   - no landing-experiment winner declared
 *   - no benchmark claims
 *   - no automatic optimisation of any kind
 *
 * A true correctness bug can still be fixed. If that happens: document it in
 * MODEL_CHANGELOG.md, add regression coverage, decide PATCH / MINOR / MAJOR
 * under the policy above, and preserve comparability rules. Anything short of
 * a correctness bug waits for the first-ten review described in
 * PILOT_RUNBOOK.md.
 *
 * Enforced two ways: tests/integrity.test.ts asserts that the frozen version
 * matches MODEL_VERSION while the freeze is active (so a casual model bump
 * fails CI until the freeze is deliberately lifted or moved), and every
 * internal surface displays the freeze so an operator can see at a glance
 * which model the pilot is collecting evidence against.
 */
export const PILOT_FREEZE = {
  active: true,
  version: "1.1.0",
  startedAt: "2026-08-29",
} as const;
