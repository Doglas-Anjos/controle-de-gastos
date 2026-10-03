import type { ReactNode } from "react";

// Padroniza carregando/erro/vazio; a API fora do ar vira aviso, nunca excecao.
export function Async({ loading, error, empty, children }: {
  loading: boolean; error?: string; empty?: boolean | string; children: ReactNode
}) {
  if (error) return <p role="alert" className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{error}</p>;
  if (loading) return <p className="text-sm text-zinc-500">Carregando…</p>;
  if (empty) return <p className="text-sm text-zinc-500">{typeof empty === "string" ? empty : "Nada por aqui ainda."}</p>;
  return <>{children}</>;
}

export const Title = ({ children }: { children: ReactNode }) => <h1 className="mb-4 text-2xl font-semibold">{children}</h1>;

export function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="text-xs uppercase text-zinc-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

export const btn = "rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50";
export const btn2 = "rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";
export const input = "rounded border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700";
