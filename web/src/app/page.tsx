"use client";
import Link from "next/link";
import { useState } from "react";
import { CategoryBars } from "@/components/Charts";
import { Explorer } from "@/components/Explorer";
import { Icon } from "@/components/Icon";
import { Async, btn, btn2, EmptyState, ErrorBox, Kpi, PageHeader, Panel, Segmented, Skeleton, SkeletonRows } from "@/components/ui";
import { getRecurrences, getSummary } from "@/lib/api";
import { categoryColor, PAY_COLOR, PAY_LABEL } from "@/lib/colors";
import { daysBetween, formatBRL, formatDayMonth, formatMonth, formatMonthLong, formatPercent, formatRelativeDay, merchantLabel, today } from "@/lib/format";
import { byPay, isCard, isPending, splitHint, splitRecorrencias, type PayFilter } from "@/lib/recurrence";
import { useApi } from "@/lib/useApi";

export default function Home() {
  const sum = useApi(() => getSummary(12));
  const rec = useApi(() => getRecurrences({ active: true }));
  const s = sum.data;
  const recs = rec.data ?? [];
  const cur = s?.months.at(-1);
  const total = cur ? (s?.total_by_month[cur] ?? 0) : 0;
  const hoje = today();
  const emAndamento = cur === hoje.slice(0, 7);
  // Mes em andamento nao se compara com mes cheio: a variacao usa os dois ultimos meses completos.
  const [a, b] = emAndamento ? [s?.months.at(-2), s?.months.at(-3)] : [cur, s?.months.at(-2)];
  const totalA = a ? (s?.total_by_month[a] ?? 0) : 0;
  const before = b ? (s?.total_by_month[b] ?? 0) : 0;
  const delta = before ? ((totalA - before) / before) * 100 : null;
  const prev = b;
  const [pay, setPay] = useState<PayFilter>("todas");
  const split = splitRecorrencias(recs);
  const comDatas = byPay(recs, pay).filter((r) => r.next_due && r.user_decision !== "descartada").sort((a, b) => a.next_due!.localeCompare(b.next_due!));
  const futuras = comDatas.filter((r) => r.next_due! >= hoje);
  const upcoming = (futuras.length ? futuras : comDatas).slice(0, 6);
  const pendentes = recs.filter(isPending);
  // Atalho para categorizar: id da "Sem categoria" e o mes mais recente em que ela aparece.
  const semLinhas = (s?.by_category ?? []).filter((x) => x.category?.name === "Sem categoria");
  const semCategoria = { id: semLinhas[0]?.category?.id ?? "", mes: semLinhas.map((x) => x.month).sort().at(-1) ?? cur };
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi loading={loadingSum} label={cur ? `Gasto em ${formatMonth(cur)}` : "Gasto do mês"} value={formatBRL(total)}
              hint={emAndamento ? "Mês em andamento" : undefined} />
            <Kpi loading={loadingSum} label={emAndamento && a ? `Variação ${formatMonth(a)} vs anterior` : "Variação vs mês anterior"}
              value={delta === null ? "Sem base" : formatPercent(delta)}
              delta={delta === null || Math.abs(delta) < 0.05 ? undefined : delta > 0
                ? { text: "gastou mais", tone: "danger", icon: "up" }
                : { text: "gastou menos", tone: "accent", icon: "down" }}
              hint={prev ? `${formatMonth(prev)}: ${formatBRL(before)}` : undefined} />
            <Kpi loading={loadingSum} label={cur ? `Receita em ${formatMonth(cur)}` : "Receita do mês"} value={formatBRL(cur ? s?.income_by_month[cur] ?? 0 : 0)}
              hint={cur && s ? (emAndamento && a
                ? `Mês em andamento · ${formatMonth(a)}: ${formatBRL(s.income_by_month[a] ?? 0)}`
                : `Saldo do mês: ${formatBRL((s.income_by_month[cur] ?? 0) - total)}`) : undefined} />
            <Kpi loading={loadingRec} label="Recorrente no cartão" value={formatBRL(split.card.total)}
              hint={<span className="inline-flex items-center gap-1"><Icon name="card" size={12} style={{ color: PAY_COLOR.card }} />{splitHint(split.card)}</span>} />
            <Kpi loading={loadingRec} label="Recorrente fora do cartão" value={formatBRL(split.bank.total)}
              hint={<span className="inline-flex items-center gap-1"><Icon name="bank" size={12} style={{ color: PAY_COLOR.bank }} />{splitHint(split.bank)}</span>} />
          </div>

          {s && s.uncategorized.count > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-warn-soft px-4 py-3 text-sm">
              <Icon name="alert" size={18} className="shrink-0 text-warn-text" />
              <p className="min-w-0 flex-1 text-ink-2">
                <span className="font-medium text-ink">{s.uncategorized.count} {s.uncategorized.count === 1 ? "lançamento" : "lançamentos"} sem categoria</span>
                {" "}somando {formatBRL(s.uncategorized.total)} nos últimos 12 meses. Categorize para o painel refletir o que você realmente gasta.
              </p>
              <Link href={`/transacoes?cat=${semCategoria.id}&mes=${semCategoria.mes}`} className={btn2}><Icon name="rules" size={16} />Categorizar</Link>
            </div>
          )}

          <Explorer />

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

            <Panel title="Próximas cobranças" subtitle="Assinaturas, parcelas e recorrências" pad={false}
              actions={<Segmented<PayFilter> label="Filtrar cobranças por meio de pagamento" value={pay} onChange={setPay}
                items={[{ key: "todas", label: "Todas" }, { key: "cartao", label: PAY_LABEL.card }, { key: "conta", label: PAY_LABEL.bank }]} />}>
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
                              <Icon name={isCard(r) ? "card" : "bank"} size={13} className="shrink-0"
                                style={{ color: isCard(r) ? PAY_COLOR.card : PAY_COLOR.bank }} aria-label={isCard(r) ? PAY_LABEL.card : PAY_LABEL.bank} />
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
