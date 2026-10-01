export type StatusTone = "primary" | "accent" | "muted";

export interface StatusPillProps {
  label: string;
  tone: StatusTone;
}

// Accent tone uses ink text on an accent fill (never accent as text color).
const TONE_CLASSES: Record<StatusTone, string> = {
  primary: "bg-[var(--pf-primary)]/10 text-[var(--pf-primary)]",
  accent: "bg-[var(--pf-accent)] text-[var(--pf-ink)]",
  muted: "bg-[var(--pf-muted)]/15 text-[var(--pf-muted)]",
};

export function StatusPill({ label, tone }: StatusPillProps) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {label}
    </span>
  );
}
