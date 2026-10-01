import { useActivity } from "../state/ActivityProvider";

export function AuditLog({ dataTour }: { dataTour?: string }) {
  const { auditLog } = useActivity();
  if (auditLog.length === 0) {
    return <p className="text-sm text-[var(--pf-muted)]">No actions yet.</p>;
  }
  return (
    <ul data-tour={dataTour} className="space-y-2 text-sm">
      {auditLog.map((entry) => (
        <li key={entry.id} className="flex gap-3">
          <span className="shrink-0 text-xs text-[var(--pf-muted)]">
            {entry.timestamp.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </span>
          <span>{entry.text}</span>
        </li>
      ))}
    </ul>
  );
}
