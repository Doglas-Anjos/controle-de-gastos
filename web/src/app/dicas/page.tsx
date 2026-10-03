"use client";
import { useState } from "react";
import { askQuestion, getHealth, getInsights } from "@/lib/api";
import { Async, btn, input, Title } from "@/components/Async";
import { formatBRL } from "@/lib/format";
import type { AnswerOut, InsightsOut } from "@/lib/types";
import { useApi } from "@/lib/useApi";

// Estado simples de uma acao disparada por botao.
function useAction<A extends unknown[], R>(fn: (...a: A) => Promise<R>) {
  const [s, set] = useState<{ data?: R; error?: string; loading: boolean }>({ loading: false });
  const run = (...a: A) => {
    set({ loading: true });
    fn(...a).then((data) => set({ data, loading: false }), (e: Error) => set({ error: e.message, loading: false }));
  };
  return { ...s, run };
}

export default function Dicas() {
  const health = useApi(getHealth).data;
  const ins = useAction<[], InsightsOut>(getInsights);
  const ans = useAction<[string], AnswerOut>(askQuestion);
  const [pergunta, setPergunta] = useState("");

  return (
    <>
      <Title>Dicas</Title>
      {health && !health.openai && (
        <p className="mb-4 rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          A OpenAI não está configurada. Defina <code>OPENAI_API_KEY</code> no arquivo <code>.env</code> da API e reinicie o servidor para gerar dicas e fazer perguntas.
        </p>
      )}
      <button className={btn} disabled={ins.loading} onClick={() => ins.run()}>{ins.loading ? "Gerando…" : "Gerar dicas"}</button>
      <div className="mt-4">
        <Async loading={false} error={ins.error}>
          {ins.data && (
            <div className="space-y-4">
              <p>{ins.data.resumo}</p>
              {ins.data.alertas.length > 0 && (
                <ul className="space-y-1">
                  {ins.data.alertas.map((a, i) => <li key={i} className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">{a}</li>)}
                </ul>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {ins.data.dicas.map((d, i) => (
                  <div key={i} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                    <div className="font-medium">{d.titulo}</div>
                    {d.categoria && <div className="text-xs text-zinc-500">{d.categoria}</div>}
                    <p className="mt-1 text-sm">{d.acao}</p>
                    <div className="mt-2 text-xs text-zinc-500">
                      {d.economia_estimada_mensal !== null && <>Economia estimada: {formatBRL(d.economia_estimada_mensal)}/mês · </>}
                      Confiança: {Math.round(d.confianca * 100)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Async>
      </div>
      <form className="mt-8 flex gap-2" onSubmit={(e) => { e.preventDefault(); ans.run(pergunta); }}>
        <input className={input + " flex-1"} placeholder="Pergunte sobre seus gastos…" minLength={3} maxLength={2000}
          value={pergunta} onChange={(e) => setPergunta(e.target.value)} />
        <button className={btn} disabled={ans.loading || pergunta.trim().length < 3}>{ans.loading ? "Pensando…" : "Perguntar"}</button>
      </form>
      <div className="mt-4">
        <Async loading={false} error={ans.error}>{ans.data && <p className="whitespace-pre-wrap">{ans.data.resposta}</p>}</Async>
      </div>
    </>
  );
}
