import { useEffect, useState, type ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  dataTour?: string;
  /** Key of the column shown as the status chip in the mobile card layout. */
  mobileStatusKey?: string;
  /** Key of the column shown as the secondary urgency line in the mobile
   * card layout (e.g. days-to-SLA, appeal countdown). */
  mobileUrgencyKey?: string;
  /** True for the one row that is the brief's edge case — tags it with
   * `data-edge-case="true"` for the smoke gate and visual review. */
  edgeCaseRow?: (row: T) => boolean;
}

const NARROW_QUERY = "(max-width: 639px)";

function useIsNarrow(): boolean {
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(NARROW_QUERY).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(NARROW_QUERY);
    const update = () => setIsNarrow(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return isNarrow;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  dataTour,
  mobileStatusKey = "status",
  mobileUrgencyKey,
  edgeCaseRow,
}: DataTableProps<T>) {
  const isNarrow = useIsNarrow();
  const titleColumn = columns[0];
  const statusColumn = columns.find((c) => c.key === mobileStatusKey);
  const urgencyColumn = mobileUrgencyKey ? columns.find((c) => c.key === mobileUrgencyKey) : undefined;
  const restColumns = columns.filter(
    (c) => c !== titleColumn && c !== statusColumn && c !== urgencyColumn
  );

  function rowAttrs(row: T) {
    return edgeCaseRow?.(row) ? { "data-edge-case": "true" } : {};
  }

  // Below 640px this renders as a stacked card list instead of a table —
  // never a horizontally scrolling table on a phone-sized viewport.
  if (isNarrow) {
    return (
      <ul data-tour={dataTour} className="space-y-3">
        {rows.map((row) => {
          const key = rowKey(row);
          return (
            <li
              key={key}
              data-tour={dataTour ? `${dataTour}-row-${key}` : undefined}
              {...rowAttrs(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`rounded-xl border border-[var(--pf-muted)]/15 p-3 ${
                onRowClick ? "cursor-pointer" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{titleColumn?.render(row)}</span>
                {statusColumn && <span>{statusColumn.render(row)}</span>}
              </div>
              {urgencyColumn && (
                <p className="mt-1 text-sm text-[var(--pf-muted)]">{urgencyColumn.render(row)}</p>
              )}
              {restColumns.length > 0 && (
                <details className="mt-2 text-sm text-[var(--pf-muted)]">
                  <summary className="cursor-pointer select-none">Details</summary>
                  <dl className="mt-2 space-y-1">
                    {restColumns.map((c) => (
                      <div key={c.key} className="flex justify-between gap-3">
                        <dt>{c.header}</dt>
                        <dd className="text-right text-[var(--pf-ink)]">{c.render(row)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div data-tour={dataTour} className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--pf-muted)]/20 text-left text-[var(--pf-muted)]">
            {columns.map((c) => (
              <th key={c.key} className="py-2 pr-4 font-medium">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                data-tour={dataTour ? `${dataTour}-row-${key}` : undefined}
                {...rowAttrs(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-[var(--pf-muted)]/10 ${
                  onRowClick ? "cursor-pointer hover:bg-[var(--pf-muted)]/5" : ""
                }`}
              >
                {columns.map((c) => (
                  <td key={c.key} className="py-2 pr-4">
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
