import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ConceptBadge } from "./ConceptBadge";
import { ActivityToastHost } from "./ActivityToast";

export interface NavItem {
  label: string;
  to: string;
}

export interface AppShellProps {
  brandName: string;
  brandUrl: string;
  brandEmail: string;
  personaName: string;
  personaRole: string;
  nav: NavItem[];
  children: ReactNode;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AppShell({
  brandName,
  brandUrl,
  brandEmail,
  personaName,
  personaRole,
  nav,
  children,
}: AppShellProps) {
  const location = useLocation();
  return (
    <div
      className="min-h-screen bg-[var(--pf-surface)] text-[var(--pf-ink)]"
      style={{ fontFamily: "var(--pf-font-body)" }}
    >
      <header className="border-b border-[var(--pf-muted)]/20">
        <div className="flex items-center justify-between gap-3 px-6 py-3">
          <ConceptBadge />
          <span
            className="hidden text-sm text-[var(--pf-muted)] sm:inline"
            title={`${personaName}, ${personaRole}`}
          >
            {personaName}, {personaRole}
          </span>
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--pf-muted)]/15 text-xs font-medium text-[var(--pf-muted)] sm:hidden"
            title={`${personaName}, ${personaRole}`}
          >
            {initials(personaName)}
          </span>
        </div>
        <nav
          className="flex items-center gap-4 overflow-x-auto whitespace-nowrap px-6 pb-3"
          data-tour="app-nav"
        >
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`text-sm ${
                location.pathname === item.to
                  ? "font-medium text-[var(--pf-primary)]"
                  : "text-[var(--pf-muted)]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      {/* Bottom padding reserves room for the fixed "Replay tour" button
       * (TourRunner) so page content is never covered by it. */}
      <main className="px-6 pb-24 pt-8">{children}</main>
      <footer className="border-t border-[var(--pf-muted)]/20 px-6 py-4 text-sm text-[var(--pf-muted)]">
        Built by <a href={brandUrl} className="underline">{brandName}</a>
        {" "}
        <a href={`mailto:${brandEmail}`} className="underline">{brandEmail}</a>
      </footer>
      <ActivityToastHost />
    </div>
  );
}
