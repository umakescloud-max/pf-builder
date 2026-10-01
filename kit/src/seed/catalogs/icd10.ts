export interface Icd10Entry {
  code: string;
  label: string;
}

// A small, honest sample of real ICD-10-CM codes with the kit's own
// plain-language labels. Never invent a fake code; never use AMA/CMS
// descriptor text verbatim — these labels are written for this kit.
export const ICD10_CODES: Icd10Entry[] = [
  { code: "M54.16", label: "Lower back nerve pain (radiculopathy)" },
  { code: "M54.5", label: "Low back pain" },
  { code: "M51.26", label: "Herniated disc, lower back" },
  { code: "M25.561", label: "Right knee pain" },
  { code: "M75.100", label: "Rotator cuff tear, unspecified shoulder" },
  { code: "M17.11", label: "Osteoarthritis, right knee" },
  { code: "S83.511A", label: "Sprained ACL, right knee, first visit" },
  { code: "M79.604", label: "Pain in right leg" },
];
