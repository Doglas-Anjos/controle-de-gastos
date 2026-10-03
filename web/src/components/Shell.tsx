"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { getHealth } from "@/lib/api";
import { useApi } from "@/lib/useApi";

export const NAV = [
  ["/", "Visão geral"], ["/transacoes", "Transações"], ["/recorrencias", "Recorrências"],
  ["/previsao", "Previsão"], ["/dicas", "Dicas"], ["/importar", "Importar"], ["/regras", "Regras"],
] as const;

function Dot({ on, label }: { on?: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${on ? "bg-green-500" : "bg-zinc-400"}`} />
      {label}: {on ? "configurado" : "não configurado"}
    </li>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data: h, error } = useApi(getHealth);
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-52 shrink-0 flex-col gap-4 border-r border-zinc-200 p-4 dark:border-zinc-800">
        <div className="text-lg font-semibold">Controle de Gastos</div>
        <nav className="flex flex-col gap-1">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href}
              className={`rounded px-2 py-1.5 text-sm ${path === href ? "bg-blue-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
              {label}
            </Link>
          ))}
        </nav>
        <ul className="mt-auto space-y-1 text-xs text-zinc-500">
          {error ? <li>API fora do ar</li> : <><Dot on={h?.pluggy} label="Pluggy" /><Dot on={h?.openai} label="OpenAI" /></>}
        </ul>
      </aside>
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
