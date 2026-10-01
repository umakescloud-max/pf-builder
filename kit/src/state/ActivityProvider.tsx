import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export interface AuditEntry {
  id: string;
  timestamp: Date;
  text: string;
}

interface ActivityContextValue {
  auditLog: AuditEntry[];
  toasts: AuditEntry[];
  logAction: (text: string) => void;
  dismissToast: (id: string) => void;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

/**
 * Every kit action goes through logAction(): it both appends to the audit
 * log and shows a toast in the same words, satisfying "every action fires
 * a toast in the button's own words and writes to the audit log" without
 * every screen having to wire up both separately.
 */
export function ActivityProvider({ children }: { children: ReactNode }) {
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [toasts, setToasts] = useState<AuditEntry[]>([]);

  const logAction = useCallback((text: string) => {
    const entry: AuditEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
      text,
    };
    setAuditLog((log) => [entry, ...log]);
    setToasts((t) => [...t, entry]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== entry.id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return (
    <ActivityContext.Provider value={{ auditLog, toasts, logAction, dismissToast }}>
      {children}
    </ActivityContext.Provider>
  );
}

export function useActivity(): ActivityContextValue {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error("useActivity must be used within an ActivityProvider");
  return ctx;
}
