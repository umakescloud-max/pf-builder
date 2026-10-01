import { StatTile, type StatTileProps } from "./StatTile";

export interface MetricPanelProps {
  metrics: StatTileProps[];
  dataTour?: string;
}

export function MetricPanel({ metrics, dataTour }: MetricPanelProps) {
  return (
    <div data-tour={dataTour} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {metrics.map((m) => (
        <StatTile key={m.label} {...m} />
      ))}
    </div>
  );
}
