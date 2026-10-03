"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { categoryColor } from "@/lib/colors";
import { catLabel, formatBRL, formatBRLCompact, formatMonth, formatMonthLong } from "@/lib/format";
import type { ForecastOut, SummaryOut } from "@/lib/types";

// Tela estreita: um rotulo de mes a cada 3, em intervalo fixo, em vez de o recharts pular de forma irregular.
const ESTREITO = "(max-width: 639px)";
const useNarrow = () => useSyncExternalStore(
  (cb) => { const mq = matchMedia(ESTREITO); mq.addEventListener("change", cb); return () => mq.removeEventListener("change", cb); },
  () => matchMedia(ESTREITO).matches,
  () => false,
);

const axis = { stroke: "var(--muted)", fontSize: 12, tickLine: false, axisLine: false } as const;
const grid = { stroke: "var(--grid)", vertical: false } as const;

const SLOTS = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
type Serie = { key: string; name: string; color: string; total: number };

// Mais de 8 categorias nao ganham cor nova: as menores viram "Outras" (skill dataviz).
export function categorySeries(summary: SummaryOut): Serie[] {
  const acc = new Map<string, Serie>();
  for (const r of summary.by_category) {
    const key = r.category ? `c${r.category.id}` : "none";
    const s = acc.get(key) ?? { key, name: catLabel(r.category?.name), color: categoryColor(r.category), total: 0 };
    s.total += r.total;
    acc.set(key, s);
  }
  const all = [...acc.values()].sort((a, b) => b.total - a.total);
  const top = all.length <= 8 ? all : all.slice(0, 7);
  // Cor pelo id (igual aos chips das outras telas); se duas categorias caem no mesmo tom, a menor
  // pega o primeiro tom livre, para nenhuma cor se repetir no mesmo grafico.
  const usadas = new Set(top.map((s) => s.color));
  const vistas = new Set<string>();
  for (const s of top) {
    if (vistas.has(s.color)) {
      s.color = SLOTS.find((c) => !usadas.has(c)) ?? s.color;
      usadas.add(s.color);
    }
    vistas.add(s.color);
  }
  if (all.length <= 8) return top;
  const rest = all.slice(7);
  return [...top, { key: "outras", name: "Outras", color: "var(--series-other)", total: rest.reduce((s, x) => s + x.total, 0) }];
}

function TipBox({ title, rows, footer }: { title: string; rows: { color?: string; name: string; value: string }[]; footer?: { name: string; value: string } }) {
  return (
    <div className="min-w-48 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-xs shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
      <div className="mb-1.5 font-medium text-ink">{title}</div>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2">
            {r.color && <span className="h-0.5 w-3 rounded-full" style={{ background: r.color, height: 3 }} />}
            <span className="flex-1 text-ink-2">{r.name}</span>
            <span className="font-medium tabular-nums text-ink">{r.value}</span>
          </li>
        ))}
      </ul>
      {footer && (
        <div className="mt-1.5 flex justify-between border-t border-line pt-1.5">
          <span className="text-muted">{footer.name}</span>
          <span className="font-semibold tabular-nums text-ink">{footer.value}</span>
        </div>
      )}
    </div>
  );
}

export function CategoryBars({ summary, height = 320 }: { summary: SummaryOut; height?: number }) {
  const series = useMemo(() => categorySeries(summary), [summary]);
  const estreito = useNarrow();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const rows = useMemo(() => {
    const shown = new Set(series.map((s) => s.key));
    return summary.months.map((month) => {
      const row: Record<string, number | string> = { month };
      for (const r of summary.by_category) {
        if (r.month !== month) continue;
        let k = r.category ? `c${r.category.id}` : "none";
        if (!shown.has(k)) k = "outras";
        row[k] = ((row[k] as number) ?? 0) + r.total;
      }
      return row;
    });
  }, [summary, series]);
  const visible = series.filter((s) => !hidden.has(s.key));
  const toggle = (k: string) => setHidden((h) => {
    const n = new Set(h);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5" aria-label="Categorias no gráfico">
        {series.map((s) => {
          const on = !hidden.has(s.key);
          return (
            <button key={s.key} type="button" aria-pressed={on} onClick={() => toggle(s.key)}
              title={on ? "Ocultar do gráfico" : "Mostrar no gráfico"}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors duration-150 ${on ? "border-line bg-surface text-ink-2 hover:border-line-strong" : "border-dashed border-line bg-transparent text-muted line-through"}`}>
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: on ? s.color : "var(--line-strong)" }} />
              {s.name}
            </button>
          );
        })}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="month" tickFormatter={(m: string) => formatMonth(m).slice(0, 3)} interval={estreito ? 2 : 0} {...axis} dy={6} />
          <YAxis tickFormatter={(v: number) => formatBRLCompact(v)} width={72} {...axis} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload, label: l }) => {
            if (!active || !payload?.length) return null;
            const items = payload.filter((p) => Number(p.value) > 0).sort((a, b) => Number(b.value) - Number(a.value));
            const total = items.reduce((s, p) => s + Number(p.value), 0);
            return <TipBox title={formatMonthLong(String(l))}
              rows={items.map((p) => ({ color: String(p.color), name: String(p.name), value: formatBRL(Number(p.value)) }))}
              footer={{ name: "Total", value: formatBRL(total) }} />;
          }} />
          {visible.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={s.color} maxBarSize={28}
              stroke="var(--surface)" strokeWidth={1.5} isAnimationActive={false}
              radius={i === visible.length - 1 ? [4, 4, 0, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function forecastRows(forecast: ForecastOut) {
  return Object.keys(forecast.total_by_month).sort().map((month) => {
    const ls = forecast.lines.filter((l) => l.month === month);
    const low = ls.reduce((s, l) => s + l.low, 0);
    const high = ls.reduce((s, l) => s + l.high, 0);
    return { month, total: forecast.total_by_month[month], low, high, faixa: [low, high] as [number, number] };
  });
}

export function ForecastArea({ forecast }: { forecast: ForecastOut }) {
  const rows = forecastRows(forecast);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="month" tickFormatter={formatMonth} {...axis} dy={6} padding={{ left: 24, right: 24 }} />
        <YAxis tickFormatter={(v: number) => formatBRLCompact(v)} width={72} {...axis} />
        <Tooltip cursor={{ stroke: "var(--line-strong)" }} content={({ active, payload }) => {
          const r = active && payload?.[0]?.payload as (typeof rows)[number] | undefined;
          if (!r) return null;
          return <TipBox title={formatMonthLong(r.month)} rows={[
            { color: "var(--chart-band)", name: "Previsto", value: formatBRL(r.total) },
            { name: "Mínimo provável", value: formatBRL(r.low) },
            { name: "Máximo provável", value: formatBRL(r.high) },
          ]} />;
        }} />
        <Area dataKey="faixa" name="Faixa provável" stroke="none" fill="var(--chart-band)" fillOpacity={0.12} isAnimationActive={false} />
        <Line dataKey="total" name="Previsto" stroke="var(--chart-band)" strokeWidth={2}
          dot={{ r: 4, fill: "var(--chart-band)", stroke: "var(--surface)", strokeWidth: 2 }}
          activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
