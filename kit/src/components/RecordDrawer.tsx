import type { ReactNode } from "react";

export interface RecordDrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function RecordDrawer({ open, title, onClose, children }: RecordDrawerProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-[var(--pf-surface)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg" style={{ fontFamily: "var(--pf-font-heading)" }}>
            {title}
          </h2>
          <button type="button" onClick={onClose} className="text-sm text-[var(--pf-muted)]">
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
