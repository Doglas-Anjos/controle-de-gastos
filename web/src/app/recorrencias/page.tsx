"use client";
import { useState } from "react";
import { Async, btn2, Card, Title } from "@/components/Async";
import { RecurrenceCard } from "@/components/RecurrenceCard";
import { decideRecurrence, getRecurrences } from "@/lib/api";
import { formatBRL } from "@/lib/format";
import type { RecurrenceKind } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const ABAS: [RecurrenceKind, string][] = [["assinatura", "Assinaturas"], ["parcela", "Parcelas"], ["detectada", "Detectadas"]];
// Valor mensal equivalente; descartadas nao comprometem o orcamento.
const PERIODOS: Record<string, number> = { semanal: 52 / 12, mensal: 1, anual: 1 / 12 };

export default function Recorrencias() {
  const [aba, setAba] = useState<RecurrenceKind>("assinatura");
  const [err, setErr] = useState<string>();
  const { data, loading, error, reload } = useApi(() => getRecurrences({ active: true }));
  const todas = (data ?? []).filter((r) => r.user_decision !== "descartada");
  const lista = todas.filter((r) => r.kind === aba);
  const pendentes = todas.filter((r) => r.kind === "detectada" && r.user_decision === null).length;
  const mensal = todas
    .filter((r) => r.kind !== "detectada" || r.user_decision === "confirmada")
    .reduce((s, r) => s + r.expected_amount * (PERIODOS[r.periodicity] ?? 1), 0);

  const decide = (id: number, d: "confirmada" | "descartada") =>
    decideRecurrence(id, d).then(() => { setErr(undefined); reload(); }, (e: Error) => setErr(e.message));

  return (
    <>
      <Title>Recorrências</Title>
      <Async loading={loading} error={error} empty={todas.length === 0 && "Nenhuma recorrência encontrada."}>
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <Card label="Total mensal comprometido" value={formatBRL(mensal)} hint="Assinaturas, parcelas e detectadas confirmadas" />
          <Card label="Detectadas pendentes de decisão" value={String(pendentes)} />
        </div>
        <div className="mb-4 flex gap-2">
          {ABAS.map(([k, label]) => (
            <button key={k} onClick={() => setAba(k)} className={btn2 + (aba === k ? " !bg-blue-600 !text-white" : "")}>
              {label}{k === "detectada" && pendentes > 0 ? ` (${pendentes})` : ""}
            </button>
          ))}
        </div>
        {err && <p role="alert" className="mb-2 text-sm text-red-600">{err}</p>}
        {lista.length === 0 ? <p className="text-sm text-zinc-500">Nada nesta aba.</p> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {lista.map((r) => <RecurrenceCard key={r.id} rec={r} onDecide={decide} />)}
          </div>
        )}
      </Async>
    </>
  );
}
