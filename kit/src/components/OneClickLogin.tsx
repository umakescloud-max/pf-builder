export interface OneClickLoginProps {
  personaName: string;
  personaRole: string;
  practiceName: string;
  onLogin: () => void;
}

export function OneClickLogin({ personaName, personaRole, practiceName, onLogin }: OneClickLoginProps) {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-[var(--pf-surface)] text-[var(--pf-ink)]"
      style={{ fontFamily: "var(--pf-font-body)" }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-[var(--pf-muted)]/20 p-8 text-center shadow-sm">
        <p className="text-sm text-[var(--pf-muted)]">{practiceName}</p>
        <h1 className="mt-2 text-xl" style={{ fontFamily: "var(--pf-font-heading)" }}>
          Continue as {personaName}
        </h1>
        <p className="mt-1 text-sm text-[var(--pf-muted)]">{personaRole}</p>
        <button
          type="button"
          onClick={onLogin}
          data-tour="one-click-login"
          className="mt-6 w-full rounded-lg bg-[var(--pf-primary)] px-4 py-2 text-sm font-medium text-[var(--pf-surface)]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
