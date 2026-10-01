// Entirely fictional payer names. Never a real insurer — this list is the
// only source of payer names any demo may use.
export const FICTIONAL_PAYERS = [
  "Meridian Health Partners",
  "Palmetto Health Plan",
  "Lakeshore Mutual",
  "Crestview Benefits",
] as const;

export type FictionalPayer = (typeof FICTIONAL_PAYERS)[number];
