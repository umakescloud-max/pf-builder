export interface TimelineEntry {
  id: string;
  timestamp: string;
  author: string;
  text: string;
}

export interface TimelineProps {
  entries: TimelineEntry[];
  dataTour?: string;
}

export function Timeline({ entries, dataTour }: TimelineProps) {
  return (
    <ol data-tour={dataTour} className="space-y-4 border-l border-[var(--pf-muted)]/20 pl-4">
      {entries.map((e) => (
        <li key={e.id}>
          <p className="text-xs text-[var(--pf-muted)]">
            {e.timestamp} — {e.author}
          </p>
          <p className="text-sm">{e.text}</p>
        </li>
      ))}
    </ol>
  );
}
