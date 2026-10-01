import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ChartBarProps {
  data: Record<string, number | string>[];
  xKey: string;
  yKey: string;
}

export function ChartBar({ data, xKey, yKey }: ChartBarProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <XAxis dataKey={xKey} stroke="var(--pf-muted)" fontSize={12} />
        <YAxis stroke="var(--pf-muted)" fontSize={12} />
        <Tooltip />
        <Bar dataKey={yKey} fill="var(--pf-primary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
