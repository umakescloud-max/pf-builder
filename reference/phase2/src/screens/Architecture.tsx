import {
  AppShell,
  ArchitectureView,
  type ArchNode,
  type ArchEdge,
  IntegrationTiles,
} from "@kit";
import { NAV } from "../nav";

export function Architecture() {
  const nodes: ArchNode[] = [
    {
      id: "epic",
      label: "Epic (EHR)",
      kind: "system",
    },
    {
      id: "availity",
      label: "Availity",
      kind: "system",
    },
    {
      id: "payer-portals",
      label: "Payer portals",
      kind: "system",
    },
    {
      id: "tracker-ui",
      label: "Prior auth tracker (this prototype)",
      kind: "app",
    },
    {
      id: "claude",
      label: "Claude (document review)",
      kind: "model",
    },
    {
      id: "staff",
      label: "Dana (coordinator)",
      kind: "human",
    },
  ];

  const edges: ArchEdge[] = [
    {
      from: "epic",
      to: "tracker-ui",
      label: "Patient and case data",
    },
    {
      from: "availity",
      to: "tracker-ui",
      label: "Submission status",
    },
    {
      from: "payer-portals",
      to: "tracker-ui",
      label: "Decision and denial reason",
    },
    {
      from: "tracker-ui",
      to: "claude",
      label: "Flags missing documentation",
    },
    {
      from: "tracker-ui",
      to: "staff",
      label: "Surfaces flagged cases for review",
    },
    {
      from: "staff",
      to: "payer-portals",
      label: "Submits appeal, human-approved",
    },
  ];

  const integrations = [
    {
      name: "Epic",
      role: "EHR",
      description: "Patient records and clinical history",
    },
    {
      name: "Availity",
      role: "Submission portal",
      description: "Initial submission to payers",
    },
    {
      name: "Payer portals",
      role: "Decision tracking",
      description: "Decisions, denials, and appeal deadlines",
    },
    {
      name: "Claude",
      role: "Document review",
      description: "Flags missing documentation patterns",
    },
  ];

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
        <h1 className="text-3xl font-serif font-bold text-ink mb-8">How this would work</h1>

        <div className="mb-12">
          <h2 className="text-xl font-semibold text-ink mb-6">System architecture</h2>
          <ArchitectureView nodes={nodes} edges={edges} complianceNotes={[
            "Patient data stored encrypted at rest and in transit",
            "All payer-facing submissions require explicit staff approval before sending",
            "Access role-restricted to authorized billing staff, with full audit logging",
            "AI-assisted document review operates under signed BAA; no PHI sent to model without one",
            "Only minimum necessary case data shared with each integrated system",
          ]} />
        </div>

        <div className="mb-12">
          <h2 className="text-xl font-semibold text-ink mb-6">Real-world integrations</h2>
          <IntegrationTiles tools={["Epic", "Availity", "Payer portals", "Claude"]} />
        </div>

        <div className="bg-surface p-8 rounded-lg border border-muted">
          <h2 className="text-xl font-semibold text-ink mb-4">Compliance & security</h2>
          <ul className="space-y-3 text-sm text-ink">
            <li className="flex gap-3">
              <span className="font-semibold text-primary">•</span>
              <span>Patient data stored encrypted at rest and in transit</span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-primary">•</span>
              <span>All payer-facing submissions require explicit staff approval before sending</span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-primary">•</span>
              <span>Access role-restricted to authorized billing staff, with full audit logging</span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-primary">•</span>
              <span>AI-assisted document review operates under signed BAA; no PHI sent to model without one</span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-primary">•</span>
              <span>Only minimum necessary case data shared with each integrated system</span>
            </li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
