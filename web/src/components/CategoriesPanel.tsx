"use client";
import { useState } from "react";
import { createCategory, deleteCategory } from "@/lib/api";
import { catLabel } from "@/lib/format";
import type { CategoryOut } from "@/lib/types";
import { CategoryDot, CategoryPicker } from "./CategoryPicker";
import { Icon } from "./Icon";
import { useToast } from "./Toast";
import { btn, btn2, iconBtn, input, label, Panel } from "./ui";

const KINDS = [
  { key: "variavel", label: "Gasto variável" },
  { key: "fixo", label: "Gasto fixo" },
  { key: "receita", label: "Entrada" },
  { key: "transferencia", label: "Entre suas contas" },
];
const SEM = "Sem categoria";

// Cria e apaga categorias (um nivel de subcategoria). A API recusa apagar o que esta em uso: a tela so
// repassa a mensagem, sem tentar adivinhar antes.
export function CategoriesPanel({ categories, onChange }: { categories: CategoryOut[]; onChange: () => void }) {
  const toast = useToast();
  const [nome, setNome] = useState("");
  const [kind, setKind] = useState("variavel");
  const [mae, setMae] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [confirmar, setConfirmar] = useState<number>();
  const tops = categories.filter((c) => c.parent_id === null && c.name !== SEM);
  const filhas = (id: number) => categories.filter((c) => c.parent_id === id).sort((a, b) => a.name.localeCompare(b.name));

  const criar = async () => {
    setSaving(true);
    try {
      await createCategory(mae ? { name: nome.trim(), parent_id: mae } : { name: nome.trim(), kind });
      toast(`Categoria ${nome.trim()} criada`);
      setNome("");
      onChange();
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
    setSaving(false);
  };
  const apagar = async (c: CategoryOut) => {
    setConfirmar(undefined);
    try {
      await deleteCategory(c.id);
      toast(`Categoria ${catLabel(c.name)} excluída`);
      onChange();
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
  };

  const Linha = ({ c, sub }: { c: CategoryOut; sub?: CategoryOut }) => (
    <li className={`flex items-center gap-2 py-1.5 ${sub ? "pl-8" : ""}`}>
      <CategoryDot category={c} parent={sub} size={sub ? 18 : 22} />
      <span className={`min-w-0 flex-1 truncate text-sm ${sub ? "text-ink-2" : "font-medium text-ink"}`}>{catLabel(c.name)}</span>
      {confirmar === c.id ? (
        <span className="flex items-center gap-1.5 text-xs">
          <button className={`${btn2} !h-7 !border-danger/40 !text-danger-text`} onClick={() => apagar(c)}>Excluir</button>
          <button className={`${btn2} !h-7`} onClick={() => setConfirmar(undefined)}>Cancelar</button>
        </span>
      ) : (
        <button className={`${iconBtn} hover:!text-danger`} aria-label={`Excluir categoria ${catLabel(c.name)}`} onClick={() => setConfirmar(c.id)}>
          <Icon name="trash" size={15} />
        </button>
      )}
    </li>
  );

  return (
    <Panel title="Suas categorias" subtitle="Crie subcategorias para quebrar um tipo de gasto (ex.: Investimentos em Renda fixa e Cripto). Uma categoria em uso não pode ser excluída.">
      <form className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_220px_auto] sm:items-end" noValidate onSubmit={(e) => { e.preventDefault(); if (nome.trim()) criar(); }}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cat-nome" className={label}>Nome</label>
          <input id="cat-nome" className={input} placeholder="Academia" value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cat-mae" className={label}>Dentro de</label>
          <CategoryPicker id="cat-mae" categories={tops} value={mae} onChange={setMae} allLabel="Nenhuma (principal)" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cat-kind" className={label}>Tipo</label>
          <select id="cat-kind" className={input} value={mae ? tops.find((c) => c.id === mae)?.kind ?? kind : kind} disabled={!!mae}
            title={mae ? "Subcategoria herda o tipo da categoria-mãe" : undefined} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </div>
        <button className={btn} disabled={saving || !nome.trim()}><Icon name="plus" size={16} />Criar</button>
      </form>

      <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
        {KINDS.map((k) => {
          const do_kind = tops.filter((c) => c.kind === k.key).sort((a, b) => a.name.localeCompare(b.name));
          if (!do_kind.length) return null;
          return (
            <div key={k.key}>
              <div className="pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">{k.label}</div>
              <ul className="divide-y divide-line/60">
                {do_kind.map((c) => (
                  <li key={c.id}>
                    <ul>
                      <Linha c={c} />
                      {filhas(c.id).map((f) => <Linha key={f.id} c={f} sub={c} />)}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
