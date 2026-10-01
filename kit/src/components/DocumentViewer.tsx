export interface DocumentViewerProps {
  title: string;
  lines: string[];
  missing?: boolean;
  dataTour?: string;
}

export function DocumentViewer({ title, lines, missing, dataTour }: DocumentViewerProps) {
  if (missing) {
    return (
      <div
        data-tour={dataTour}
        className="rounded-xl border border-dashed border-[var(--pf-muted)]/40 p-6 text-center text-sm text-[var(--pf-muted)]"
      >
        {title} — not yet received
      </div>
    );
  }
  return (
    <div data-tour={dataTour} className="rounded-xl border border-[var(--pf-muted)]/20 p-4">
      <h4 className="text-sm font-medium">{title}</h4>
      <div className="mt-2 space-y-1 text-sm text-[var(--pf-ink)]">
        {lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  );
}
