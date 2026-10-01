export interface ApprovalItem {
  id: string;
  title: string;
  subtitle?: string;
  /** Tags this item's row with `data-edge-case="true"`, for the smoke gate
   * and visual review to find the brief's edge case unambiguously. */
  edgeCase?: boolean;
}

export interface ApprovalQueueProps {
  items: ApprovalItem[];
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: (item: ApprovalItem) => void;
  onSecondary: (item: ApprovalItem) => void;
  dataTour?: string;
}

export function ApprovalQueue({
  items,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  dataTour,
}: ApprovalQueueProps) {
  return (
    <ul data-tour={dataTour} className="space-y-3">
      {items.map((item, i) => (
        <li
          key={item.id}
          data-tour={dataTour ? (i === 0 ? `${dataTour}-item` : `${dataTour}-item-${item.id}`) : undefined}
          data-edge-case={item.edgeCase ? "true" : undefined}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--pf-muted)]/20 p-4"
        >
          <div>
            <p className="text-sm font-medium">{item.title}</p>
            {item.subtitle && <p className="text-xs text-[var(--pf-muted)]">{item.subtitle}</p>}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onSecondary(item)}
              className="rounded-lg border border-[var(--pf-muted)]/30 px-3 py-1.5 text-sm"
            >
              {secondaryLabel}
            </button>
            <button
              type="button"
              onClick={() => onPrimary(item)}
              className="rounded-lg bg-[var(--pf-primary)] px-3 py-1.5 text-sm font-medium text-[var(--pf-surface)]"
            >
              {primaryLabel}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
