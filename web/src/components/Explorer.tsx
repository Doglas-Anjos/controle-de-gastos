"use client";
import { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Icon } from "@/components/Icon";
import { Async, EmptyState, Panel, Segmented, Skeleton, input, label as labelCls } from "@/components/ui";
import { getCategories, getProjection } from "@/lib/api";
import { PAY_COLOR, PAY_LABEL } from "@/lib/colors";
import { catLabel, formatBRL, formatBRLCompact, formatMonth, formatMonthLong, formatPercent } from "@/lib/format";
import type { ProjectionOut, ProjectionPoint } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Janela = 3 | 6 | 12;
type Visao = "total" | "pay" | "rec";
const CHAVE = "explorador";

// Preferencias do explorador sobrevivem ao reload; sao conveniencia local, nao estado do servidor.
function lerPrefs(): { cat: number | ""; meses: Janela; visao: Visao } {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE) ?? "{}");
    return { cat: typeof p.cat === "number" ? p.cat : "", meses: [3, 6, 12].includes(p.meses) ? p.meses : 6, visao: ["total", "pay", "rec"].includes(p.visao) ? p.visao : "total" };
  } catch {
    return { cat: "", meses: 6, visao: "total" };
  }
}

const SERIES: Record<Visao, { key: keyof ProjectionPoint | "avulso"; name: string; color: string }[]> = {
  total: [{ key: "total", name: "Gasto", color: "var(--chart-band)" }],
  pay: [{ key: "card", name: PAY_LABEL.card, color: PAY_COLOR.card }, { key: "bank", name: PAY_LABEL.bank, color: PAY_COLOR.bank }],
  rec: [{ key: "recurring", name: "Recorrente", color: "var(--series-6)" }, { key: "avulso", name: "Avulso", color: "var(--series-other)" }],
};

export function ProjectionStats({ p }: { p: ProjectionOut }) {
  const trend = p.trend_pct === null ? null : p.trend_pct * 100;
  const sobe = trend !== null && trend > 0.5;
  const desce = trend !== null && trend < -0.5;
  const itens: { label: string; value: string; sub?: string; tone?: string; icon?: "up" | "down" }[] = [
    { label: `Média de ${p.months_window} meses`, value: formatBRL(p.mean), sub: `mediana ${formatBRL(p.median)}` },
    {
      label: "Último mês", value: formatBRL(p.last_month),
      sub: trend === null ? "sem base" : `${formatPercent(trend)} vs média`,
      tone: sobe ? "text-danger-text" : desce ? "text-accent-text" : "text-muted", icon: sobe ? "up" : desce ? "down" : undefined,
    },
    { label: "Projeção próximo mês", value: formatBRL(p.projection[0]?.total ?? p.mean), sub: `${p.horizon} meses à frente, pela média` },
    { label: "Variação típica", value: formatBRL(p.stdev), sub: "desvio entre os meses da janela" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-1" data-testid="projection-stats">
      {itens.map((it) => (
        <div key={it.label} className="rounded-[12px] border border-line bg-surface-2/60 px-3.5 py-3">
          <dt className="text-xs text-muted">{it.label}</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{it.value}</dd>
          {it.sub && (
            <dd className={`mt-0.5 flex items-center gap-1 text-xs ${it.tone ?? "text-muted"}`}>
              {it.icon && <Icon name={it.icon} size={12} />}{it.sub}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

function ProjectionChart({ p, visao }: { p: ProjectionOut; visao: Visao }) {
  const rows = useMemo(
    () => [...p.history, ...p.projection].map((r) => ({ ...r, avulso: Math.max(0, +(r.total - r.recurring).toFixed(2)) })),
    [p],
  );
  const series = SERIES[visao];
  const axis = { stroke: "var(--muted)", fontSize: 12, tickLine: false, axisLine: false } as const;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={rows} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="month" tickFormatter={(m: string) => formatMonth(m).slice(0, 3)} {...axis} dy={6} />
        <YAxis tickFormatter={(v: number) => formatBRLCompact(v)} width={72} {...axis} />
        <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => {
          const r = active && (payload?.[0]?.payload as (typeof rows)[number] | undefined);
          if (!r) return null;
          return (
            <div className="min-w-48 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-xs shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
              <div className="mb-1.5 font-medium text-ink">{formatMonthLong(r.month)}{r.projected ? " · projeção" : ""}</div>
              <ul className="space-y-1">
                {series.map((s) => (
                  <li key={s.key} className="flex items-center gap-2">
                    <span className="h-[3px] w-3 rounded-full" style={{ background: s.color }} />
                    <span className="flex-1 text-ink-2">{s.name}</span>
                    <span className="font-medium tabular-nums text-ink">{formatBRL(Number(r[s.key as keyof typeof r]))}</span>
                  </li>
                ))}
              </ul>
              {visao !== "total" && (
                <div className="mt-1.5 flex justify-between border-t border-line pt-1.5">
                  <span className="text-muted">Total</span><span className="font-semibold tabular-nums text-ink">{formatBRL(r.total)}</span>
                </div>
              )}
            </div>
          );
        }} />
        <ReferenceLine y={p.mean} stroke="var(--ink-2)" strokeDasharray="4 4" ifOverflow="extendDomain"
          label={{ value: `média ${p.months_window} meses`, position: "insideTopRight", fill: "var(--ink-2)", fontSize: 11 }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={s.color} maxBarSize={36} isAnimationActive={false}
            radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}>
            {rows.map((r) => (
              // Meses projetados: mesma cor, mais claros e com borda tracejada, para nao se confundirem com o historico.
              <Cell key={r.month} fillOpacity={r.projected ? 0.35 : 1} stroke={r.projected ? s.color : "var(--surface)"}
                strokeWidth={r.projected ? 1.5 : 1} strokeDasharray={r.projected ? "4 3" : undefined} />
            ))}
          </Bar>
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function Explorer() {
  const [prefs, setPrefs] = useState(() => ({ cat: "" as number | "", meses: 6 as Janela, visao: "total" as Visao }));
  const [pronto, setPronto] = useState(false);
  useEffect(() => { setPrefs(lerPrefs()); setPronto(true); }, []);
  useEffect(() => { if (pronto) try { localStorage.setItem(CHAVE, JSON.stringify(prefs)); } catch {} }, [prefs, pronto]);

  const cats = useApi(() => getCategories());
  const proj = useApi(() => getProjection({ category_id: prefs.cat, months: prefs.meses, horizon: 3 }), [prefs.cat, prefs.meses, pronto]);
  const p = proj.data;
  const vazio = !!p && p.history.every((h) => h.total === 0);
  const categorias = (cats.data ?? []).filter((c) => c.kind !== "receita" && c.kind !== "transferencia");

  return (
    <Panel title="Explorar por tipo de gasto" subtitle="Escolha um tipo de gasto e veja a média de um período e a projeção dos próximos meses.">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="explorer-cat" className={labelCls}>Tipo de gasto</label>
          <select id="explorer-cat" className={`${input} min-w-48`} value={prefs.cat} onChange={(e) => setPrefs((s) => ({ ...s, cat: e.target.value === "" ? "" : Number(e.target.value) }))}>
            <option value="">Todos os gastos</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{catLabel(c.name)}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Média de</span>
          <Segmented<`${Janela}`> label="Meses de histórico" value={`${prefs.meses}`} onChange={(k) => setPrefs((s) => ({ ...s, meses: Number(k) as Janela }))}
            items={[{ key: "3", label: "3 meses" }, { key: "6", label: "6 meses" }, { key: "12", label: "12 meses" }]} />
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Ver</span>
          <Segmented<Visao> label="Como dividir o gasto" value={prefs.visao} onChange={(visao) => setPrefs((s) => ({ ...s, visao }))}
            items={[{ key: "total", label: "Total" }, { key: "pay", label: "Cartão × Conta" }, { key: "rec", label: "Recorrente × Avulso" }]} />
        </div>
      </div>

      <Async loading={proj.loading && !p} error={proj.error} onRetry={proj.reload} skeleton={<Skeleton className="h-[300px] w-full" />}
        empty={vazio && <EmptyState icon="trend" title="Sem gastos nesse período">Esse tipo de gasto não teve lançamentos nos últimos {prefs.meses} meses completos.</EmptyState>}>
        {p && (
          <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
            <div className={proj.loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
              <ProjectionChart p={p} visao={prefs.visao} />
              <p className="mt-2 text-xs text-muted">Barras claras tracejadas são projeção: a média dos {p.months_window} meses repetida à frente. O mês atual fica de fora por estar incompleto.</p>
            </div>
            <ProjectionStats p={p} />
          </div>
        )}
      </Async>
    </Panel>
  );
}
