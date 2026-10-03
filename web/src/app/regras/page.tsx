"use client";
import { useState } from "react";
import { Async, btn, btn2, input, Title } from "@/components/Async";
import { createRule, deleteRule, getCategories, getRules } from "@/lib/api";
import { useApi } from "@/lib/useApi";

export default function Regras() {
  const rules = useApi(getRules);
  const cats = useApi(getCategories).data ?? [];
  const [pattern, setPattern] = useState("");
  const [cat, setCat] = useState("");
  const [priority, setPriority] = useState(100);
  const [err, setErr] = useState<string>();
  const nome = (id: number) => cats.find((c) => c.id === id)?.name ?? "—";

  const act = (fn: () => Promise<unknown>) => fn().then(() => { setErr(undefined); rules.reload(); }, (e: Error) => setErr(e.message));

  return (
    <>
      <Title>Regras</Title>
      <form className="mb-4 flex flex-wrap gap-2" onSubmit={(e) => {
        e.preventDefault();
        act(() => createRule({ pattern, category_id: Number(cat), priority })).then(() => setPattern(""));
      }}>
        <input className={input} placeholder="Padrão (ex.: mercado)" required value={pattern} onChange={(e) => setPattern(e.target.value)} />
        <select className={input} required value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Categoria…</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className={input + " w-24"} type="number" aria-label="Prioridade" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
        <button className={btn}>Adicionar regra</button>
      </form>
      {err && <p role="alert" className="mb-2 text-sm text-red-600">{err}</p>}
      <Async loading={rules.loading} error={rules.error} empty={rules.data?.length === 0 && "Nenhuma regra cadastrada."}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-zinc-500"><tr><th className="p-2">Padrão</th><th>Categoria</th><th>Prioridade</th><th /></tr></thead>
          <tbody>
            {rules.data?.map((r) => (
              <tr key={r.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="p-2">{r.pattern}</td><td>{nome(r.category_id)}</td><td>{r.priority}</td>
                <td className="text-right"><button className={btn2} onClick={() => act(() => deleteRule(r.id))}>Excluir</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Async>
    </>
  );
}
