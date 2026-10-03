"use client";
import { useState } from "react";
import { CategoriesPanel } from "@/components/CategoriesPanel";
import { CategoryPicker } from "@/components/CategoryPicker";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { Async, btn, btn2, EmptyState, iconBtn, input, label, PageHeader, Panel, SkeletonRows } from "@/components/ui";
import { createRule, deleteRule, getCategories, getRules } from "@/lib/api";
import { categoryColor } from "@/lib/colors";
import { catLabel } from "@/lib/format";
import { regexError } from "@/lib/regex";
import { useApi } from "@/lib/useApi";

export default function Regras() {
  const toast = useToast();
  const rules = useApi(getRules);
  const catsApi = useApi(getCategories);
  const cats = catsApi.data ?? [];
  const [pattern, setPattern] = useState("");
  const [cat, setCat] = useState<number | "">("");
  const [priority, setPriority] = useState(100);
  const [saving, setSaving] = useState(false);
  const [confirmar, setConfirmar] = useState<number>();
  const erroRegex = pattern ? regexError(pattern) : null;
  const ordenadas = [...(rules.data ?? [])].sort((a, b) => a.priority - b.priority || a.id - b.id);
  const categoria = (id: number) => cats.find((c) => c.id === id);

  const salvar = async () => {
    setSaving(true);
    try {
      await createRule({ pattern: pattern.trim(), category_id: Number(cat), priority });
      toast("Regra criada. Ela vale para as próximas importações e recategorizações.");
      setPattern("");
      rules.reload();
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
    setSaving(false);
  };
  const excluir = async (id: number) => {
    setConfirmar(undefined);
    try {
      await deleteRule(id);
      toast("Regra excluída");
      rules.reload();
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
  };

  return (
    <>
      <PageHeader title="Regras" subtitle="Categorize automaticamente pela descrição. Quando mais de uma regra casa, vence a de menor prioridade." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
        <Panel title="Nova regra">
          <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); if (!erroRegex && pattern.trim() && cat) salvar(); }}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="padrao" className={label}>Padrão na descrição</label>
              <input id="padrao" className={`${input} ${erroRegex ? "!border-danger" : ""}`} placeholder="mercado|padaria" required autoComplete="off"
                aria-invalid={!!erroRegex} aria-describedby="padrao-ajuda" value={pattern} onChange={(e) => setPattern(e.target.value)} />
              <p id="padrao-ajuda" className={`text-xs ${erroRegex ? "text-danger-text" : "text-muted"}`}>
                {erroRegex ?? "Expressão regular, sem diferenciar maiúsculas. Use | para alternativas."}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="categoria" className={label}>Categoria</label>
              <CategoryPicker id="categoria" categories={cats} value={cat} onChange={setCat} placeholder="Escolha uma categoria" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="prioridade" className={label}>Prioridade</label>
              <input id="prioridade" type="number" min={0} className={`${input} w-28 tabular-nums`} value={priority}
                aria-describedby="prioridade-ajuda" onChange={(e) => setPriority(Number(e.target.value))} />
              <p id="prioridade-ajuda" className="text-xs text-muted">Número menor é avaliado primeiro.</p>
            </div>
            <button className={`${btn} w-full`} disabled={saving || !pattern.trim() || !cat || !!erroRegex}>
              <Icon name="plus" size={16} />{saving ? "Salvando…" : "Adicionar regra"}
            </button>
          </form>
        </Panel>

        <Panel title="Regras ativas" subtitle={rules.data ? `${rules.data.length} ${rules.data.length === 1 ? "regra" : "regras"}, na ordem em que são avaliadas` : undefined} pad={false}>
          <div className="px-5 pb-2 pt-3">
            <Async loading={rules.loading && !rules.data} error={rules.error} onRetry={rules.reload} skeleton={<div className="pb-3"><SkeletonRows rows={4} /></div>}
              empty={ordenadas.length === 0 && (
                <EmptyState icon="rules" title="Nenhuma regra ainda">
                  Crie a primeira ao lado. Ex.: o padrão &quot;academia&quot; na categoria Saúde.
                </EmptyState>
              )}>
              <ul className="divide-y divide-line">
                {ordenadas.map((r) => {
                  const c = categoria(r.category_id);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                      <span className="w-12 shrink-0 text-xs tabular-nums text-muted" title="Prioridade">#{r.priority}</span>
                      <code className="min-w-0 flex-1 truncate rounded-[8px] bg-surface-2 px-2 py-1 font-mono text-[13px] text-ink" title={r.pattern}>{r.pattern}</code>
                      <span className="inline-flex w-40 items-center gap-2 text-sm text-ink-2">
                        <Icon name="right" size={14} className="text-muted" />
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: categoryColor(c) }} />
                        <span className="truncate">{catLabel(c?.name)}</span>
                      </span>
                      {confirmar === r.id ? (
                        <span className="flex items-center gap-1.5">
                          <button className={`${btn2} !h-8 !border-danger/40 !text-danger-text`} onClick={() => excluir(r.id)}>Excluir</button>
                          <button className={`${btn2} !h-8`} onClick={() => setConfirmar(undefined)}>Cancelar</button>
                        </span>
                      ) : (
                        <button className={`${iconBtn} hover:!text-danger`} aria-label={`Excluir regra ${r.pattern}`} onClick={() => setConfirmar(r.id)}>
                          <Icon name="trash" size={16} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Async>
          </div>
        </Panel>
      </div>
      <div className="mt-6">
        <CategoriesPanel categories={cats} onChange={catsApi.reload} />
      </div>
    </>
  );
}
