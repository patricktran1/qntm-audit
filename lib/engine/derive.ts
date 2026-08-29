import type { Assumptions, AuditAnswers, Confidence, Metric } from "./types";

/**
 * DERIVED ECONOMICS
 *
 * Nothing here reads from an industry data set. Every value is a function of
 * the practice's own answers plus named assumptions, and every value carries
 * the formula that produced it so a CFO can re-derive it by hand.
 */

export interface Derived {
  providers: number | null;
  clinicalDaysPerYear: number | null;
  providerClinicalHoursPerYear: number | null;
  annualVisits: number | null;
  collectionsPerVisit: number | null;
  collectionsPerPhysician: number | null;
  collectionsPerClinicalDay: number | null;
  collectionsPerProviderHour: number | null;
  /** The physician-time-value number. Contribution, not gross revenue. */
  contributionPerProviderHour: number | null;

  frontOfficeCost: number | null;
  clinicalStaffCost: number | null;
  billingCost: number | null;
  softwareCost: number | null;
  identifiedOverhead: number | null;
  overheadShare: number | null;

  supportStaffPerProvider: number | null;
  frontOfficePerProvider: number | null;

  callsPerYear: number | null;
  handledCallsPerDay: number | null;
  unansweredCallsPerDay: number | null;
  callHoursPerDay: number | null;
  callShareOfFrontOfficeCapacity: number | null;
  callsPerFrontOfficeFtePerDay: number | null;

  physicianAdminHoursPerYear: number | null;
  physicianAdminShareOfWorkWeek: number | null;
  practiceAdminHoursPerYear: number | null;
  physicianAdminOpportunityCost: number | null;

  priorAuthHoursPerYear: number | null;
  priorAuthLaborCost: number | null;

  noShowVisitsPerYear: number | null;
  noShowRecoverableValue: number | null;

  softwarePerProviderPerMonth: number | null;
}

const n = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** Multiply, propagating null if any operand is missing. */
function mul(...vals: (number | null)[]): number | null {
  let out = 1;
  for (const v of vals) {
    if (!n(v)) return null;
    out *= v;
  }
  return out;
}

/** Divide, propagating null and guarding divide-by-zero. */
function div(a: number | null, b: number | null): number | null {
  if (!n(a) || !n(b) || b === 0) return null;
  return a / b;
}

function sumDefined(...vals: (number | null)[]): number | null {
  const present = vals.filter(n);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
}

export function derive(a: AuditAnswers, k: Assumptions): Derived {
  const providers = sumDefined(a.physicians, a.apps);

  const clinicalDaysPerYear = mul(a.clinicalDaysPerWeek, k.clinicalWeeksPerYear);
  const providerClinicalHoursPerYear = mul(clinicalDaysPerYear, k.hoursPerClinicalDay);

  const annualVisits = mul(a.patientsPerProviderPerDay, providers, clinicalDaysPerYear);

  const collectionsPerVisit = div(a.annualCollections, annualVisits);
  const collectionsPerPhysician = div(a.annualCollections, a.physicians);
  const collectionsPerClinicalDay = div(
    a.annualCollections,
    mul(clinicalDaysPerYear, providers),
  );
  const collectionsPerProviderHour = div(
    a.annualCollections,
    mul(providers, providerClinicalHoursPerYear),
  );
  const contributionPerProviderHour = mul(collectionsPerProviderHour, k.contributionMargin);

  const frontOfficeCost = mul(
    a.frontOfficeFte,
    k.frontOfficeLoadedHourlyCost,
    k.workingHoursPerFteYear,
  );
  const clinicalStaffCost = mul(
    a.clinicalStaffFte,
    k.clinicalStaffLoadedHourlyCost,
    k.workingHoursPerFteYear,
  );

  const outsourcedBilling =
    a.billingModel === "outsourced" || a.billingModel === "hybrid"
      ? mul(a.annualCollections, div(a.billingPercent, 100))
      : null;
  const inHouseBilling =
    a.billingModel === "in_house" || a.billingModel === "hybrid"
      ? mul(a.billingFte, k.billingStaffLoadedHourlyCost, k.workingHoursPerFteYear)
      : null;
  const billingCost = sumDefined(outsourcedBilling, inHouseBilling);

  const softwareCost = mul(a.softwareSpendPerMonth, 12);
  const identifiedOverhead = sumDefined(
    frontOfficeCost,
    clinicalStaffCost,
    billingCost,
    softwareCost,
  );
  const overheadShare = div(identifiedOverhead, a.annualCollections);

  const supportStaffPerProvider = div(
    sumDefined(a.frontOfficeFte, a.clinicalStaffFte),
    providers,
  );
  const frontOfficePerProvider = div(a.frontOfficeFte, providers);

  const unansweredShare = div(a.unansweredCallPercent, 100);
  const unansweredCallsPerDay = mul(a.callsPerDay, unansweredShare);
  const handledCallsPerDay =
    n(a.callsPerDay) && n(unansweredCallsPerDay)
      ? a.callsPerDay - unansweredCallsPerDay
      : a.callsPerDay ?? null;
  const callsPerYear = mul(a.callsPerDay, clinicalDaysPerYear);
  const callHoursPerDay = div(mul(handledCallsPerDay, k.callHandleMinutes), 60);
  const callShareOfFrontOfficeCapacity = div(
    callHoursPerDay,
    mul(a.frontOfficeFte, 8),
  );
  const callsPerFrontOfficeFtePerDay = div(a.callsPerDay, a.frontOfficeFte);

  const physicianAdminHoursPerYear = mul(
    a.physicianAdminHoursPerWeek,
    k.clinicalWeeksPerYear,
  );
  const scheduledWeeklyHours = mul(a.clinicalDaysPerWeek, k.hoursPerClinicalDay);
  const physicianAdminShareOfWorkWeek =
    n(a.physicianAdminHoursPerWeek) && n(scheduledWeeklyHours)
      ? a.physicianAdminHoursPerWeek /
        (a.physicianAdminHoursPerWeek + scheduledWeeklyHours)
      : null;
  const practiceAdminHoursPerYear = mul(physicianAdminHoursPerYear, a.physicians);
  const physicianAdminOpportunityCost = mul(
    practiceAdminHoursPerYear,
    contributionPerProviderHour,
  );

  const priorAuthHoursPerYear = mul(
    a.priorAuthStaffHoursPerWeek,
    k.clinicalWeeksPerYear,
  );
  const priorAuthLaborCost = mul(
    priorAuthHoursPerYear,
    k.clinicalStaffLoadedHourlyCost,
  );

  // No-shows are expressed as a share of booked slots. Realized visits are the
  // slots that were kept, so booked slots = visits / (1 - no-show rate).
  const noShowShare = div(a.noShowRate, 100);
  const bookedSlots =
    n(annualVisits) && n(noShowShare) && noShowShare < 1
      ? annualVisits / (1 - noShowShare)
      : null;
  const noShowVisitsPerYear = mul(bookedSlots, noShowShare);
  const noShowRecoverableValue = mul(
    noShowVisitsPerYear,
    collectionsPerVisit,
    k.contributionMargin,
    k.noShowRecaptureRate,
  );

  const softwarePerProviderPerMonth = div(a.softwareSpendPerMonth, providers);

  return {
    providers,
    clinicalDaysPerYear,
    providerClinicalHoursPerYear,
    annualVisits,
    collectionsPerVisit,
    collectionsPerPhysician,
    collectionsPerClinicalDay,
    collectionsPerProviderHour,
    contributionPerProviderHour,
    frontOfficeCost,
    clinicalStaffCost,
    billingCost,
    softwareCost,
    identifiedOverhead,
    overheadShare,
    supportStaffPerProvider,
    frontOfficePerProvider,
    callsPerYear,
    handledCallsPerDay,
    unansweredCallsPerDay,
    callHoursPerDay,
    callShareOfFrontOfficeCapacity,
    callsPerFrontOfficeFtePerDay,
    physicianAdminHoursPerYear,
    physicianAdminShareOfWorkWeek,
    practiceAdminHoursPerYear,
    physicianAdminOpportunityCost,
    priorAuthHoursPerYear,
    priorAuthLaborCost,
    noShowVisitsPerYear,
    noShowRecoverableValue,
    softwarePerProviderPerMonth,
  };
}

/**
 * The metrics we surface in the report, each with its formula. Order matters —
 * this is the reading order of the Economic Snapshot.
 */
export function buildMetrics(
  a: AuditAnswers,
  k: Assumptions,
  d: Derived,
): Metric[] {
  const conf = (c: Confidence, ...vals: (number | null)[]): Confidence =>
    vals.some((v) => !n(v)) ? "low" : c;

  const raw: Metric[] = [
    {
      key: "collectionsPerPhysician",
      label: "Collections per physician",
      value: d.collectionsPerPhysician,
      unit: "currency",
      formula: "annual collections ÷ physician FTE",
      basis: ["annual collections", "physician FTE"],
      confidence: "high",
    },
    {
      key: "collectionsPerClinicalDay",
      label: "Collections per provider clinic day",
      value: d.collectionsPerClinicalDay,
      unit: "currency",
      formula:
        "annual collections ÷ (clinic days per week × clinic weeks per year × total providers)",
      basis: ["annual collections", "clinic days/week", "clinical weeks/year", "providers"],
      confidence: "medium",
      note: "Uses the clinic-weeks-per-year assumption.",
    },
    {
      key: "collectionsPerVisit",
      label: "Collections per patient visit",
      value: d.collectionsPerVisit,
      unit: "currency",
      formula: "annual collections ÷ (patients per provider per day × providers × clinic days per year)",
      basis: ["annual collections", "patients/provider/day", "providers", "clinic days/year"],
      confidence: "medium",
      note: "Sensitive to how accurately patients-per-day reflects a normal week.",
    },
    {
      key: "collectionsPerProviderHour",
      label: "Collections per provider clinical hour",
      value: d.collectionsPerProviderHour,
      unit: "currency",
      formula:
        "annual collections ÷ (providers × clinic days per year × patient-facing hours per day)",
      basis: ["annual collections", "providers", "clinic days/year", "hours/clinic day"],
      confidence: "medium",
    },
    {
      key: "contributionPerProviderHour",
      label: "Value of one provider hour (contribution)",
      value: d.contributionPerProviderHour,
      unit: "currency",
      formula: "collections per provider clinical hour × marginal contribution margin",
      basis: ["collections per provider hour", "contribution margin"],
      confidence: "medium",
      note: "This is what an hour is worth on the margin — not gross revenue. Every time-based estimate in this report uses this figure, not the gross one.",
    },
    {
      key: "annualVisits",
      label: "Estimated annual patient visits",
      value: d.annualVisits,
      unit: "number",
      formula: "patients per provider per day × providers × clinic days per year",
      basis: ["patients/provider/day", "providers", "clinic days/year"],
      confidence: "medium",
    },
    {
      key: "identifiedOverhead",
      label: "Identified overhead (staff + billing + software)",
      value: d.identifiedOverhead,
      unit: "currency",
      formula:
        "front-office cost + clinical staff cost + billing cost + software cost",
      basis: ["staff FTE", "loaded hourly costs", "billing model", "software spend"],
      confidence: conf("medium", d.frontOfficeCost, d.clinicalStaffCost),
      note: "Partial by design. Excludes rent, supplies, malpractice, physician compensation, and benefits beyond the loaded hourly rate.",
    },
    {
      key: "overheadShare",
      label: "Identified overhead as share of collections",
      value: d.overheadShare,
      unit: "percent",
      formula: "identified overhead ÷ annual collections",
      basis: ["identified overhead", "annual collections"],
      confidence: "medium",
      note: "Compare against your own P&L, not against an industry figure — this is a partial overhead measure.",
    },
    {
      key: "billingCost",
      label: "Annual billing / RCM cost",
      value: d.billingCost,
      unit: "currency",
      formula:
        a.billingModel === "outsourced"
          ? "annual collections × billing fee %"
          : a.billingModel === "in_house"
            ? "billing FTE × loaded hourly cost × 2,080 hours"
            : "billing fee % of collections + in-house billing labor",
      basis: ["billing model", "billing fee % or FTE", "annual collections"],
      confidence: a.billingModel === "outsourced" ? "high" : "medium",
    },
    {
      key: "physicianAdminOpportunityCost",
      label: "Annual value at stake in physician admin time",
      value: d.physicianAdminOpportunityCost,
      unit: "currency",
      formula:
        "physician admin hours/week × clinic weeks/year × physicians × contribution per provider hour",
      basis: ["physician admin hours", "clinical weeks/year", "physicians", "contribution per hour"],
      confidence: "medium",
      note: "This is not cash sitting on a table. It is the value of that time if it were converted to clinical work — or the price you are paying for it in evenings.",
    },
    {
      key: "priorAuthLaborCost",
      label: "Annual staff labor spent on prior authorization",
      value: d.priorAuthLaborCost,
      unit: "currency",
      formula: "prior-auth hours/week × clinic weeks/year × clinical staff loaded hourly cost",
      basis: ["prior auth hours/week", "clinical weeks/year", "loaded hourly cost"],
      confidence: "medium",
    },
    {
      key: "callHoursPerDay",
      label: "Front-office hours per day consumed by phones",
      value: d.callHoursPerDay,
      unit: "hours",
      formula: "handled calls per day × staff minutes per call ÷ 60",
      basis: ["calls/day", "unanswered %", "minutes per call"],
      confidence: "low",
      note: "Depends on the minutes-per-call assumption, which varies widely by practice.",
    },
    {
      key: "callShareOfFrontOfficeCapacity",
      label: "Share of front-office capacity spent on phones",
      value: d.callShareOfFrontOfficeCapacity,
      unit: "percent",
      formula: "phone hours per day ÷ (front-office FTE × 8 hours)",
      basis: ["phone hours/day", "front-office FTE"],
      confidence: "low",
    },
    {
      key: "softwarePerProviderPerMonth",
      label: "Software spend per provider per month",
      value: d.softwarePerProviderPerMonth,
      unit: "currency",
      formula: "monthly software spend ÷ total providers",
      basis: ["software spend", "providers"],
      confidence: "high",
    },
  ];

  return raw.filter((m) => m.value !== null);
}
