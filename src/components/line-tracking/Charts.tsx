"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

export const CHART_COLORS = [
  "#14b8a6", // teal
  "#06c755", // line green
  "#f97316", // orange
  "#6366f1", // indigo
  "#a855f7", // violet
  "#0ea5e9", // sky
  "#f43f5e", // rose
  "#64748b", // slate
];

export interface Slice {
  name: string;
  value: number;
}

/** Donut chart with a big number in the middle. */
export function DonutChart({
  data,
  centerValue,
  centerLabel,
}: {
  data: Slice[];
  centerValue?: string;
  centerLabel?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">ยังไม่มีข้อมูล</div>;
  }
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={62}
            outerRadius={92}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: number, n: string) => [`${v} (${((v / total) * 100).toFixed(0)}%)`, n]}
            contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>
      {centerValue !== undefined && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold text-slate-800">{centerValue}</div>
          {centerLabel && <div className="text-xs text-slate-400">{centerLabel}</div>}
        </div>
      )}
    </div>
  );
}

/** Small legend list to pair with the donut. */
export function ChartLegend({ data }: { data: Slice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <ul className="space-y-1.5 text-sm">
      {data.map((d, i) => (
        <li key={d.name} className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 truncate">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="truncate text-slate-600">{d.name}</span>
          </span>
          <span className="shrink-0 text-slate-400">
            {d.value} <span className="text-slate-300">· {((d.value / total) * 100).toFixed(0)}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Vertical bar chart. */
export function BarChartCard({
  data,
  color = "#14b8a6",
}: {
  data: Slice[];
  color?: string;
}) {
  if (!data.some((d) => d.value > 0)) {
    return <div className="flex h-[240px] items-center justify-center text-sm text-slate-400">ยังไม่มีข้อมูล</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} interval={0} angle={-15} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "#f1f5f9" }}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
        />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length] || color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Multi-series grouped bar (e.g. leads vs purchases by channel). */
export function GroupedBar({
  data,
}: {
  data: { name: string; leads: number; purchases: number }[];
}) {
  if (!data.length) {
    return <div className="flex h-[240px] items-center justify-center text-sm text-slate-400">ยังไม่มีข้อมูล</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} interval={0} angle={-15} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="leads" name="Leads" fill="#14b8a6" radius={[6, 6, 0, 0]} />
        <Bar dataKey="purchases" name="ปิดการขาย" fill="#f97316" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
