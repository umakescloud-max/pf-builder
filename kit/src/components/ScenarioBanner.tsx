export interface ScenarioBannerProps {
  title: string;
  body: string;
  dataTour?: string;
}

// Accent is a fill color only here — ink text on an accent background,
// never accent text on surface. See KIT.md's anti-template / contrast rules.
export function ScenarioBanner({ title, body, dataTour }: ScenarioBannerProps) {
  return (
    <div data-tour={dataTour} className="rounded-lg bg-[var(--pf-accent)] px-4 py-3 text-[var(--pf-ink)]">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm">{body}</p>
    </div>
  );
}
