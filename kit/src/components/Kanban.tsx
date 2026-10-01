export interface KanbanCard {
  id: string;
  title: string;
  subtitle?: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
}

export interface KanbanProps {
  columns: KanbanColumn[];
}

export function Kanban({ columns }: KanbanProps) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((col) => (
        <div key={col.id} className="rounded-xl bg-[var(--pf-muted)]/5 p-3">
          <h3 className="text-sm font-medium text-[var(--pf-muted)]">{col.title}</h3>
          <div className="mt-2 space-y-2">
            {col.cards.map((card) => (
              <div
                key={card.id}
                className="rounded-lg border border-[var(--pf-muted)]/20 bg-[var(--pf-surface)] p-3 text-sm"
              >
                <p>{card.title}</p>
                {card.subtitle && <p className="mt-1 text-xs text-[var(--pf-muted)]">{card.subtitle}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
