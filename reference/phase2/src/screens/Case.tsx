import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AppShell,
  Timeline,
  type TimelineEntry,
  DocumentViewer,
  StatusPill,
  AuditLog,
  NoteEditor,
  useActivity,
} from "@kit";
import { NAV } from "../nav";
import { getCase, getCaseNotes, type Case, caseNotes, cases as allCases } from "../seed";
import { formatDateTime } from "@kit";

export function Case() {
  const [searchParams] = useSearchParams();
  const { logAction } = useActivity();
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [newNote, setNewNote] = useState("");

  const caseId = parseInt(searchParams.get("case") || "4471", 10);

  useEffect(() => {
    const c = getCase(caseId);
    setCaseData(c || null);
  }, [caseId]);

  if (!caseData) {
    return (
      <AppShell
        brandName="Riverside Orthopedic Associates"
        brandUrl="/"
        brandEmail="info@riversideortho.com"
        personaName="Dana Whitfield"
        personaRole="Prior authorization coordinator"
        nav={NAV}
      >
        <div className="max-w-4xl mx-auto px-6 py-8">
          <p className="text-muted">Case not found.</p>
        </div>
      </AppShell>
    );
  }

  const notes = getCaseNotes(caseId);

  const timelineEntries: TimelineEntry[] = [
    {
      id: `submitted-${caseData.case_id}`,
      timestamp: formatDateTime(caseData.submitted_date),
      author: "System",
      text: `${caseData.procedure_label} for patient ${caseData.patient_name}, submitted to ${caseData.payer}`,
    },
    ...notes.map((note) => ({
      id: note.id,
      timestamp: formatDateTime(note.timestamp),
      author: note.author,
      text: note.note_text,
    })),
    ...(caseData.decision_date
      ? [
          {
            id: `decision-${caseData.case_id}`,
            timestamp: formatDateTime(caseData.decision_date),
            author: "System",
            text: caseData.status === "denied" ? `Denied: ${caseData.denial_reason}` : "Approved",
          },
        ]
      : []),
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const handleAddNote = () => {
    if (newNote.trim() || true) {
      const noteText = newNote.trim() || "Case reviewed.";
      const timestamp = new Date();

      // Add note to caseNotes array
      caseNotes.push({
        id: `note-${Date.now()}`,
        case_id: caseData.case_id,
        author: "Dana Whitfield",
        timestamp,
        note_text: noteText,
      });

      setNewNote("");
      logAction("Appends a timestamped note to the case timeline");

      // Trigger re-render
      setCaseData({ ...caseData });
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
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-3 gap-8">
          {/* Main content */}
          <div className="col-span-2">
            <div className="mb-8">
              <h1 className="text-3xl font-serif font-bold text-ink mb-4">
                Case #{caseData.case_id}
              </h1>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-semibold">Patient:</span> {caseData.patient_name}
                </p>
                <p>
                  <span className="font-semibold">Payer:</span> {caseData.payer}
                </p>
                <p>
                  <span className="font-semibold">Procedure:</span>{" "}
                  {caseData.procedure_label} ({caseData.procedure_cpt})
                </p>
                <p>
                  <span className="font-semibold">Diagnosis:</span>{" "}
                  {caseData.icd10_label} ({caseData.icd10_code})
                </p>
                <p>
                  <span className="font-semibold">Status:</span>{" "}
                   <StatusPill
                     label={caseData.status.charAt(0).toUpperCase() + caseData.status.slice(1)}
                     tone={
                       caseData.status === "approved"
                         ? "primary"
                         : caseData.status === "denied"
                           ? "accent"
                           : "muted"
                     }
                   />
                </p>
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-xl font-serif font-bold text-ink mb-4">Timeline</h2>
              <Timeline entries={timelineEntries} dataTour="case-timeline" />
            </div>

            {/* Note Editor */}
            <div className="mb-8 bg-surface p-6 rounded-lg border border-muted">
              <h2 className="text-lg font-semibold text-ink mb-4">Add a note</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Enter case note..."
                  className="flex-1 px-3 py-2 border border-muted rounded bg-white text-ink"
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      handleAddNote();
                    }
                  }}
                />
                <button
                  onClick={handleAddNote}
                  className="px-4 py-2 bg-primary text-white rounded font-semibold hover:bg-opacity-90"
                >
                  Add note
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="col-span-1">
            <div className="sticky top-8 space-y-6">
              <DocumentViewer
                title="Documents"
                lines={[
                  "Referral form",
                  ...(caseData.denial_reason ? ["Denial notice"] : []),
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
