"use client";
import { ForecastArea, forecastRows } from "@/components/Charts";
import { Icon } from "@/components/Icon";
import { Async, EmptyState, Hint, PageHeader, Panel, Skeleton } from "@/components/ui";
import { getForecast } from "@/lib/api";
import { categoryColor } from "@/lib/colors";
import { catLabel, formatBRL, formatMonth, formatMonthLong } from "@/lib/format";
import type { CategoryOut, ForecastLine } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const METODO: Record<string, { nome: string; explica: string }> = {
  recorrencia: { nome: "Recorrências", explica: "Soma das assinaturas, parcelas e recorrências confirmadas que vencem no mês." },
  mediana3: { nome: "Mediana de 3 meses", explica: "Mediana dos gastos dos últimos 3 meses completos nesta categoria." },
  sazonal: { nome: "Sazonal", explica: "Média entre a mediana dos últimos 3 meses e o mesmo mês do ano anterior." },
};

type Linha = { category: CategoryOut | null; meses: Record<string, ForecastLine>; metodos: Set<string>; soma: number };

function porCategoria(lines: ForecastLine[]) {
  const m = new Map<string, Linha>();
  for (const l of lines) {
    const k = String(l.category?.id ?? "none");
    const row = m.get(k) ?? { category: l.category, meses: {}, metodos: new Set<string>(), soma: 0 };
    row.meses[l.month] = l;
    row.metodos.add(l.method);
    row.soma += l.amount;
    m.set(k, row);
  }
  return [...m.values()].filter((r) => r.soma > 0).sort((a, b) => b.soma - a.soma);
}

export default function Previsao() {
  const { data, loading, error, reload } = useApi(() => getForecast(3));
  const meses = data ? forecastRows(data) : [];
  const linhas = data ? porCategoria(data.lines) : [];

  return (
    <>
      <PageHeader title="Previsão" subtitle="Quanto você deve gastar nos próximos meses, com uma faixa do mínimo ao máximo provável." />
      <Async loading={loading && !data} error={error} onRetry={reload}
        skeleton={<div className="space-y-6"><div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-80" /></div>}
        empty={data?.lines.length === 0 && (
          <Panel><EmptyState icon="trend" title="Ainda não dá para prever">
            A previsão precisa de pelo menos 3 meses completos de transações. Importe mais histórico para começar.
          </EmptyState></Panel>
        )}>
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {meses.map((m) => (
              <div key={m.month} className="rounded-[14px] border border-line bg-surface p-5">
                <div className="text-sm text-muted first-letter:uppercase">{formatMonthLong(m.month)}</div>
                <div className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-ink">{formatBRL(m.total)}</div>
                <div className="mt-1.5 text-xs text-muted">
                  Entre <span className="tabular-nums text-ink-2">{formatBRL(m.low)}</span> e <span className="tabular-nums text-ink-2">{formatBRL(m.high)}</span>
                </div>
              </div>
            ))}
          </div>

          <Panel title="Total previsto por mês" subtitle="A faixa sombreada vai do mínimo ao máximo provável.">
            {data && <ForecastArea forecast={data} />}
          </Panel>

          <Panel title="Por categoria" subtitle="Passe o mouse no método para ver como cada valor foi calculado." pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th scope="col" className="py-3 pl-5 pr-2 font-medium">Categoria</th>
                    {meses.map((m) => <th key={m.month} scope="col" className="px-2 py-3 text-right font-medium">{formatMonth(m.month)}</th>)}
                    <th scope="col" className="py-3 pl-4 pr-5 font-medium">Método</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((r) => (
                    <tr key={r.category?.id ?? "none"} className="border-b border-line/60 last:border-0 even:bg-surface-2/60">
                      <td className="py-2.5 pl-5 pr-2">
                        <span className="inline-flex items-center gap-2 text-ink">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: categoryColor(r.category) }} />
                          {catLabel(r.category?.name)}
                        </span>
                      </td>
                      {meses.map((m) => {
                        const l = r.meses[m.month];
                        return (
                          <td key={m.month} className="px-2 py-2.5 text-right tabular-nums">
                            {l ? (
                              <>
                                <div className="font-medium text-ink">{formatBRL(l.amount)}</div>
                                {l.high > l.low && <div className="text-xs text-muted">{formatBRL(l.low)} a {formatBRL(l.high)}</div>}
                              </>
                            ) : <span className="text-muted">-</span>}
                          </td>
                        );
                      })}
                      <td className="py-2.5 pl-4 pr-5">
                        <div className="flex flex-wrap gap-1.5">
                          {[...r.metodos].map((k) => (
                            <Hint key={k} side="left" text={METODO[k]?.explica ?? k}>
                              <button type="button" className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-ink-2 hover:border-line-strong">
                                {METODO[k]?.nome ?? k}<Icon name="info" size={12} className="text-muted" />
                              </button>
                            </Hint>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </Async>
    </>
  );
}
