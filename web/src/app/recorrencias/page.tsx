"use client";
import { useState } from "react";
import { RecurrenceCard } from "@/components/RecurrenceCard";
import { useToast } from "@/components/Toast";
import { Async, EmptyState, Kpi, PageHeader, Panel, Skeleton, Tabs } from "@/components/ui";
import { decideRecurrence, getRecurrences } from "@/lib/api";
import { formatBRL } from "@/lib/format";
import { isPending, monthlyCommitted } from "@/lib/recurrence";
import type { RecurrenceKind } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const ABAS: { key: RecurrenceKind; label: string; vazio: string }[] = [
  { key: "assinatura", label: "Assinaturas", vazio: "Nenhuma assinatura identificada nas suas transações." },
  { key: "parcela", label: "Parcelas", vazio: "Nenhuma compra parcelada em andamento." },
  { key: "detectada", label: "Detectadas", vazio: "Nenhuma cobrança repetida nova para revisar." },
];

export default function Recorrencias() {
  const toast = useToast();
  // Aba derivada no render (nao no useState inicial): depende dos dados e do hash, que na navegacao do
  // cliente so entra na URL depois do primeiro render. As abas so aparecem com os dados, sem divergir na hidratacao.
  const [escolha, setAba] = useState<RecurrenceKind>();
  const [busy, setBusy] = useState<number>();
  const { data, loading, error, reload } = useApi(() => getRecurrences({ active: true }));
  const todas = (data ?? []).filter((r) => r.user_decision !== "descartada");
  const pendentes = todas.filter(isPending).length;
  // Sem escolha do usuario: abre em Detectadas se ha pendentes (ou se veio pelo link #detectadas).
  const aba = escolha ?? (pendentes > 0 || (typeof window !== "undefined" && window.location.hash === "#detectadas") ? "detectada" : "assinatura");
  const lista = todas.filter((r) => r.kind === aba).sort((a, b) => Number(isPending(b)) - Number(isPending(a)) || Math.abs(b.expected_amount) - Math.abs(a.expected_amount));

  const decide = async (id: number, d: "confirmada" | "descartada") => {
    setBusy(id);
    try {
      await decideRecurrence(id, d);
      toast(d === "confirmada" ? "Recorrência confirmada" : "Recorrência descartada");
      reload();
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(undefined);
    }
  };

  const first = loading && !data;
  return (
    <>
      <PageHeader title="Recorrências" subtitle="Assinaturas, parcelas e cobranças que se repetem, detectadas a partir das suas transações." />

      <Async loading={first} error={error} onRetry={reload}
        skeleton={<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-56" />)}</div>}
        empty={todas.length === 0 && (
          <Panel><EmptyState icon="repeat" title="Nenhuma recorrência ainda">
            Elas aparecem sozinhas depois de alguns meses de transações importadas.
          </EmptyState></Panel>
        )}>
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Kpi label="Comprometido por mês" value={formatBRL(monthlyCommitted(todas))} hint="Assinaturas, parcelas e detectadas confirmadas" />
          <Kpi label="Recorrências ativas" value={String(todas.length - pendentes)} hint={`${todas.filter((r) => r.kind === "parcela").length} parcelamentos em andamento`} />
          <Kpi label="Aguardando decisão" value={String(pendentes)} hint={pendentes ? "Confirme as que são cobranças reais" : "Tudo revisado"}
            delta={pendentes ? { text: "revisar", tone: "warn" } : undefined} />
        </div>

        <div className="mb-4 overflow-x-auto">
          <Tabs label="Tipo de recorrência" value={aba} onChange={setAba}
            items={ABAS.map((a) => ({
              key: a.key, label: a.label,
              count: todas.filter((r) => r.kind === a.key).length,
              attention: a.key === "detectada" && pendentes > 0,
            }))} />
        </div>

        {lista.length === 0 ? (
          <Panel><EmptyState icon="check" title="Nada nesta aba">{ABAS.find((a) => a.key === aba)?.vazio}</EmptyState></Panel>
        ) : (
          <div role="tabpanel" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {lista.map((r) => <RecurrenceCard key={r.id} rec={r} onDecide={decide} busy={busy === r.id} />)}
          </div>
        )}
      </Async>
    </>
  );
}
