export interface CptEntry {
  code: string;
  label: string;
}

// Real CPT codes, but every label is the kit's own plain-language
// description — never AMA's copyrighted descriptor text.
export const CPT_CODES: CptEntry[] = [
  { code: "72148", label: "MRI of the lower back (no contrast)" },
  { code: "73721", label: "MRI of the knee (no contrast)" },
  { code: "73030", label: "Shoulder X-ray" },
  { code: "29881", label: "Knee arthroscopy with meniscus repair" },
  { code: "97110", label: "Therapeutic exercise session" },
  { code: "64483", label: "Spinal injection for nerve pain" },
  { code: "20610", label: "Joint fluid drainage or injection" },
];
