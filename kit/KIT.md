# Kit (`pf-builder/kit`)

The kit is the fixed vocabulary every brief and every builder is confined
to. It exists so a free, unsupervised model can produce something that
looks hand-crafted instead of templated, without ever inventing its own
components, fonts, or colors.

## Stack

Vite + React + TypeScript + Tailwind CSS. Static output only (no server).
Hash router (`react-router-dom` with `HashRouter`, so GitHub Pages needs no
rewrite rules). `driver.js` for the guided tour. `recharts` for charts.
Fonts via `@fontsource` packages, bundled at build time — **no external
font or CDN requests at runtime**, since the demo must work standalone and
never leak a referrer to a third party.

All dependency versions are pinned in `kit/package.json`. The builder may
never add, remove, or upgrade a dependency — gated by `check:static`
(§5.10 in `HANDOFF.md`), which diffs `package.json` / `package-lock.json`
against the starter.

## Components

This is the **complete** list of component names a brief's `screens[].components`
may reference. The architect must never invent a name outside this list;
the builder must never import anything else to build a screen.

| Component | Purpose |
|---|---|
| `AppShell` | Page chrome: nav, persona identity, footer |
| `OneClickLogin` | Single-button "log in as {persona}" gate before the demo starts |
| `TourRunner` | Wraps `driver.js`; auto-starts on first visit, exposes a replay button |
| `ConceptBadge` | Always-visible "Concept prototype. Synthetic data." pill |
| `StoryPanel` | The narrative landing screen: persona, before/after, cost of pain |
| `ScenarioBanner` | Inline callout marking the edge case on the screen where it appears |
| `DataTable` | Sortable/filterable tabular list (cases, patients, claims, etc.) |
| `RecordDrawer` | Slide-over detail view for a single row from `DataTable` |
| `StatusPill` | Small colored label for a record's state (e.g. "Denied", "Pending") |
| `MetricPanel` | Row of computed metrics (uses `StatTile`) |
| `StatTile` | Single number + label + optional trend |
| `ChartLine` | Line chart (recharts) |
| `ChartBar` | Bar chart (recharts) |
| `Timeline` | Vertical event history for a record |
| `Kanban` | Column-based board (e.g. intake stages, appeal stages) |
| `InboxList` | Message/conversation list with unread state |
| `FormWizard` | Multi-step form (e.g. intake form) |
| `DocumentViewer` | Read-only rendering of a document-like record (e.g. extracted form) |
| `NoteEditor` | Rich-ish text editing area (e.g. clinical note with AI draft) |
| `ApprovalQueue` | List of items awaiting a human decision, with approve/reject actions |
| `AuditLog` | Append-only list of actions taken, newest first |
| `ActivityToast` | Transient confirmation after any user action |
| `IntegrationTiles` | Text-only tiles naming connected tools (no logos, ever) |
| `CallPlayer` | Simulated voice call: browser `speechSynthesis` + live transcript |
| `CalendarDay` | Single-day schedule view |
| `ArchitectureView` | Node/edge diagram of the system (always the last screen) |
| `EmptyState` | Placeholder for an empty list/section |

## Required behaviors (every demo, no exceptions)

- **One-click login** as the brief's persona — no real auth, no password.
- **Tour auto-runs** on every fresh visit (tracked via `localStorage`,
  per-browser) with a visible **replay** control at all times.
- **`ConceptBadge`** is visible on every screen, not just the landing page.
- **Every action produces a visible effect**: a toast in the clicked
  button's own words (e.g. "Appeal submitted to Aetna" — not "Success"),
  and a row appended to the audit log. A button that does nothing when
  clicked is a gate failure (`dead_buttons_max = 0`).
- **Footer** reads "Built by Umakes.cloud", linking `brand_url` and
  `brand_email` from config (hardcoded at build time per starter, since
  there's no runtime config fetch).

## Seed utilities (`kit/src/seed/`)

- `rng(slug: string)` — deterministic PRNG seeded from the demo's slug, so
  the same demo always generates the same "random" data. Never use
  `Math.random()` directly in seed code.
- `rel(daysOffset: number, time?: "HH:MM")` — returns a date relative to
  the actual build/view time, so "today" in the demo is always today, not
  a stale hardcoded date. Builders must use this for every date in seed
  data; `check:static` greps for literal ISO date strings in seed files
  and fails the build if found.
- Name generator — diverse, plausible fictional names (not a repeating
  pool of 5).
- Phone generator — `555-01xx` range only (reserved, non-dialable).
- MRN generator — `DEMO-######` format, clearly synthetic.
- Catalogs, bundled as static data modules:
  - ICD-10-CM codes with plain-language labels.
  - CPT codes with the kit's **own** plain-language labels — never AMA's
    copyrighted descriptor text.
  - Fictional payer names (never real insurers).
  - Plain-language denial reasons.
  - Fictional provider names and locations (city/region only, never a
    specific real address).
- Explicitly forbidden in any seed data: SSN-shaped strings
  (`\d{3}-\d{2}-\d{4}`), any real PHI-shaped pattern, real company/brand
  names, real addresses.

## Fonts

Bundled via `@fontsource`, selectable by the architect's `design.typefaces`:
IBM Plex Sans, Public Sans, Atkinson Hyperlegible, Figtree, Instrument Sans,
Manrope, Work Sans, Source Serif 4, Newsreader, Spectral, Fraunces.

A brief may only name a typeface from this list for `heading` and `body`.
`check:static` validates this.

## Anti-template rules

These exist because free models default to generic SaaS-template tells.
`check:static` and the reviewer both check for violations:

- Sentence case everywhere — no Title Case Headings, no ALL-CAPS eyebrow
  labels.
- No "A · B · C" metadata strings (e.g. "3 days ago · John Doe · Draft").
- No arrow glyphs (→) on buttons.
- No gradient background washes.
- Border radius follows a hierarchy (cards > buttons > pills), not one
  flat radius value everywhere.
- No stock-photo-style imagery, no logos (even for named tools — those go
  in `IntegrationTiles` as plain text).

## What the builder may touch

Per `HANDOFF.md` §5.9: only screens, routes, `seed.ts`, and `tour.json`
inside `prototypes/<repo-name>/`. Never the kit itself, never `theme`
tokens, never the brief, never dependency manifests, never add network
calls or remote image references. Enforced by `check:static` diffing
against the starter's file list and import graph.

## Archetype starters (`pf-builder/archetypes/*`)

Each starter is a pre-wired skeleton (routes stubbed, kit imported, no
content) for one archetype, so the builder's job is "fill in," never
"invent structure."

| Archetype | Starter screens | Typical edge case |
|---|---|---|
| `intake-forms` | Story, Intake queue, Form wizard, Extracted document, Review & approve, Architecture | Missing insurance card |
| `scheduling-receptionist` | Story, Live call, Today's schedule, Call log, Escalations, Architecture | Spanish-speaking caller, urgent symptom |
| `prior-auth-rcm` | Story, Auth tracker, Case detail, Denials, Appeals queue, Architecture | Denied for missing documentation |
| `clinical-documentation` | Story, Encounters, Note editor with AI draft, Sign-off queue, Architecture | Conflicting medication history |
| `patient-comms` | Story, Campaigns, Conversation inbox, Escalations, Architecture | Patient replies with a clinical question |
| `reporting-dashboard` | Story, Overview, Drill-down, Alerts, Architecture | One location's data missing |

Phase 1 builds only `prior-auth-rcm` by hand (as the proof that the kit and
gates work); Phase 7 builds the remaining five, each proven through the
real pipeline with a synthetic post.
