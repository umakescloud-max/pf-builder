export interface DenialReason {
  id: string;
  label: string;
}

// Plain-language denial reasons, never a payer's internal code.
export const DENIAL_REASONS: DenialReason[] = [
  { id: "missing-documentation", label: "Missing clinical documentation" },
  { id: "not-medically-necessary", label: "Not medically necessary per policy" },
  { id: "incomplete-clinical-info", label: "Incomplete clinical information" },
  { id: "duplicate-request", label: "Duplicate request" },
];
