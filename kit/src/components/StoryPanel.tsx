export interface StoryPanelProps {
  practiceName: string;
  practiceType: string;
  personaName: string;
  dayInTheLife: string;
  painPoints: string[];
  costOfPain: string;
  before: string;
  after: string;
  onStartTour: () => void;
}

export function StoryPanel({
  practiceName,
  practiceType,
  personaName,
  dayInTheLife,
  painPoints,
  costOfPain,
  before,
  after,
  onStartTour,
}: StoryPanelProps) {
  return (
    <div data-tour="story-panel" className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-sm text-[var(--pf-muted)]">{practiceType}</p>
        <h1 className="mt-1 text-3xl" style={{ fontFamily: "var(--pf-font-heading)" }}>
          {practiceName}
        </h1>
        <p className="mt-4 text-[var(--pf-ink)]">{dayInTheLife}</p>
      </div>
      <div>
        <h2 className="text-lg font-medium">What slows {personaName} down</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--pf-muted)]">
          {painPoints.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm">{costOfPain}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--pf-muted)]/20 p-4">
          <h3 className="text-sm font-medium text-[var(--pf-muted)]">Before</h3>
          <p className="mt-2 text-sm">{before}</p>
        </div>
        <div className="rounded-xl border border-[var(--pf-primary)]/30 bg-[var(--pf-primary)]/5 p-4">
          <h3 className="text-sm font-medium text-[var(--pf-primary)]">After</h3>
          <p className="mt-2 text-sm">{after}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onStartTour}
        className="rounded-lg bg-[var(--pf-primary)] px-4 py-2 text-sm font-medium text-[var(--pf-surface)]"
      >
        Start the tour
      </button>
    </div>
  );
}
