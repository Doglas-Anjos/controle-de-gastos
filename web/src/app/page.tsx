"use client";
import Link from "next/link";
import { CategoryBars } from "@/components/Charts";
import { Icon } from "@/components/Icon";
import { Async, btn, btn2, EmptyState, ErrorBox, Kpi, PageHeader, Panel, Skeleton, SkeletonRows } from "@/components/ui";
import { getRecurrences, getSummary } from "@/lib/api";
import { categoryColor } from "@/lib/colors";
import { daysBetween, formatBRL, formatDayMonth, formatMonth, formatMonthLong, formatPercent, formatRelativeDay, merchantLabel, today } from "@/lib/format";
import { isPending, monthlyCommitted } from "@/lib/recurrence";
import { useApi } from "@/lib/useApi";

export default function Home() {
  const sum = useApi(() => getSummary(12));
  const rec = useApi(() => getRecurrences({ active: true }));
  const s = sum.data;
  const recs = rec.data ?? [];
  const cur = s?.months.at(-1);
  const prev = s?.months.at(-2);
  const total = cur ? (s?.total_by_month[cur] ?? 0) : 0;
  const before = prev ? (s?.total_by_month[prev] ?? 0) : 0;
  const delta = before ? ((total - before) / before) * 100 : null;
  const hoje = today();
  const comDatas = recs.filter((r) => r.next_due && r.user_decision !== "descartada").sort((a, b) => a.next_due!.localeCompare(b.next_due!));
  const futuras = comDatas.filter((r) => r.next_due! >= hoje);
  const upcoming = (futuras.length ? futuras : comDatas).slice(0, 6);
  const pendentes = recs.filter(isPending);
  const loadingSum = sum.loading && !s;
  const loadingRec = rec.loading && !rec.data;

  return (
    <>
      <PageHeader title="Visão geral" subtitle={cur ? `Seus gastos em ${formatMonthLong(cur)}, comparados ao mês anterior.` : "Resumo dos seus gastos por mês e categoria."} />

      {sum.error ? <ErrorBox message={sum.error} onRetry={sum.reload} /> : s && s.months.length === 0 ? (
        <Panel>
          <EmptyState icon="upload" title="Nenhuma transação ainda"
            action={<Link href="/importar" className={btn}><Icon name="upload" size={16} />Importar extratos</Link>}>
            Importe arquivos OFX ou CSV do seu banco, ou sincronize pelo Open Finance, para ver o resumo aqui.
          </EmptyState>
        </Panel>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi loading={loadingSum} label={cur ? `Gasto em ${formatMonth(cur)}` : "Gasto do mês"} value={formatBRL(total)}
              hint={cur === hoje.slice(0, 7) ? "Mês em andamento" : undefined} />
            <Kpi loading={loadingSum} label="Variação vs mês anterior"
              value={delta === null ? "Sem base" : formatPercent(delta)}
              delta={delta === null || Math.abs(delta) < 0.05 ? undefined : delta > 0
                ? { text: "gastou mais", tone: "danger", icon: "up" }
                : { text: "gastou menos", tone: "accent", icon: "down" }}
              hint={prev ? `${formatMonth(prev)}: ${formatBRL(before)}` : undefined} />
            <Kpi loading={loadingSum} label="Receita do mês" value={formatBRL(cur ? s?.income_by_month[cur] ?? 0 : 0)}
              hint={cur && s ? `Saldo do mês: ${formatBRL((s.income_by_month[cur] ?? 0) - total)}` : undefined} />
            <Kpi loading={loadingRec} label="Comprometido por mês" value={formatBRL(monthlyCommitted(recs))}
              hint="Assinaturas, parcelas e recorrências confirmadas" />
          </div>

          {pendentes.length > 0 && (
            <section className="flex flex-col gap-4 rounded-[14px] border border-warn/40 bg-warn-soft px-5 py-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-4 sm:items-center">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface text-warn-text"><Icon name="repeat" /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-ink">
                  {pendentes.length === 1 ? "1 recorrência detectada aguarda sua decisão" : `${pendentes.length} recorrências detectadas aguardam sua decisão`}
                </h2>
                <p className="mt-0.5 text-sm text-ink-2 sm:truncate">
                  {pendentes.slice(0, 3).map((r) => `${merchantLabel(r.merchant)} (${formatBRL(Math.abs(r.expected_amount))})`).join(", ")}
                  {pendentes.length > 3 ? ` e mais ${pendentes.length - 3}` : ""}
                </p>
              </div>
              </div>
              <Link href="/recorrencias#detectadas" className={`${btn2} w-full sm:w-auto`}>Revisar agora<Icon name="right" size={16} /></Link>
            </section>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Panel className="lg:col-span-2" title="Gastos por categoria" subtitle="Últimos 12 meses. Clique numa categoria para ocultar ou mostrar.">
              {loadingSum ? <Skeleton className="h-[360px] w-full" /> : s && <CategoryBars summary={s} />}
            </Panel>

            <Panel title="Próximas cobranças" subtitle="Assinaturas, parcelas e recorrências" pad={false}>
              <div className="px-5 pb-4 pt-3">
                <Async loading={loadingRec} error={rec.error} onRetry={rec.reload} skeleton={<SkeletonRows rows={5} />}
                  empty={upcoming.length === 0 && <p className="py-8 text-center text-sm text-muted">Nenhuma cobrança prevista.</p>}>
                  <ul className="divide-y divide-line">
                    {upcoming.map((r) => {
                      const dias = daysBetween(hoje, r.next_due!);
                      return (
                        <li key={r.id} className="flex items-center gap-3 py-3">
                          <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-[10px] bg-surface-2 leading-none">
                            <span className="text-sm font-semibold tabular-nums text-ink">{r.next_due!.slice(8, 10)}</span>
                            <span className="mt-0.5 text-[10px] text-muted">{formatDayMonth(r.next_due!).split(" ")[1]}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 truncate text-sm font-medium text-ink">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: categoryColor(r.category) }} />
                              <span className="truncate">{merchantLabel(r.merchant)}</span>
                            </div>
                            <div className={`text-xs ${dias >= 0 && dias <= 3 ? "text-warn-text" : "text-muted"}`}>{formatRelativeDay(r.next_due!, hoje)}</div>
                          </div>
                          <span className="text-sm font-medium tabular-nums text-ink">{formatBRL(Math.abs(r.expected_amount))}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <Link href="/recorrencias" className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline">
                    Ver todas as recorrências<Icon name="right" size={14} />
                  </Link>
                </Async>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
