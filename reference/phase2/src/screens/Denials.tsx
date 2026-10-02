import { useEffect, useState } from "react";
import {
  AppShell,
  DataTable,
  type DataTableColumn,
  StatusPill,
  RecordDrawer,
  ScenarioBanner,
  useActivity,
} from "@kit";
import { NAV } from "../nav";
import { getDeniedCases, type Case, businessDaysBetween } from "../seed";
import { formatDateTime } from "@kit";

export function Denials() {
  const { logAction } = useActivity();
  const [deniedCases, setDeniedCases] = useState<Case[]>([]);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});

  useEffect(() => {
    // Get denied cases and sort them
    const denied = getDeniedCases();
    
    // Sort: edge case first, then by appeal deadline
    denied.sort((a, b) => {
      if (a.case_id === edgeCaseId) return -1;
      if (b.case_id === edgeCaseId) return 1;
      if (a.appeal_deadline && b.appeal_deadline) {
        return a.appeal_deadline.getTime() - b.appeal_deadline.getTime();
      }
      return 0;
    });
    
    setDeniedCases(denied);

    // Update countdowns every second
    const interval = setInterval(() => {
      const now = new Date();
      const newCountdowns: Record<string, number> = {};

      denied.forEach((c) => {
        if (c.appeal_deadline) {
          const businessDays = businessDaysBetween(now, c.appeal_deadline);
          newCountdowns[c.id] = Math.max(0, businessDays);
        }
      });

      setCountdowns(newCountdowns);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const edgeCaseId = 4471;

  const columns: DataTableColumn<Case>[] = [
    {
      key: "case_id",
      header: "Case ID",
      render: (c) => `#${c.case_id}`,
    },
    {
      key: "patient_name",
      header: "Patient",
      render: (c) => c.patient_name,
    },
    {
      key: "payer",
      header: "Payer",
      render: (c) => c.payer,
    },
    {
      key: "procedure_label",
      header: "Procedure",
      render: (c) => c.procedure_label,
    },
    {
      key: "denial_reason",
      header: "Denial Reason",
      render: (c) => <span className="italic">{c.denial_reason}</span>,
    },
    {
      key: "appeal_deadline",
      header: "Days to Appeal Deadline",
      render: (c) => {
        const days = countdowns[c.id] ?? 0;
        return (
          <span
            className={`font-semibold ${days <= 2 ? "text-accent" : days <= 5 ? "text-warning" : "text-success"}`}
          >
            {days} days
          </span>
        );
      },
    },
  ];

  const handleRowClick = (c: Case) => {
    setSelectedCase(c);
    setIsDrawerOpen(true);
  };

  const handleAttachDocument = () => {
    if (selectedCase) {
      logAction("Attaches the identified document and marks the case ready for appeal");
    }
  };

  const handleMoveToAppeals = () => {
    if (selectedCase) {
      logAction("Moves the case into the appeals queue");
      setIsDrawerOpen(false);
      setSelectedCase(null);
    }
  };

  return (
    <AppShell
      brandName="Riverside Orthopedic Associates"
      brandUrl="/"
      brandEmail="info@riversideortho.com"
      personaName="Dana Whitfield"
      personaRole="Prior authorization coordinator"
      nav={NAV}
    >
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-serif font-bold text-ink mb-8">Denials</h1>

        {/* Scenario banner */}
        <div className="mb-8">
          <ScenarioBanner
            title="Case #4471: Missing clinical documentation"
            body="The referring physician's progress note wasn't attached to the original submission. The patient's lumbar MRI is clinically appropriate but can't proceed without this document. Appeal window: 2 business days remaining."
          />
        </div>

        {/* Countdown display */}
        <div className="mb-8 p-6 bg-accent bg-opacity-10 border-2 border-accent rounded-lg">
          <div className="flex items-baseline gap-4" data-tour="appeal-countdown">
            <div className="text-sm font-semibold text-muted">APPEAL DEADLINE</div>
            <div className="text-4xl font-serif font-bold text-accent">
              {countdowns[`case-4471`] ?? 0}
            </div>
            <div className="text-sm text-muted">business days remaining</div>
          </div>
        </div>

        {/* Denials Table */}
        <div className="bg-white rounded-lg shadow-sm border border-muted overflow-hidden">
          <DataTable
            columns={columns}
            rows={deniedCases}
            rowKey={(c) => c.case_id.toString()}
            onRowClick={handleRowClick}
            edgeCaseRow={(c) => c.case_id === edgeCaseId}
            dataTour="denial"
          />
        </div>
      </div>

      {/* Record Drawer */}
      {selectedCase && (
        <RecordDrawer
          open={isDrawerOpen}
          onClose={() => {
            setIsDrawerOpen(false);
            setSelectedCase(null);
          }}
          title={`Case #${selectedCase.case_id}`}
        >
          <div className="space-y-4">
            <p className="text-sm">{selectedCase.patient_name} - {selectedCase.procedure_label}</p>
            <div className="space-y-2">
              <button
                onClick={handleAttachDocument}
                className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-surface"
              >
                Attach missing document
              </button>
              <button
                onClick={handleMoveToAppeals}
                className="w-full rounded-lg border border-muted px-3 py-2 text-sm"
              >
                Move to appeals
              </button>
            </div>
          </div>
        </RecordDrawer>
      )}
    </AppShell>
  );
}
