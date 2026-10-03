"use client";
import { useState } from "react";
import { Async, btn2, input, Title } from "@/components/Async";
import { deleteOverride, getAccounts, getCategories, getTransactions, putOverride } from "@/lib/api";
import { currentMonth, formatBRL, formatDate } from "@/lib/format";
import { useApi } from "@/lib/useApi";

const ORIGEM: Record<string, string> = { override: "manual", regra: "regra", pluggy: "Pluggy", nenhuma: "—" };
const badge = "rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-700";

export default function Transacoes() {
  const [month, setMonth] = useState(currentMonth());
  const [cat, setCat] = useState<number | "">("");
  const [acc, setAcc] = useState<number | "">("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [err, setErr] = useState<string>();
  const size = 25;
  const cats = useApi(getCategories).data ?? [];
  const accs = useApi(getAccounts).data ?? [];
  const tx = useApi(() => getTransactions({ month, category_id: cat, account_id: acc, q, page, page_size: size }), [month, cat, acc, q, page]);
  const pages = tx.data ? Math.max(1, Math.ceil(tx.data.total / size)) : 1;

  const act = (fn: () => Promise<unknown>) => fn().then(() => { setErr(undefined); tx.reload(); }, (e: Error) => setErr(e.message));
  const filter = <V,>(set: (v: V) => void) => (v: V) => { set(v); setPage(1); };

  return (
    <>
      <Title>Transações</Title>
      <div className="mb-4 flex flex-wrap gap-2">
        <input type="month" className={input} value={month} onChange={(e) => filter(setMonth)(e.target.value)} />
        <select className={input} value={cat} onChange={(e) => filter(setCat)(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Todas as categorias</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={input} value={acc} onChange={(e) => filter(setAcc)(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Todas as contas</option>
          {accs.map((a) => <option key={a.id} value={a.id}>{a.bank} · {a.name}</option>)}
        </select>
        <input className={input} placeholder="Buscar…" value={q} onChange={(e) => filter(setQ)(e.target.value)} />
      </div>
      {err && <p role="alert" className="mb-2 text-sm text-red-600">{err}</p>}
      <Async loading={tx.loading} error={tx.error} empty={tx.data?.items.length === 0 && "Nenhuma transação encontrada."}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-zinc-500">
              <tr><th className="p-2">Data</th><th>Descrição</th><th>Categoria</th><th className="text-right">Valor</th><th /></tr>
            </thead>
            <tbody>
              {tx.data?.items.map((t) => (
                <tr key={t.id} className={`border-t border-zinc-200 dark:border-zinc-800 ${t.excluded ? "opacity-50" : ""}`}>
                  <td className="p-2 whitespace-nowrap">{formatDate(t.date)}</td>
                  <td>
                    {t.description}{" "}
                    {t.installment && <span className={badge}>parcela {t.installment}</span>}{" "}
                    {t.recurrence_id !== null && <span className={badge}>recorrente</span>}
                    {t.excluded && <span className={badge}>excluída</span>}
                  </td>
                  <td>
                    <select className={input} value={t.category?.id ?? ""} aria-label="Categoria"
                      onChange={(e) => e.target.value && act(() => putOverride(t.id, { category_id: Number(e.target.value) }))}>
                      <option value="">Sem categoria</option>
                      {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <span className="ml-2 text-xs text-zinc-500">{ORIGEM[t.category_source] ?? t.category_source}</span>
                  </td>
                  <td className={`text-right whitespace-nowrap ${t.amount < 0 ? "" : "text-green-600"}`}>{formatBRL(t.amount)}</td>
                  <td className="space-x-1 p-2 text-right whitespace-nowrap">
                    {(t.excluded || t.category_source === "override") && (
                      <button className={btn2} onClick={() => act(() => deleteOverride(t.id))}>Desfazer</button>
                    )}
                    {!t.excluded && <button className={btn2} onClick={() => act(() => putOverride(t.id, { exclude: true }))}>Excluir</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center gap-3 text-sm">
          <button className={btn2} disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
          <span>Página {page} de {pages} · {tx.data?.total} transações</span>
          <button className={btn2} disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</button>
        </div>
      </Async>
    </>
  );
}
