"use client";
import { useState } from "react";
import { aplicarAcoes, catalogar } from "@/lib/api";
import { catLabel, formatBRL, merchantLabel } from "@/lib/format";
import type { Action, CatalogOut } from "@/lib/types";
import { Icon } from "./Icon";
import { useToast } from "./Toast";
import { btn, btn2, Chip, ErrorBox, Meter, Panel, Skeleton } from "./ui";

const KIND: Record<string, string> = { fixo: "gasto fixo", variavel: "gasto variável", receita: "entrada", transferencia: "entre contas" };

// Uma proposta do modelo, do jeito que o usuario decide: o que muda, para onde e por que.
export function AcaoCard({ acao, marcada, onToggle }: { acao: Action; marcada?: boolean; onToggle?: () => void }) {
  const nova = acao.tipo === "criar_categoria";
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-[12px] border px-3 py-2.5 text-sm transition-colors ${marcada ? "border-accent/50 bg-accent-soft/40" : "border-line bg-surface hover:bg-surface-2"}`}>
      {onToggle && <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={!!marcada} onChange={onToggle} aria-label={nova ? `Criar categoria ${acao.nome}` : `Categorizar ${acao.descricao}`} />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {nova ? (
            <>
              <Chip tone="accent"><Icon name="plus" size={11} />Nova categoria</Chip>
              <span className="font-medium text-ink">{acao.nome}</span>
              <span className="text-muted">{acao.mae ? `dentro de ${catLabel(acao.mae)}` : KIND[acao.kind ?? ""] ?? acao.kind}</span>
            </>
          ) : (
            <>
              <span className="min-w-0 truncate font-medium text-ink" title={acao.descricao ?? ""}>{merchantLabel(acao.descricao ?? "")}</span>
              <Icon name="right" size={14} className="shrink-0 text-muted" />
              <span className="text-ink">{catLabel(acao.categoria)}</span>
            </>
          )}
        </div>
        {acao.motivo && <p className="mt-1 text-xs leading-relaxed text-ink-2">{acao.motivo}</p>}
      </div>
      <span className="flex w-24 shrink-0 items-center gap-2 pt-1 text-xs text-muted" title={`Confiança ${Math.round(acao.confianca * 100)}%`}>
        <Meter value={acao.confianca} tone={acao.confianca >= 0.6 ? "accent" : "warn"} label={`Confiança ${Math.round(acao.confianca * 100)}%`} />
        <span className="w-8 text-right tabular-nums">{Math.round(acao.confianca * 100)}%</span>
      </span>
    </label>
  );
}

// Lista com selecao e botao de aplicar; usada no chat e no painel de catalogacao.
export function AcoesList({ acoes, onAplicado }: { acoes: Action[]; onAplicado?: () => void }) {
  const toast = useToast();
  const [marcadas, setMarcadas] = useState<Set<number>>(() => new Set(acoes.map((a, i) => (a.confianca >= 0.6 ? i : -1)).filter((i) => i >= 0)));
  const [busy, setBusy] = useState(false);
  const [feito, setFeito] = useState(false);
  const toggle = (i: number) => setMarcadas((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const aplicar = async () => {
    setBusy(true);
    try {
      const r = await aplicarAcoes(acoes.filter((_, i) => marcadas.has(i)));
      const partes = [r.categorias_criadas && `${r.categorias_criadas} ${r.categorias_criadas === 1 ? "categoria criada" : "categorias criadas"}`,
        r.regras_criadas && `${r.regras_criadas} ${r.regras_criadas === 1 ? "regra criada" : "regras criadas"}`].filter(Boolean);
      toast(partes.length ? partes.join(", ") : "Nada a aplicar", { tone: r.ignoradas.length ? "error" : "ok" });
      if (r.ignoradas.length) toast(`Ignoradas: ${r.ignoradas.join("; ")}`, { tone: "error" });
      setFeito(true);
      onAplicado?.();
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
    setBusy(false);
  };
  if (!acoes.length) return null;
  return (
    <div className="space-y-2">
      {acoes.map((a, i) => <AcaoCard key={i} acao={a} marcada={!feito && marcadas.has(i)} onToggle={feito ? undefined : () => toggle(i)} />)}
      {feito ? (
        <p className="flex items-center gap-2 text-sm text-accent-text"><Icon name="check" size={16} />Aplicado. As regras valem para o passado e para as próximas importações.</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted">{marcadas.size} de {acoes.length} selecionadas · desmarque o que não concorda</span>
          <div className="flex gap-2">
            <button className={btn2} disabled={busy} onClick={() => setMarcadas(new Set(acoes.map((_, i) => i)))}>Marcar todas</button>
            <button className={btn} disabled={busy || marcadas.size === 0} onClick={aplicar}><Icon name="check" size={16} />{busy ? "Aplicando…" : `Aplicar ${marcadas.size}`}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Painel "catalogar com IA": pede sugestoes para os lancamentos sem categoria e deixa o usuario aprovar.
export function CatalogarPanel({ disabled, pendentes, onAplicado }: { disabled: boolean; pendentes?: { count: number; total: number }; onAplicado?: () => void }) {
  const [st, setSt] = useState<{ data?: CatalogOut; error?: string; loading: boolean }>({ loading: false });
  const pedir = (forcar = false) => {
    setSt({ loading: true });
    catalogar(forcar).then((data) => setSt({ data, loading: false }), (e) => setSt({ error: (e as Error).message, loading: false }));
  };
  const sub = pendentes && pendentes.count > 0
    ? `${pendentes.count} ${pendentes.count === 1 ? "lançamento" : "lançamentos"} sem categoria somam ${formatBRL(pendentes.total)}. A IA recebe só a descrição normalizada de cada grupo e sugere a categoria; nada muda sem a sua aprovação.`
    : "A IA recebe só a descrição normalizada de cada grupo sem categoria e sugere onde encaixar; nada muda sem a sua aprovação.";
  return (
    <Panel title="Catalogar com IA" subtitle={sub}
      actions={st.data && <button className={btn2} disabled={disabled || st.loading} onClick={() => pedir(true)}><Icon name="refresh" size={16} />Sugerir de novo</button>}>
      {st.error && <ErrorBox message={st.error} onRetry={() => pedir()} />}
      {st.loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : st.data ? (
        st.data.sugestoes.length ? <AcoesList key={st.data.gerado_em} acoes={st.data.sugestoes} onAplicado={onAplicado} />
          : <p className="text-sm text-ink-2">Nada pendente: todos os lançamentos já têm categoria.</p>
      ) : (
        <button className={btn} disabled={disabled} onClick={() => pedir()}><Icon name="sparkle" size={16} />Sugerir categorias</button>
      )}
    </Panel>
  );
}
