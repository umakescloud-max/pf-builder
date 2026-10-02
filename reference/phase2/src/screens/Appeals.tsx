import { useEffect, useState } from "react";
import {
  AppShell,
  ApprovalQueue,
  type ApprovalItem,
  DocumentViewer,
  AuditLog,
  useActivity,
} from "@kit";
import { NAV } from "../nav";
import { getDeniedCases, type Case, cases as allCases } from "../seed";

export function Appeals() {
  const { logAction } = useActivity();
  const [appealCases, setAppealCases] = useState<Case[]>([]);
  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(null);

  useEffect(() => {
    // Get all denied cases for appeal queue
    const denied = getDeniedCases();
    setAppealCases(denied);
  }, []);

  const approvalItems: ApprovalItem[] = appealCases.map((c) => ({
    id: `${c.case_id}`,
    title: `Case #${c.case_id} - ${c.patient_name}`,
    description: `${c.procedure_label} | ${c.payer} | Denial: ${c.denial_reason}`,
    timestamp: c.decision_date || new Date(),
    status: c.appeal_status === "won" ? "approved" : c.appeal_status === "lost" ? "rejected" : "pending",
    edgeCase: c.case_id === 4471,
  }));

  const handleApprove = (item: ApprovalItem) => {
    logAction("Submits the appeal to the payer and logs the submission with timestamp");
  };

  const handleReject = (item: ApprovalItem) => {
    logAction("Sends the case back to the tracker flagged as needing more documentation");
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
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-serif font-bold text-ink mb-8">Appeals queue</h1>

        <div className="grid grid-cols-3 gap-8">
          <div className="col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-muted overflow-hidden">
              <ApprovalQueue
                items={approvalItems}
                onPrimary={handleApprove}
                onSecondary={handleReject}
                primaryLabel="Submit appeal"
                secondaryLabel="Return for more info"
                dataTour="approval-queue"
              />
            </div>
          </div>

          {/* Sidebar */}
          <div className="col-span-1">
            <div className="sticky top-8 space-y-6">
              <DocumentViewer
                title="Appeal Documents"
                lines={[
                  "Original submission",
                  "Denial notice",
                  "Additional documentation",
                  "Appeal summary",
                ]}
              />

              <AuditLog />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
