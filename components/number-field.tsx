"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { NumericField } from "@/lib/engine/questions";
import type { NumericAnswer } from "@/lib/engine/types";

/** Digits, one decimal point. Everything else is stripped as the user types. */
function sanitize(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return (
    cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "")
  );
}

function withCommas(value: string): string {
  if (value === "") return "";
  const [whole = "", decimal] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimal === undefined ? grouped : `${grouped}.${decimal}`;
}

function toDisplay(value: NumericAnswer, unit: NumericField["unit"]): string {
  if (value === null) return "";
  return unit === "currency" ? withCommas(String(value)) : String(value);
}

export function NumberField({
  field,
  value,
  onChange,
  autoFocus,
  onSubmitStep,
}: {
  field: NumericField;
  value: NumericAnswer;
  onChange: (value: NumericAnswer) => void;
  autoFocus?: boolean;
  onSubmitStep?: () => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => toDisplay(value, field.unit));
  const [touched, setTouched] = useState(false);

  // Re-sync when the value changes from outside (demo load, back navigation).
  useEffect(() => {
    setText(toDisplay(value, field.unit));
  }, [value, field.unit]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const skipped = value === null && touched;

  const commit = (raw: string) => {
    const clean = sanitize(raw);
    setText(field.unit === "currency" ? withCommas(clean) : clean);
    if (clean === "" || clean === ".") {
      onChange(null);
      return;
    }
    const parsed = Number(clean);
    onChange(Number.isFinite(parsed) ? parsed : null);
  };

  const outOfRange =
    value !== null &&
    ((field.min !== undefined && value < field.min) ||
      (field.max !== undefined && value > field.max));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <label
          htmlFor={id}
          className="text-[15px] font-semibold leading-snug text-ink"
        >
          {field.label}
        </label>
        {field.skippable ? (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setText("");
              setTouched(true);
            }}
            className="text-[12.5px] font-medium text-ink-faint underline decoration-rule-strong underline-offset-4 transition-colors hover:text-accent"
          >
            I don&rsquo;t know
          </button>
        ) : null}
      </div>

      <div
        className={`mt-2.5 flex items-center rounded-md border bg-paper-raised transition-colors focus-within:border-accent ${
          outOfRange ? "border-signal-weak" : "border-rule-strong"
        }`}
      >
        {field.unit === "currency" ? (
          <span
            aria-hidden
            className="tnum select-none pl-3.5 text-[17px] text-ink-faint"
          >
            $
          </span>
        ) : null}
        <input
          ref={inputRef}
          id={id}
          value={text}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setTouched(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmitStep?.();
            }
          }}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="next"
          placeholder={field.placeholder}
          aria-describedby={field.help ? `${id}-help` : undefined}
          aria-invalid={outOfRange || undefined}
          className="tnum w-full bg-transparent px-3.5 py-3 text-[17px] text-ink outline-none placeholder:text-ink-faint/55"
        />
        {field.suffix ? (
          <span className="shrink-0 select-none whitespace-nowrap pr-3.5 text-[13px] text-ink-faint">
            {field.suffix}
          </span>
        ) : null}
      </div>

      {outOfRange ? (
        <p className="mt-2 text-[12.5px] leading-relaxed text-signal-weak">
          That is outside the range this audit can model
          {field.min !== undefined && field.max !== undefined
            ? ` (${field.min}–${field.max})`
            : ""}
          . It will still be recorded, but check it before you rely on the
          report.
        </p>
      ) : null}

      {skipped ? (
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-faint">
          Skipped. Findings that needed this will be marked lower confidence, or
          turned into a question at the end.
        </p>
      ) : field.help ? (
        <p
          id={`${id}-help`}
          className="mt-2 text-[12.5px] leading-relaxed text-ink-faint"
        >
          {field.help}
        </p>
      ) : null}
    </div>
  );
}
