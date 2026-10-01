export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--pf-muted)]/30 p-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="mt-1 text-sm text-[var(--pf-muted)]">{body}</p>}
    </div>
  );
}
