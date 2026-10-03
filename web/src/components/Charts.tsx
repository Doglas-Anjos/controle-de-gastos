"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL, formatMonth } from "@/lib/format";
import type { ForecastOut, SummaryOut } from "@/lib/types";

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#9333ea", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4b5563"];
const axis = { stroke: "#888", fontSize: 12 };
const tip = {
  formatter: (v: unknown) => (Array.isArray(v) ? v.map((x) => formatBRL(Number(x))).join(" – ") : formatBRL(Number(v))),
  labelFormatter: (l: unknown) => formatMonth(String(l)),
  contentStyle: { background: "var(--background)" },
};

export function CategoryBars({ summary }: { summary: SummaryOut }) {
  const names = [...new Set(summary.by_category.map((r) => r.category?.name ?? "Sem categoria"))];
  const rows = summary.months.map((month) => {
    const row: Record<string, number | string> = { month };
    for (const r of summary.by_category)
      if (r.month === month) { const n = r.category?.name ?? "Sem categoria"; row[n] = ((row[n] as number) ?? 0) + r.total; }
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="month" tickFormatter={formatMonth} {...axis} />
        <YAxis tickFormatter={(v) => formatBRL(v)} width={90} {...axis} />
        <Tooltip {...tip} />
        <Legend />
        {names.map((n, i) => <Bar key={n} dataKey={n} stackId="a" fill={COLORS[i % COLORS.length]} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ForecastArea({ forecast }: { forecast: ForecastOut }) {
  const rows = Object.keys(forecast.total_by_month).sort().map((month) => {
    const ls = forecast.lines.filter((l) => l.month === month);
    const low = ls.reduce((s, l) => s + l.low, 0);
    const high = ls.reduce((s, l) => s + l.high, 0);
    return { month, total: forecast.total_by_month[month], faixa: [low, high] };
  });
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="month" tickFormatter={formatMonth} {...axis} />
        <YAxis tickFormatter={(v) => formatBRL(v)} width={90} {...axis} />
        <Tooltip {...tip} />
        <Area dataKey="faixa" name="Faixa (mín–máx)" stroke="none" fill="#2563eb" fillOpacity={0.2} />
        <Area dataKey="total" name="Total previsto" stroke="#2563eb" fill="none" strokeWidth={2} />
        <Legend />
      </AreaChart>
    </ResponsiveContainer>
  );
}
