export interface IntegrationTilesProps {
  tools: string[];
  /** Node labels already shown elsewhere (e.g. the architecture diagram) —
   * any tool whose name appears in one of these is omitted here, so the
   * same system isn't shown twice on the same screen. */
  excludeLabels?: string[];
  title?: string;
}

// Text only, by design — never a logo or button styling, even for a tool
// the poster named.
export function IntegrationTiles({ tools, excludeLabels = [], title }: IntegrationTilesProps) {
  const visible = tools.filter(
    (tool) => !excludeLabels.some((label) => label.toLowerCase().includes(tool.toLowerCase()))
  );

  if (visible.length === 0) return null;

  return (
    <div>
      {title && <h3 className="text-sm font-medium text-[var(--pf-muted)]">{title}</h3>}
      <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${title ? "mt-2" : ""}`}>
        {visible.map((tool) => (
          <div key={tool} className="rounded-lg border border-[var(--pf-muted)]/20 p-3 text-center text-sm">
            {tool}
          </div>
        ))}
      </div>
    </div>
  );
}
