export interface ArchNode {
  id: string;
  label: string;
  kind: string;
}

export interface ArchEdge {
  from: string;
  to: string;
  label: string;
}

export interface ArchitectureViewProps {
  nodes: ArchNode[];
  edges: ArchEdge[];
  complianceNotes: string[];
}

// Columns run left to right in this fixed order; any kind not present in
// the brief's nodes is simply skipped, never leaving a blank column.
const KIND_ORDER = ["system", "app", "model", "human"];

const COLUMN_WIDTH = 310;
const NODE_WIDTH = 190;
const NODE_HEIGHT = 60;
const ROW_HEIGHT = 110;
const PADDING_X = 30;
const PADDING_Y = 30;
const BACKWARD_EDGE_MARGIN = 50;

function wrapLabel(text: string, maxChars = 22): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function ArchitectureView({ nodes, edges, complianceNotes }: ArchitectureViewProps) {
  const presentKinds = KIND_ORDER.filter((kind) => nodes.some((n) => n.kind === kind));
  const columns = presentKinds.map((kind) => nodes.filter((n) => n.kind === kind));
  const maxRows = Math.max(1, ...columns.map((c) => c.length));

  const positions: Record<string, { x: number; y: number }> = {};
  columns.forEach((col, colIndex) => {
    const totalHeight = maxRows * ROW_HEIGHT;
    const colHeight = col.length * ROW_HEIGHT;
    const offsetY = PADDING_Y + (totalHeight - colHeight) / 2;
    col.forEach((node, rowIndex) => {
      positions[node.id] = {
        x: PADDING_X + colIndex * COLUMN_WIDTH,
        y: offsetY + rowIndex * ROW_HEIGHT,
      };
    });
  });

  const hasBackwardEdge = edges.some((e) => {
    const from = positions[e.from];
    const to = positions[e.to];
    return from && to && to.x < from.x;
  });

  const width = PADDING_X * 2 + Math.max(0, presentKinds.length - 1) * COLUMN_WIDTH + NODE_WIDTH;
  const height = PADDING_Y * 2 + maxRows * ROW_HEIGHT + (hasBackwardEdge ? BACKWARD_EDGE_MARGIN : 0);

  return (
    <div data-tour="architecture-diagram" className="space-y-8">
      <div className="overflow-x-auto rounded-xl border border-[var(--pf-muted)]/20 p-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Diagram of the systems, this prototype, the AI step, and the staff member who approves every payer-facing action."
          style={{ width: "100%", minWidth: `${Math.min(width, 560)}px` }}
        >
          <defs>
            <marker id="pf-arch-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--pf-muted)" />
            </marker>
          </defs>

          {edges.map((e, i) => {
            const from = positions[e.from];
            const to = positions[e.to];
            if (!from || !to) return null;
            const x1 = from.x + NODE_WIDTH;
            const y1 = from.y + NODE_HEIGHT / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_HEIGHT / 2;
            const isBackward = x2 < x1;
            const path = isBackward
              ? `M ${x1} ${y1} C ${x1} ${height - 12}, ${x2} ${height - 12}, ${x2} ${y2}`
              : `M ${x1} ${y1} L ${x2} ${y2}`;
            const labelX = (x1 + x2) / 2;
            const labelCenterY = isBackward ? height - 22 : (y1 + y2) / 2 - 6;
            // Wrapped at a narrower width than node labels: an edge label
            // sits in the gap *between* two node boxes, not inside one.
            const edgeLines = wrapLabel(e.label, 16);
            const lineHeight = 12;
            const labelStartY = labelCenterY - ((edgeLines.length - 1) * lineHeight) / 2;
            return (
              <g key={`${e.from}-${e.to}-${i}`}>
                <path d={path} fill="none" stroke="var(--pf-muted)" strokeWidth={1.5} markerEnd="url(#pf-arch-arrow)" />
                {edgeLines.map((line, li) => {
                  const y = labelStartY + li * lineHeight;
                  const lineWidth = line.length * 5.6 + 10;
                  return (
                    <g key={li}>
                      {/* Backing rect keeps the label legible even where
                       * another edge's line crosses behind it. */}
                      <rect
                        x={labelX - lineWidth / 2}
                        y={y - 9}
                        width={lineWidth}
                        height={12}
                        fill="var(--pf-surface)"
                      />
                      <text x={labelX} y={y} textAnchor="middle" fontSize="10" fill="var(--pf-muted)">
                        {line}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}

          {nodes.map((n) => {
            const pos = positions[n.id];
            if (!pos) return null;
            const lines = wrapLabel(n.label);
            const lineHeight = 13;
            const labelStartY = pos.y + NODE_HEIGHT / 2 - ((lines.length - 1) * lineHeight) / 2 - 6;
            return (
              <g key={n.id}>
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={10}
                  fill="var(--pf-surface)"
                  stroke="var(--pf-primary)"
                  strokeWidth={1.5}
                />
                {lines.map((line, i) => (
                  <text
                    key={i}
                    x={pos.x + NODE_WIDTH / 2}
                    y={labelStartY + i * lineHeight}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight={500}
                    fill="var(--pf-ink)"
                  >
                    {line}
                  </text>
                ))}
                <text
                  x={pos.x + NODE_WIDTH / 2}
                  y={pos.y + NODE_HEIGHT - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--pf-muted)"
                >
                  {n.kind}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div>
        <h3 className="text-sm font-medium">Compliance notes</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--pf-muted)]">
          {complianceNotes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
