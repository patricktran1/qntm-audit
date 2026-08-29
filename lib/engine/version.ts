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
