import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ChartLineProps {
  data: Record<string, number | string>[];
  xKey: string;
  yKey: string;
}

export function ChartLine({ data, xKey, yKey }: ChartLineProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <XAxis dataKey={xKey} stroke="var(--pf-muted)" fontSize={12} />
        <YAxis stroke="var(--pf-muted)" fontSize={12} />
        <Tooltip />
        <Line type="monotone" dataKey={yKey} stroke="var(--pf-primary)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
