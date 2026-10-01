import { useState, type ReactNode } from "react";

export interface FormWizardStep {
  id: string;
  title: string;
  content: ReactNode;
}

export interface FormWizardProps {
  steps: FormWizardStep[];
  onComplete: () => void;
}

export function FormWizard({ steps, onComplete }: FormWizardProps) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex gap-2">
        {steps.map((s, i) => (
          <div
            key={s.id}
            className={`h-1 flex-1 rounded-full ${i <= index ? "bg-[var(--pf-primary)]" : "bg-[var(--pf-muted)]/20"}`}
          />
        ))}
      </div>
      <div>
        <h3 className="text-lg" style={{ fontFamily: "var(--pf-font-heading)" }}>
          {step.title}
        </h3>
        <div className="mt-3">{step.content}</div>
      </div>
      <button
        type="button"
        onClick={() => (isLast ? onComplete() : setIndex((i) => i + 1))}
        className="rounded-lg bg-[var(--pf-primary)] px-4 py-2 text-sm font-medium text-[var(--pf-surface)]"
      >
        {isLast ? "Finish" : "Next"}
      </button>
    </div>
  );
}
