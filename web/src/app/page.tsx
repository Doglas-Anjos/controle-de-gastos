"use client";
import { Async, Card, Title } from "@/components/Async";
import { CategoryBars } from "@/components/Charts";
import { getRecurrences, getSummary } from "@/lib/api";
import { formatBRL, formatDate, formatMonth } from "@/lib/format";
import { useApi } from "@/lib/useApi";

export default function Home() {
  const sum = useApi(() => getSummary(12));
  const rec = useApi(() => getRecurrences({ active: true }));
  const s = sum.data;
  const cur = s?.months.at(-1);
  const prev = s?.months.at(-2);
  const total = cur ? (s?.total_by_month[cur] ?? 0) : 0;
  const before = prev ? (s?.total_by_month[prev] ?? 0) : 0;
  const delta = before ? ((total - before) / before) * 100 : null;
  const upcoming = (rec.data ?? []).filter((r) => r.next_due).sort((a, b) => a.next_due!.localeCompare(b.next_due!)).slice(0, 8);

  return (
    <>
      <Title>Visão geral</Title>
      <Async loading={sum.loading} error={sum.error} empty={!s || s.months.length === 0}>
        {s && cur && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card label={`Gastos em ${formatMonth(cur)}`} value={formatBRL(total)} />
              <Card label="Variação vs mês anterior" value={delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`}
                hint={prev ? `${formatMonth(prev)}: ${formatBRL(before)}` : undefined} />
              <Card label="Receita do mês" value={formatBRL(s.income_by_month[cur] ?? 0)} />
            </div>
            <section>
              <h2 className="mb-2 font-medium">Gastos por categoria e mês</h2>
              <CategoryBars summary={s} />
            </section>
          </div>
        )}
      </Async>
      <section className="mt-6">
        <h2 className="mb-2 font-medium">Próximas cobranças</h2>
        <Async loading={rec.loading} error={rec.error} empty={upcoming.length === 0 && "Nenhuma cobrança prevista."}>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {upcoming.map((r) => (
              <li key={r.id} className="flex justify-between py-2 text-sm">
                <span>{formatDate(r.next_due!)} · {r.merchant}</span>
                <span>{formatBRL(r.expected_amount)}</span>
              </li>
            ))}
          </ul>
        </Async>
      </section>
    </>
  );
}
