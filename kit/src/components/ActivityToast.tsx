import { useActivity } from "../state/ActivityProvider";

/** Mounted once by AppShell; every logAction() call surfaces here. */
export function ActivityToastHost() {
  const { toasts, dismissToast } = useActivity();
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          data-testid="toast"
          className="pointer-events-auto flex items-center gap-3 rounded-lg bg-[var(--pf-ink)] px-4 py-2 text-sm text-[var(--pf-surface)] shadow-lg"
        >
          <span>{t.text}</span>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss"
            className="text-[var(--pf-surface)]/70"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
