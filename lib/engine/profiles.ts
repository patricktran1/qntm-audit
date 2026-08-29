import type { AuditAnswers } from "./types";

/**
 * SYNTHETIC DEMO PRACTICES
 *
 * Entirely fabricated. No real practice data is used anywhere in this product.
 * These exist so the founder can demo the audit in ten seconds, and so the
 * engine has three realistic shapes to be tested against.
 */

export interface DemoProfile {
  id: string;
  name: string;
  tagline: string;
  description: string;
  answers: AuditAnswers;
}

export const DEMO_PROFILES: DemoProfile[] = [
  {
    id: "solo-front-desk",
    name: "Solo dermatology, strained front desk",
    tagline: "One physician · $1.1M · phones falling over",
    description:
      "A single-physician general dermatology practice with steady demand and a front desk that cannot keep up with the phone. Access is deteriorating and nobody has measured why.",
    answers: {
      physicians: 1,
      apps: 0,
      annualCollections: 1_100_000,
      clinicalDaysPerWeek: 4,
      patientsPerProviderPerDay: 30,
      frontOfficeFte: 2,
      clinicalStaffFte: 2,
      billingModel: "outsourced",
      billingPercent: 7,
      billingFte: null,
      noShowRate: 12,
      callsPerDay: 130,
      unansweredCallPercent: 26,
      thirdNextAvailableDays: 31,
      physicianAdminHoursPerWeek: 8,
      priorAuthStaffHoursPerWeek: 6,
      daysInAR: 44,
      softwareSpendPerMonth: 2_100,
    },
  },
  {
    id: "group-overhead",
    name: "Three-physician group, heavy overhead",
    tagline: "Three physicians + 2 PA/NPs · $5.4M · overstaffed and over-tooled",
    description:
      "A well-established group that has added people and software steadily for a decade. Collections are healthy; the margin is not. Nobody can point to which cost is the problem.",
    answers: {
      physicians: 3,
      apps: 2,
      annualCollections: 5_400_000,
      clinicalDaysPerWeek: 4.5,
      patientsPerProviderPerDay: 26,
      frontOfficeFte: 11,
      clinicalStaffFte: 13,
      billingModel: "in_house",
      billingPercent: null,
      billingFte: 3,
      noShowRate: 9,
      callsPerDay: 340,
      unansweredCallPercent: 14,
      thirdNextAvailableDays: 19,
      physicianAdminHoursPerWeek: 7,
      priorAuthStaffHoursPerWeek: 34,
      daysInAR: 58,
      softwareSpendPerMonth: 11_500,
    },
  },
  {
    id: "growth-admin-burden",
    name: "Growing practice, physician buried in admin",
    tagline: "Two physicians + 3 PA/NPs · $5.2M · strong revenue, no evenings",
    description:
      "Revenue is excellent and growing. The founding physician is working until 9pm on charts, prior auths for biologics are consuming a third of a clinical FTE, and the practice is one resignation away from a real problem.",
    answers: {
      physicians: 2,
      apps: 3,
      annualCollections: 5_200_000,
      clinicalDaysPerWeek: 4.5,
      patientsPerProviderPerDay: 36,
      frontOfficeFte: 6,
      clinicalStaffFte: 9,
      billingModel: "hybrid",
      billingPercent: 4.5,
      billingFte: 1,
      noShowRate: 7,
      callsPerDay: 260,
      unansweredCallPercent: 11,
      thirdNextAvailableDays: 26,
      physicianAdminHoursPerWeek: 15,
      priorAuthStaffHoursPerWeek: 28,
      daysInAR: 36,
      softwareSpendPerMonth: 7_400,
    },
  },
];

export function profileById(id: string): DemoProfile | undefined {
  return DEMO_PROFILES.find((p) => p.id === id);
}
