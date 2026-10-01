export interface InboxItem {
  id: string;
  from: string;
  preview: string;
  unread: boolean;
  timestamp: string;
}

export interface InboxListProps {
  items: InboxItem[];
  onSelect?: (item: InboxItem) => void;
}

export function InboxList({ items, onSelect }: InboxListProps) {
  return (
    <ul className="divide-y divide-[var(--pf-muted)]/10">
      {items.map((item) => (
        <li
          key={item.id}
          onClick={() => onSelect?.(item)}
          className={`py-3 ${onSelect ? "cursor-pointer" : ""} ${item.unread ? "font-medium" : ""}`}
        >
          <div className="flex items-center justify-between text-sm">
            <span>{item.from}</span>
            <span className="text-xs text-[var(--pf-muted)]">{item.timestamp}</span>
          </div>
          <p className="mt-1 truncate text-sm text-[var(--pf-muted)]">{item.preview}</p>
        </li>
      ))}
    </ul>
  );
}
