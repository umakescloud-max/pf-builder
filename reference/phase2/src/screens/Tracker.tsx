import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppShell,
  DataTable,
  type DataTableColumn,
  MetricPanel,
  StatusPill,
  RecordDrawer,
  useActivity,
} from "@kit";
import { NAV } from "../nav";
import { cases, type Case, getMetrics } from "../seed";

export function Tracker() {
  const navigate = useNavigate();
  const { logAction } = useActivity();
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [filteredCases, setFilteredCases] = useState<Case[]>([]);
  const [selectedPayer, setSelectedPayer] = useState<string>("");

  const metrics = getMetrics();

  useEffect(() => {
    const allCases = cases.filter(
      (c) => c.status === "submitted" || c.status === "pending" || c.status === "approved" || c.status === "denied"
    );

    if (selectedPayer) {
      setFilteredCases(allCases.filter((c) => c.payer === selectedPayer));
    } else {
      setFilteredCases(allCases);
    }
  }, [selectedPayer]);

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
      key: "status",
      header: "Status",
      render: (c) => (
        <StatusPill
          label={c.status.charAt(0).toUpperCase() + c.status.slice(1)}
          tone={
            c.status === "approved"
              ? "primary"
              : c.status === "denied"
                ? "accent"
                : "muted"
          }
        />
      ),
    },
    {
      key: "submitted_date",
      header: "Submitted",
      render: (c) => c.submitted_date.toLocaleDateString(),
    },
  ];

  const handleRowClick = (c: Case) => {
    logAction("Opens case #4471 on the Case screen");
    navigate(`/case?case=${c.case_id}`);
  };

  const uniquePayers = Array.from(new Set(cases.map((c) => c.payer))).sort();

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
        <h1 className="text-3xl font-serif font-bold text-ink mb-8">Auth tracker</h1>

        {/* Metrics */}
        <div className="mb-8">
          <MetricPanel
            metrics={[
              {
                label: "Open auth requests",
                value: metrics.openAuthRequests.toString(),
              },
              {
                label: "Average days to decision",
                value: metrics.averageDaysToDecision.toString(),
              },
              {
                label: "Denial rate",
                value: `${metrics.denialRate.toFixed(1)}%`,
              },
              {
                label: "Appeals won",
                value: metrics.appealsWon.toString(),
              },
            ]}
            dataTour="metric-panel"
          />
        </div>

        {/* Filter */}
        <div className="mb-6 flex gap-4 items-center">
          <label className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">Filter by payer:</span>
            <select
              value={selectedPayer}
              onChange={(e) => {
                setSelectedPayer(e.target.value);
                logAction("Narrows the list to the selected payer");
              }}
              className="px-3 py-2 border border-muted rounded bg-surface text-ink"
            >
              <option value="">All payers</option>
              {uniquePayers.map((payer) => (
                <option key={payer} value={payer}>
                  {payer}
                </option>
              ))}
            </select>
          </label>
        </div>

         {/* Cases Table */}
         <div className="bg-white rounded-lg shadow-sm border border-muted overflow-hidden">
           <DataTable
             columns={columns}
             rows={filteredCases}
             rowKey={(c) => c.case_id.toString()}
             onRowClick={handleRowClick}
             dataTour="tracker-table"
           />
         </div>
      </div>

      {selectedCase && (
        <RecordDrawer
          open={!!selectedCase}
          onClose={() => setSelectedCase(null)}
          title={`Case #${selectedCase.case_id}`}
        >
          <p className="text-sm">{selectedCase.patient_name} - {selectedCase.procedure_label}</p>
        </RecordDrawer>
      )}
    </AppShell>
  );
}
