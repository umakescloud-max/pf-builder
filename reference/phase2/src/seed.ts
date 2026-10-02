import { rel, addBusinessDays, formatDateTime } from "@kit";

export interface Case {
  id: string;
  case_id: number;
  patient_name: string;
  payer: string;
  procedure_cpt: string;
  procedure_label: string;
  icd10_code: string;
  icd10_label: string;
  submitted_date: Date;
  decision_date: Date | null;
  status: "submitted" | "pending" | "approved" | "denied";
  denial_reason: string | null;
  appeal_deadline: Date | null;
  sla_days: number;
  appeal_status: "none" | "submitted" | "won" | "lost";
}

export interface CaseNote {
  id: string;
  case_id: number;
  author: string;
  timestamp: Date;
  note_text: string;
}

const PAYERS = [
  "Meridian Health Partners",
  "Palmetto Health Plan",
  "Lakeshore Mutual",
  "Crestview Benefits",
];

const PROCEDURES = [
  { cpt: "73610", label: "Ankle MRI", icd10: "M25.571", icd10_label: "Pain in right ankle" },
  { cpt: "73721", label: "Knee MRI", icd10: "M25.561", icd10_label: "Pain in right knee" },
  { cpt: "72148", label: "Lumbar spine MRI", icd10: "M54.5", icd10_label: "Low back pain" },
  { cpt: "73200", label: "Shoulder X-ray", icd10: "M25.511", icd10_label: "Pain in right shoulder" },
  { cpt: "71046", label: "Chest X-ray", icd10: "R06.02", icd10_label: "Shortness of breath" },
  { cpt: "73110", label: "Wrist X-ray", icd10: "M25.531", icd10_label: "Pain in right wrist" },
  { cpt: "72170", label: "Pelvis X-ray", icd10: "M25.551", icd10_label: "Pain in right hip" },
  { cpt: "73070", label: "Elbow MRI", icd10: "M25.521", icd10_label: "Pain in right elbow" },
];

const DENIAL_REASONS = [
  "missing clinical documentation",
  "not medically necessary per policy",
  "incomplete clinical info",
  "duplicate request",
];

const PATIENT_NAMES = [
  "J. Alvarez",
  "M. Chen",
  "R. Thompson",
  "S. Patel",
  "L. Rodriguez",
  "K. Williams",
  "J. Martinez",
  "A. Kumar",
  "T. Brown",
  "E. Lopez",
];

const AUTHORS = ["Dana Whitfield", "John Smith", "Sarah Johnson", "Mike Chen"];

// Generate deterministic seed data
function generateCases(): Case[] {
  const caseList: Case[] = [];

  // Edge case: #4471 - Meridian Health Partners, lumbar MRI, J. Alvarez
  // Decision date = 3 business days ago, appeal deadline = 5 business days from decision
  const edgeCaseDecisionDate = addBusinessDays(rel(0), -3); // 3 business days ago
  const edgeCaseAppealDeadline = addBusinessDays(edgeCaseDecisionDate, 5);

  caseList.push({
    id: "case-4471",
    case_id: 4471,
    patient_name: "J. Alvarez",
    payer: "Meridian Health Partners",
    procedure_cpt: "72148",
    procedure_label: "Lumbar spine MRI",
    icd10_code: "M54.5",
    icd10_label: "Low back pain",
    submitted_date: addBusinessDays(edgeCaseDecisionDate, -10),
    decision_date: edgeCaseDecisionDate,
    status: "denied",
    denial_reason: "missing clinical documentation",
    appeal_deadline: edgeCaseAppealDeadline,
    sla_days: 5,
    appeal_status: "none",
  });

  // Generate 84 more cases: ~60% submitted/pending, ~25% approved, ~15% denied
  let id = 4472;
  for (let i = 0; i < 84; i++) {
    const payer = PAYERS[i % PAYERS.length];
    const proc = PROCEDURES[i % PROCEDURES.length];
    const patientIdx = Math.floor(i / 8) % PATIENT_NAMES.length;
    const patient = PATIENT_NAMES[patientIdx];

    const submittedDate = rel(Math.floor(Math.random() * -30) - 5);

    let status: "submitted" | "pending" | "approved" | "denied";
    let decisionDate: Date | null = null;
    let denialReason: string | null = null;
    let appealStatus: "none" | "submitted" | "won" | "lost" = "none";
    let appealDeadline: Date | null = null;
    let sla = 5;

    const rand = Math.random();
    if (rand < 0.6) {
      // Submitted/pending
      status = Math.random() < 0.5 ? "submitted" : "pending";
    } else if (rand < 0.85) {
      // Approved
      status = "approved";
      decisionDate = addBusinessDays(submittedDate, Math.floor(Math.random() * 8) + 3);
    } else {
      // Denied
      status = "denied";
      decisionDate = addBusinessDays(submittedDate, Math.floor(Math.random() * 8) + 3);
      denialReason = DENIAL_REASONS[Math.floor(Math.random() * DENIAL_REASONS.length)];
      appealDeadline = addBusinessDays(decisionDate, 5);
      const appealRand = Math.random();
      if (appealRand < 0.4) {
        appealStatus = "none";
      } else if (appealRand < 0.7) {
        appealStatus = "submitted";
      } else if (appealRand < 0.9) {
        appealStatus = "won";
      } else {
        appealStatus = "lost";
      }
    }

    caseList.push({
      id: `case-${id}`,
      case_id: id,
      patient_name: patient,
      payer,
      procedure_cpt: proc.cpt,
      procedure_label: proc.label,
      icd10_code: proc.icd10,
      icd10_label: proc.icd10_label,
      submitted_date: submittedDate,
      decision_date: decisionDate,
      status,
      denial_reason: denialReason,
      appeal_deadline: appealDeadline,
      sla_days: sla,
      appeal_status: appealStatus,
    });

    id++;
  }

  return caseList;
}

function generateNotes(cases: Case[]): CaseNote[] {
  const notes: CaseNote[] = [];
  let noteId = 1;

  for (const caseItem of cases) {
    const noteCount = Math.floor(Math.random() * 4) + 1; // 1-4 notes per case
    for (let i = 0; i < noteCount; i++) {
      const daysAfterSubmit = Math.floor(Math.random() * 20);
      const author = AUTHORS[Math.floor(Math.random() * AUTHORS.length)];
      const noteTexts = [
        "Called the payer, on hold 15 min, no update",
        "Submitted additional documentation",
        "Waiting for payer response",
        "Follow-up required from clinical team",
        "Payer confirmed receipt of submission",
        "Case status unchanged",
        "Patient contacted for more info",
        "Escalated to supervisor",
        "Decision received from payer",
      ];
      const text = noteTexts[Math.floor(Math.random() * noteTexts.length)];

      notes.push({
        id: `note-${noteId}`,
        case_id: caseItem.case_id,
        author,
        timestamp: addBusinessDays(caseItem.submitted_date, daysAfterSubmit),
        note_text: text,
      });

      noteId++;
    }
  }

  return notes;
}

export const cases: Case[] = generateCases();
export const caseNotes: CaseNote[] = generateNotes(cases);

// Helper functions
export function getCase(caseId: number): Case | undefined {
  return cases.find((c) => c.case_id === caseId);
}

export function getCaseNotes(caseId: number): CaseNote[] {
  return caseNotes.filter((n) => n.case_id === caseId).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export function getOpenCases(): Case[] {
  return cases.filter((c) => c.status === "submitted" || c.status === "pending");
}

export function getDeniedCases(): Case[] {
  return cases.filter((c) => c.status === "denied").sort((a, b) => {
    if (a.appeal_deadline && b.appeal_deadline) {
      return a.appeal_deadline.getTime() - b.appeal_deadline.getTime();
    }
    return 0;
  });
}

export function getAppeals(): Case[] {
  return cases
    .filter((c) => c.status === "denied" && (c.appeal_status === "submitted" || c.appeal_status === "won" || c.appeal_status === "lost"))
    .sort((a, b) => {
      const aTime = a.decision_date?.getTime() || 0;
      const bTime = b.decision_date?.getTime() || 0;
      return bTime - aTime;
    });
}

export function getMetrics() {
  const openCount = getOpenCases().length;

  const decidedCases = cases.filter((c) => c.decision_date && (c.status === "approved" || c.status === "denied"));
  const avgDaysToDecision =
    decidedCases.length > 0
      ? decidedCases.reduce((sum, c) => {
          if (c.decision_date && c.submitted_date) {
            const days = Math.floor((c.decision_date.getTime() - c.submitted_date.getTime()) / (1000 * 60 * 60 * 24));
            return sum + days;
          }
          return sum;
        }, 0) / decidedCases.length
      : 0;

  // Last 30 days denial rate
  const thirtyDaysAgo = rel(-30);
  const last30Days = cases.filter((c) => c.decision_date && c.decision_date >= thirtyDaysAgo && (c.status === "approved" || c.status === "denied"));
  const denialRate =
    last30Days.length > 0 ? ((last30Days.filter((c) => c.status === "denied").length / last30Days.length) * 100).toFixed(1) : "0";

  const appealsWon = cases.filter((c) => c.appeal_status === "won").length;

  return {
    openAuthRequests: openCount,
    averageDaysToDecision: Math.round(avgDaysToDecision),
    denialRate: parseFloat(denialRate),
    appealsWon,
  };
}

export function businessDaysBetween(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);

  while (current < endDate) {
    const dayOfWeek = current.getDay();
    // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}
