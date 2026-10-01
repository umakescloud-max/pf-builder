export interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
}

export function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <div className="rounded-xl border border-[var(--pf-muted)]/20 p-4">
      <p className="text-xs text-[var(--pf-muted)]">{label}</p>
      <p className="mt-1 text-2xl" style={{ fontFamily: "var(--pf-font-heading)" }}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-[var(--pf-muted)]">{hint}</p>}
    </div>
  );
}
