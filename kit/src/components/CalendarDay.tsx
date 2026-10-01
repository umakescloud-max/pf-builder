export interface CalendarEvent {
  id: string;
  time: string;
  title: string;
}

export function CalendarDay({ events }: { events: CalendarEvent[] }) {
  return (
    <ol className="space-y-2">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3 rounded-lg border border-[var(--pf-muted)]/20 p-3 text-sm">
          <span className="w-16 shrink-0 text-[var(--pf-muted)]">{e.time}</span>
          <span>{e.title}</span>
        </li>
      ))}
    </ol>
  );
}
