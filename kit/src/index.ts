// Barrel export — the only names a brief may reference (KIT.md) and the
// only names an archetype starter may import.

export { AppShell, type AppShellProps, type NavItem } from "./components/AppShell";
export { OneClickLogin, type OneClickLoginProps } from "./components/OneClickLogin";
export { TourRunner, type TourRunnerProps, type TourStep } from "./components/TourRunner";
export { ConceptBadge } from "./components/ConceptBadge";
export { StoryPanel, type StoryPanelProps } from "./components/StoryPanel";
export { ScenarioBanner, type ScenarioBannerProps } from "./components/ScenarioBanner";
export { DataTable, type DataTableProps, type DataTableColumn } from "./components/DataTable";
export { RecordDrawer, type RecordDrawerProps } from "./components/RecordDrawer";
export { StatusPill, type StatusPillProps, type StatusTone } from "./components/StatusPill";
export { MetricPanel, type MetricPanelProps } from "./components/MetricPanel";
export { StatTile, type StatTileProps } from "./components/StatTile";
export { ChartLine, type ChartLineProps } from "./components/ChartLine";
export { ChartBar, type ChartBarProps } from "./components/ChartBar";
export { Timeline, type TimelineProps, type TimelineEntry } from "./components/Timeline";
export { Kanban, type KanbanProps, type KanbanColumn, type KanbanCard } from "./components/Kanban";
export { InboxList, type InboxListProps, type InboxItem } from "./components/InboxList";
export { FormWizard, type FormWizardProps, type FormWizardStep } from "./components/FormWizard";
export { DocumentViewer, type DocumentViewerProps } from "./components/DocumentViewer";
export { NoteEditor, type NoteEditorProps } from "./components/NoteEditor";
export { ApprovalQueue, type ApprovalQueueProps, type ApprovalItem } from "./components/ApprovalQueue";
export { AuditLog } from "./components/AuditLog";
export { ActivityToastHost } from "./components/ActivityToast";
export { IntegrationTiles, type IntegrationTilesProps } from "./components/IntegrationTiles";
export { CallPlayer, type CallPlayerProps, type CallTurn } from "./components/CallPlayer";
export { CalendarDay, type CalendarEvent } from "./components/CalendarDay";
export { ArchitectureView, type ArchitectureViewProps, type ArchNode, type ArchEdge } from "./components/ArchitectureView";
export { EmptyState } from "./components/EmptyState";

export { ActivityProvider, useActivity, type AuditEntry } from "./state/ActivityProvider";

export { rng, randomInt, pickOne, pickWeighted, shuffle, type Rand } from "./seed/rng";
export { rel, addBusinessDays, businessDaysBetween, formatDate, formatDateTime } from "./seed/dates";
export { fakeName, fakeInitialName, fakePhone, fakeMrn, createNameGenerator } from "./seed/names";
export { ICD10_CODES, type Icd10Entry } from "./seed/catalogs/icd10";
export { CPT_CODES, type CptEntry } from "./seed/catalogs/cpt";
export { FICTIONAL_PAYERS, type FictionalPayer } from "./seed/catalogs/payers";
export { DENIAL_REASONS, type DenialReason } from "./seed/catalogs/denialReasons";

export { cssVariablesFor, BUNDLED_FONTS, FONT_STACKS, type Palette, type Typefaces } from "./theme/tokens";
export { contrastRatio, hexToRgb, relativeLuminance, WCAG_AA_NORMAL_TEXT } from "./theme/contrast";
export { FONTSOURCE_PACKAGE } from "./fonts";
