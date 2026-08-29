"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NumberField } from "@/components/number-field";
import { Wordmark } from "@/components/wordmark";
import {
  currentVariant,
  reportDimensions,
  track,
  type Variant,
} from "@/lib/analytics";
import { encodeAnswers } from "@/lib/share";
import {
  EMPTY_ANSWERS,
  isStepComplete,
  STEPS,
  visibleFields,
} from "@/lib/engine/questions";
import { DEMO_PROFILES, profileById } from "@/lib/engine/profiles";
import { runAudit } from "@/lib/engine/audit";
import type { AuditAnswers, BillingModel, NumericAnswer } from "@/lib/engine/types";

const DRAFT_KEY = "qntm.audit.draft";

export function AuditFlow({ demoId }: { demoId?: string }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<AuditAnswers>(EMPTY_ANSWERS);
  const [index, setIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const startedAt = useRef<number>(Date.now());
  const reported = useRef(false);
  // Tracks how far the visitor actually got, so an abandon event distinguishes
  // "left on screen 2" from "went back to screen 2 after reaching screen 8".
  const furthest = useRef(0);

  // Restore a draft, or load a demo profile when one is requested.
  useEffect(() => {
    const variant: Variant = currentVariant() ?? "A";
    const demo = demoId ? profileById(demoId) : undefined;
    if (demo) {
      setAnswers(demo.answers);
      track({ name: "audit_started", source: "demo", variant });
      setHydrated(true);
      return;
    }
    let restored = false;
    try {
      const raw = window.sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { answers: AuditAnswers; index: number };
        if (parsed?.answers) {
          setAnswers({ ...EMPTY_ANSWERS, ...parsed.answers });
          setIndex(Math.min(Math.max(parsed.index ?? 0, 0), STEPS.length - 1));
          restored = true;
        }
      }
    } catch {
      // A corrupt draft is not worth surfacing; start clean.
    }
    track({ name: "audit_started", source: restored ? "resume" : "cta", variant });
    setHydrated(true);
  }, [demoId]);

  // Persist the draft so a reload or an interruption does not cost the work.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ answers, index }));
    } catch {
      // Private mode. The audit still works, it just will not resume.
    }
  }, [answers, index, hydrated]);

  // Record abandonment when the tab closes mid-audit.
  useEffect(() => {
    const onHide = () => {
      if (reported.current) return;
      const step = STEPS[index];
      if (step)
        track({
          name: "audit_abandoned",
          step: step.id,
          index,
          furthestIndex: furthest.current,
        });
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [index]);

  const step = STEPS[index]!;
  const fields = useMemo(() => visibleFields(step, answers), [step, answers]);
  const canAdvance = isStepComplete(step, answers);
  const isLast = index === STEPS.length - 1;

  const setField = useCallback((key: keyof AuditAnswers, value: NumericAnswer) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }, []);

  const finish = useCallback(
    (final: AuditAnswers) => {
      reported.current = true;
      const skipped = (Object.keys(final) as (keyof AuditAnswers)[]).filter(
        (k) => final[k] === null,
      );
      // Banded dimensions only — no raw collections, no free text.
      const result = runAudit(final);
      track({
        name: "audit_completed",
        durationMs: Date.now() - startedAt.current,
        dimensions: reportDimensions(result),
        skippedCount: skipped.length,
      });
      try {
        window.sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // Nothing to do.
      }
      router.push(`/results?a=${encodeURIComponent(encodeAnswers(final))}`);
    },
    [router],
  );

  const next = useCallback(() => {
    if (!canAdvance) return;
    const skipped = fields
      .filter((f) => answers[f.key] === null)
      .map((f) => f.key as string);
    skipped.forEach((field) =>
      track({ name: "unknown_selected", field, step: step.id }),
    );
    track({ name: "screen_completed", step: step.id, index, skipped });
    if (isLast) finish(answers);
    else setIndex((i) => i + 1);
  }, [answers, canAdvance, fields, finish, index, isLast, step.id]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    furthest.current = Math.max(furthest.current, index);
  }, [index]);

  // Cmd/Ctrl+Enter advances from anywhere on the step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next]);

  const progress = ((index + (canAdvance ? 1 : 0)) / STEPS.length) * 100;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-[820px] items-center justify-between px-5 py-4 sm:px-8">
          <Wordmark subdued />
          <span className="tnum text-[12px] uppercase tracking-[0.1em] text-ink-faint">
            Step {index + 1} of {STEPS.length}
          </span>
        </div>
        <div
          className="h-[3px] w-full bg-paper-sunk"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-label="Audit progress"
        >
          <div
            className="h-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[820px] flex-1 px-5 py-10 sm:px-8 sm:py-14">
        {/* Step rail — orientation without a giant form. */}
        <ol className="mb-10 hidden flex-wrap gap-x-4 gap-y-2 sm:flex">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => i <= index && setIndex(i)}
                disabled={i > index}
                className={`text-[12px] uppercase tracking-[0.08em] transition-colors ${
                  i === index
                    ? "font-semibold text-accent"
                    : i < index
                      ? "text-ink-faint hover:text-ink"
                      : "text-rule-strong"
                } ${i > index ? "cursor-default" : "cursor-pointer"}`}
              >
                {s.title}
              </button>
            </li>
          ))}
        </ol>

        <div key={step.id}>
          <h1 className="display text-[1.9rem] leading-tight text-ink sm:text-[2.25rem]">
            {step.prompt}
          </h1>
          <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-ink-muted">
            {step.rationale}
          </p>

          <div className="mt-10 space-y-8">
            {fields.map((field, i) =>
              field.kind === "choice" ? (
                <ChoiceInput
                  key={field.key}
                  label={field.label}
                  value={answers.billingModel}
                  options={field.options}
                  onChange={(v) =>
                    setAnswers((prev) => ({ ...prev, billingModel: v }))
                  }
                />
              ) : (
                <NumberField
                  key={field.key}
                  field={field}
                  value={answers[field.key]}
                  onChange={(v) => setField(field.key, v)}
                  autoFocus={i === 0 && index > 0}
                  onSubmitStep={next}
                />
              ),
            )}
          </div>
        </div>

        <div className="mt-12 border-t border-rule pt-6">
          {!canAdvance ? (
            <p className="mb-4 text-[12.5px] text-ink-faint sm:hidden">
              This one is needed to compute the rest
            </p>
          ) : null}

          <div className="flex flex-col-reverse items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
            {index > 0 ? (
              <button
                type="button"
                onClick={back}
                className="min-h-11 whitespace-nowrap text-[14px] font-medium text-ink-muted transition-colors hover:text-ink sm:text-left"
              >
                ← Back
              </button>
            ) : (
              <Link
                href="/"
                className="inline-flex min-h-11 items-center justify-center whitespace-nowrap text-[14px] font-medium text-ink-muted no-underline transition-colors hover:text-ink sm:justify-start"
              >
                ← Leave audit
              </Link>
            )}

            <div className="flex items-center gap-5 sm:justify-end">
              {!canAdvance ? (
                <span className="hidden text-[12.5px] text-ink-faint sm:inline">
                  This one is needed to compute the rest
                </span>
              ) : null}
              <button
                type="button"
                onClick={next}
                disabled={!canAdvance}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-accent px-6 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-accent-ink disabled:cursor-not-allowed disabled:bg-rule-strong disabled:text-paper-raised sm:w-auto"
              >
                {isLast ? "See results" : "Continue"}
              </button>
            </div>
          </div>
        </div>

        {index === 0 ? (
          <div className="mt-14 border-t border-rule pt-6">
            <p className="eyebrow">Short on time?</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
              Load a synthetic practice and skip straight to a finished report.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {DEMO_PROFILES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setAnswers(p.answers);
                    setIndex(STEPS.length - 1);
                    track({
                      name: "audit_started",
                      source: "demo",
                      variant: currentVariant() ?? "A",
                    });
                  }}
                  className="rounded-full border border-rule-strong px-3.5 py-1.5 text-[12.5px] text-ink-muted transition-colors hover:border-accent hover:text-accent"
                >
                  {p.tagline}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function ChoiceInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: BillingModel | null;
  options: { value: BillingModel; label: string; description: string }[];
  onChange: (v: BillingModel) => void;
}) {
  return (
    <fieldset>
      <legend className="text-[15px] font-semibold text-ink">
        {label}
      </legend>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              className={`rounded-md border px-4 py-3.5 text-left transition-colors ${
                active
                  ? "border-accent bg-accent-soft"
                  : "border-rule-strong bg-paper-raised hover:border-ink-faint"
              }`}
            >
              <span
                className={`block text-[14.5px] font-semibold ${
                  active ? "text-accent-ink" : "text-ink"
                }`}
              >
                {opt.label}
              </span>
              <span className="mt-1 block text-[12.5px] leading-snug text-ink-muted">
                {opt.description}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
