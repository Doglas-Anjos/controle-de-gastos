"use client";
import { useEffect, useRef, useState } from "react";
import { AcoesList, CatalogarPanel } from "@/components/Catalogar";
import { Icon } from "@/components/Icon";
import { btn, btn2, Chip, ErrorBox, input, Meter, PageHeader, Panel, Skeleton } from "@/components/ui";
import { ApiError, askQuestion, getHealth, getInsights, getSummary } from "@/lib/api";
import { catLabel, formatBRL } from "@/lib/format";
import type { Action, InsightsOut } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const VAI = ["Totais por categoria e por mês", "Lista das suas categorias", "Descrições normalizadas (sem números) de comerciantes e dos lançamentos sem categoria", "Recorrências, previsão e gastos fora do padrão"];
const NAO_VAI = ["Descrição original das transações", "Dados de conta, cartão ou banco", "Identificadores do Open Finance", "Seu nome ou documentos"];
const SUGESTOES = ["Onde mais posso economizar?", "Quanto gasto por mês com assinaturas?", "Organize meus lançamentos sem categoria", "Crie uma categoria para pets"];

const msgErro = (e: unknown) =>
  e instanceof ApiError && e.status === 409 ? "A OpenAI não está configurada na API. Veja as instruções acima." : (e as Error).message;

type Msg = { id: number; q: string; a?: string; acoes?: Action[]; error?: string };

function OpenAIOff() {
  return (
    <Panel className="mb-6">
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-warn-soft text-warn-text"><Icon name="lock" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-ink">OpenAI não configurada</h2>
          <p className="mt-1 max-w-[65ch] text-sm text-ink-2">
            Para gerar dicas e fazer perguntas, defina <code className="rounded-[6px] bg-surface-2 px-1.5 py-0.5 text-[13px]">OPENAI_API_KEY</code> no
            arquivo <code className="rounded-[6px] bg-surface-2 px-1.5 py-0.5 text-[13px]">.env</code> da API e reinicie o servidor. O restante do app funciona sem ela.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function Privacidade({ onGerar, disabled, loading }: { onGerar: () => void; disabled: boolean; loading: boolean }) {
  return (
    <Panel>
      <div className="grid gap-6 md:grid-cols-[1fr_1fr_auto] md:items-start">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="check" size={16} className="text-accent" />O que vai para a OpenAI</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-2">{VAI.map((v) => <li key={v}>{v}</li>)}</ul>
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="lock" size={16} className="text-muted" />O que nunca sai daqui</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-2">{NAO_VAI.map((v) => <li key={v}>{v}</li>)}</ul>
        </div>
        <button className={btn} disabled={disabled} onClick={onGerar}>
          <Icon name="sparkle" size={16} />{loading ? "Gerando dicas…" : "Gerar dicas"}
        </button>
      </div>
    </Panel>
  );
}

function Resultado({ ins }: { ins: InsightsOut }) {
  const dicas = [...ins.dicas].sort((a, b) => (b.economia_estimada_mensal ?? 0) - (a.economia_estimada_mensal ?? 0));
  const economia = dicas.reduce((s, d) => s + (d.economia_estimada_mensal ?? 0), 0);
  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex flex-wrap items-start gap-6">
          <p className="min-w-0 max-w-[65ch] flex-1 leading-relaxed text-ink">{ins.resumo}</p>
          {economia > 0 && (
            <div className="rounded-[12px] bg-accent-soft px-4 py-3">
              <div className="text-xs text-accent-text">Economia possível</div>
              <div className="text-xl font-semibold tracking-tight text-accent-text">{formatBRL(economia)}<span className="text-sm font-normal">/mês</span></div>
            </div>
          )}
        </div>
      </Panel>

      {ins.alertas.length > 0 && (
        <Panel title="Alertas">
          <ul className="space-y-2.5">
            {ins.alertas.map((a, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-ink-2">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] bg-danger-soft text-danger-text"><Icon name="alert" size={14} /></span>
                {a}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {dicas.map((d, i) => (
          <article key={i} className="flex flex-col rounded-[14px] border border-line bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[15px] font-semibold text-ink">{d.titulo}</h3>
              {d.categoria && <Chip>{catLabel(d.categoria)}</Chip>}
            </div>
            {d.economia_estimada_mensal !== null && d.economia_estimada_mensal > 0 && (
              <div className="mt-3 text-2xl font-semibold tracking-tight text-accent-text">
                {formatBRL(d.economia_estimada_mensal)}<span className="ml-1 text-sm font-normal text-muted">por mês</span>
              </div>
            )}
            <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-2">{d.acao}</p>
            <div className="mt-4 flex items-center gap-3 text-xs text-muted">
              <span className="shrink-0">Confiança</span>
              <Meter value={d.confianca} tone={d.confianca >= 0.6 ? "accent" : "warn"} label={`Confiança ${Math.round(d.confianca * 100)}%`} />
              <span className="w-9 shrink-0 text-right tabular-nums">{Math.round(d.confianca * 100)}%</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Chat({ disabled, onAplicado }: { disabled: boolean; onAplicado?: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ block: "nearest" }); }, [msgs]);

  const perguntar = async (q: string) => {
    q = q.trim();
    if (q.length < 3 || pensando) return;
    const id = Date.now();
    setMsgs((m) => [...m, { id, q }]);
    setTexto("");
    setPensando(true);
    try {
      const r = await askQuestion(q);
      setMsgs((m) => m.map((x) => (x.id === id ? { ...x, a: r.resposta, acoes: r.acoes } : x)));
    } catch (e) {
      setMsgs((m) => m.map((x) => (x.id === id ? { ...x, error: msgErro(e) } : x)));
    }
    setPensando(false);
  };

  return (
    <Panel title="Pergunte sobre seus gastos" subtitle="Peça também para criar categorias ou organizar lançamentos: a IA propõe e você aprova. O histórico fica só nesta aba.">
      {msgs.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {SUGESTOES.map((s) => (
            <button key={s} className={btn2} disabled={disabled} onClick={() => perguntar(s)}>{s}</button>
          ))}
        </div>
      ) : (
        <div className="max-h-[420px] space-y-4 overflow-y-auto pr-1" aria-live="polite">
          {msgs.map((m) => (
            <div key={m.id} className="space-y-2">
              <div className="ml-auto w-fit max-w-[85%] rounded-[14px] rounded-br-[4px] bg-accent px-3.5 py-2 text-sm text-accent-ink">{m.q}</div>
              {m.a ? (
                <>
                  <div className="w-fit max-w-[85%] whitespace-pre-wrap rounded-[14px] rounded-bl-[4px] bg-surface-2 px-3.5 py-2 text-sm leading-relaxed text-ink">{m.a}</div>
                  {m.acoes && m.acoes.length > 0 && <div className="max-w-[85%]"><AcoesList acoes={m.acoes} onAplicado={onAplicado} /></div>}
                </>
              ) : m.error ? (
                <div className="w-fit max-w-[85%] rounded-[14px] rounded-bl-[4px] bg-danger-soft px-3.5 py-2 text-sm text-danger-text">{m.error}</div>
              ) : (
                <div className="w-48 space-y-2 rounded-[14px] bg-surface-2 p-3" aria-label="Pensando"><Skeleton className="h-2.5" /><Skeleton className="h-2.5 w-2/3" /></div>
              )}
            </div>
          ))}
          <div ref={fim} />
        </div>
      )}
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); perguntar(texto); }}>
        <label className="sr-only" htmlFor="pergunta">Sua pergunta</label>
        <input id="pergunta" className={`${input} min-w-0 flex-1`} placeholder="Ex.: quanto gastei com transporte este ano?"
          minLength={3} maxLength={2000} disabled={disabled} value={texto} onChange={(e) => setTexto(e.target.value)} />
        <button className={btn} aria-label="Enviar pergunta" disabled={disabled || pensando || texto.trim().length < 3}>
          <Icon name="send" size={16} /><span className="hidden sm:inline">Perguntar</span>
        </button>
      </form>
    </Panel>
  );
}

export default function Dicas() {
  const health = useApi(getHealth).data;
  const off = health ? !health.openai : false;
  const sum = useApi(() => getSummary(12));
  const [ins, setIns] = useState<{ data?: InsightsOut; error?: string; loading: boolean }>({ loading: false });
  const gerar = () => {
    setIns((s) => ({ data: s.data, loading: true }));
    getInsights().then((data) => setIns({ data, loading: false }), (e) => setIns({ error: msgErro(e), loading: false }));
  };

  return (
    <>
      <PageHeader title="Dicas" subtitle="Sugestões de economia geradas por IA a partir de um resumo agregado dos seus gastos."
        actions={ins.data && (
          <>
            <span className="text-xs text-muted">{ins.data.cache ? "Do cache, " : "Gerado "}em {new Date(ins.data.gerado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
            <button className={btn2} disabled={ins.loading || off} onClick={gerar}><Icon name="refresh" size={16} />{ins.loading ? "Gerando…" : "Gerar de novo"}</button>
          </>
        )} />
      {off && <OpenAIOff />}
      <div className="space-y-6">
        {ins.error && <ErrorBox message={ins.error} onRetry={off ? undefined : gerar} />}
        {ins.data ? <Resultado ins={ins.data} /> : ins.loading ? (
          <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}</div>
        ) : <Privacidade onGerar={gerar} disabled={off || ins.loading} loading={ins.loading} />}
        <CatalogarPanel disabled={off} pendentes={sum.data?.uncategorized} onAplicado={sum.reload} />
        <Chat disabled={off} onAplicado={sum.reload} />
      </div>
    </>
  );
}
