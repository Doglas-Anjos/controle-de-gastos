"use client";
import { Async, Title } from "@/components/Async";
import { ForecastArea } from "@/components/Charts";
import { getForecast } from "@/lib/api";
import { formatBRL, formatMonth } from "@/lib/format";
import { useApi } from "@/lib/useApi";

export default function Previsao() {
  const { data, loading, error } = useApi(() => getForecast(3));
  return (
    <>
      <Title>Previsão</Title>
      <Async loading={loading} error={error} empty={!data || data.lines.length === 0}>
        {data && (
          <div className="space-y-6">
            <ForecastArea forecast={data} />
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-zinc-500">
                <tr><th className="p-2">Mês</th><th>Categoria</th><th className="text-right">Previsto</th><th className="text-right">Faixa</th><th className="pl-4">Método</th></tr>
              </thead>
              <tbody>
                {data.lines.map((l, i) => (
                  <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="p-2">{formatMonth(l.month)}</td>
                    <td>{l.category?.name ?? "Sem categoria"}</td>
                    <td className="text-right">{formatBRL(l.amount)}</td>
                    <td className="text-right text-zinc-500">{formatBRL(l.low)} – {formatBRL(l.high)}</td>
                    <td className="pl-4">{l.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>
    </>
  );
}
