"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { categoryColor } from "@/lib/colors";
import { catLabel } from "@/lib/format";
import type { CategoryOut } from "@/lib/types";
import { Icon, type IconName } from "./Icon";
import { input } from "./ui";

const SEM = "Sem categoria";
const ICONE: Record<string, IconName> = {
  Moradia: "home", "Contas e servicos": "bolt", Assinaturas: "film", Alimentacao: "food", Mercado: "cart",
  Transporte: "car", Saude: "heart", Educacao: "book", Lazer: "smile", Compras: "tag", Viagem: "plane",
  "Impostos e taxas": "receipt", Emprestimos: "percent", Investimentos: "coins", "Renda fixa": "receipt", "Renda variavel": "trend", Cripto: "bitcoin",
  Transferencia: "swap", Receita: "wallet", Salario: "briefcase", Bolsa: "cap", [SEM]: "question",
};
// Subcategoria sem icone proprio usa o da mae; categoria do usuario sem mae cai no generico.
export const categoryIcon = (name?: string | null, parent?: string | null): IconName =>
  (name && ICONE[name]) || (parent && ICONE[parent]) || "tag";

// Ordem e nomes dos grupos no menu. "Sem categoria" vem antes de todos: e o que o usuario precisa resolver.
const GRUPOS = [
  { kind: "fixo", label: "Gastos fixos" },
  { kind: "variavel", label: "Gastos variáveis" },
  { kind: "receita", label: "Entradas" },
  { kind: "transferencia", label: "Entre suas contas" },
];

// Icone da categoria num circulo com a cor dela (a mesma dos graficos), para reconhecer sem ler.
export function CategoryDot({ category, parent, size = 22 }: { category: CategoryOut | null | undefined; parent?: CategoryOut | null; size?: number }) {
  const cor = category && category.name !== SEM ? categoryColor(category) : "var(--series-other)";
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, color: cor, background: `color-mix(in srgb, ${cor} 16%, transparent)` }}>
      <Icon name={categoryIcon(category?.name, parent?.name)} size={Math.round(size * 0.6)} />
    </span>
  );
}

type Opcao = CategoryOut | null; // null = "todas"
const porNome = (a: CategoryOut, b: CategoryOut) => a.name.localeCompare(b.name);

// Categorias de um kind na ordem de exibicao: cada mae seguida das filhas (um nivel).
function arvore(categorias: CategoryOut[], kind: string): CategoryOut[] {
  const do_kind = categorias.filter((c) => c.kind === kind && c.name !== SEM);
  const filhas = (id: number) => do_kind.filter((c) => c.parent_id === id).sort(porNome);
  return do_kind.filter((c) => c.parent_id === null || !do_kind.some((p) => p.id === c.parent_id)).sort(porNome).flatMap((m) => [m, ...filhas(m.id)]);
}

// Substitui o <select> nativo, que nao aceita icone nem cor nas opcoes. Menu em position:fixed para nao
// ser cortado pela tabela com overflow; fecha ao rolar, clicar fora ou Escape. Setas + Enter navegam.
export function CategoryPicker({ categories, value, onChange, allLabel, placeholder, id, ariaLabel, disabled, compact }: {
  categories: CategoryOut[]; value: number | ""; onChange: (id: number | "") => void;
  allLabel?: string; placeholder?: string; id?: string; ariaLabel?: string; disabled?: boolean; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [foco, setFoco] = useState(0);
  const [pos, setPos] = useState({ top: 0, left: 0, acima: false });
  const root = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const listId = useId();
  const porId = new Map(categories.map((c) => [c.id, c]));
  const mae = (c: CategoryOut | null | undefined) => (c?.parent_id != null ? porId.get(c.parent_id) : undefined);
  const atual = porId.get(value as number);
  const grupos = [
    ...(allLabel ? [{ label: "", itens: [null] as Opcao[] }] : []),
    { label: "Pendente", itens: categories.filter((c) => c.name === SEM) as Opcao[] },
    ...GRUPOS.map((g) => ({ label: g.label, itens: arvore(categories, g.kind) as Opcao[] })),
  ].filter((g) => g.itens.length);
  const planos = grupos.flatMap((g) => g.itens);

  const abrir = () => {
    const r = root.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, acima: window.innerHeight - r.bottom < 340 });
    setFoco(Math.max(0, planos.findIndex((c) => (c?.id ?? "") === value)));
    setOpen(true);
  };
  const escolher = (c: Opcao) => { onChange(c ? c.id : ""); setOpen(false); };
  useEffect(() => {
    if (!open) return;
    const fora = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    // Rolagem da pagina desalinha o menu fixo, entao ele fecha; rolagem dentro da propria lista nao.
    const rolou = (e: Event) => { if (!lista.current?.contains(e.target as Node)) setOpen(false); };
    const fechar = () => setOpen(false);
    document.addEventListener("mousedown", fora);
    window.addEventListener("scroll", rolou, true);
    window.addEventListener("resize", fechar);
    return () => { document.removeEventListener("mousedown", fora); window.removeEventListener("scroll", rolou, true); window.removeEventListener("resize", fechar); };
  }, [open]);
  // Opcao focada pelo teclado entra na area visivel da lista (no hover ja esta visivel: nao rola).
  useEffect(() => {
    if (open) lista.current?.querySelector<HTMLElement>('[data-foco="true"]')?.scrollIntoView?.({ block: "nearest" }); // jsdom nao implementa
  }, [open, foco]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (!open) { if (["ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); abrir(); } return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setFoco((f) => Math.min(planos.length - 1, f + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFoco((f) => Math.max(0, f - 1)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); escolher(planos[foco]); }
  };

  const texto = atual ? catLabel(atual.name) : allLabel ?? placeholder ?? SEM;
  const estilo = compact
    ? "flex h-8 w-full min-w-0 items-center gap-2 rounded-[8px] border border-transparent px-1.5 text-sm text-ink transition-colors duration-150 hover:border-line hover:bg-surface focus:border-accent focus:outline-none disabled:opacity-60"
    : `${input} flex w-full min-w-0 items-center gap-2 text-left`;
  return (
    <div ref={root} className="relative min-w-0" onKeyDown={onKey}>
      <button type="button" id={id} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        disabled={disabled} className={estilo} onClick={() => (open ? setOpen(false) : abrir())}>
        {atual || !allLabel ? <CategoryDot category={atual} parent={mae(atual)} size={20} /> : <Icon name="list" size={16} className="text-muted" />}
        <span className={`flex-1 truncate ${!atual && placeholder ? "text-muted" : ""}`}>
          {texto}{mae(atual) && <span className="text-muted"> · {catLabel(mae(atual)!.name)}</span>}
        </span>
        <Icon name="down" size={14} className="shrink-0 text-muted" />
      </button>
      {open && (
        <ul ref={lista} role="listbox" id={listId} aria-label={ariaLabel} style={{ top: pos.acima ? undefined : pos.top, bottom: pos.acima ? window.innerHeight - pos.top + 40 : undefined, left: pos.left }}
          className="fixed z-40 max-h-80 w-64 overflow-auto rounded-[12px] border border-line bg-surface p-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.35)]">
          {grupos.map((g) => (
            <li key={g.label || "todas"} role="presentation">
              {g.label && <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">{g.label}</div>}
              <ul role="group" aria-label={g.label || undefined}>
                {g.itens.map((c) => {
                  const i = planos.indexOf(c);
                  const sel = (c?.id ?? "") === value;
                  const sub = mae(c);
                  return (
                    <li key={c?.id ?? "todas"} role="option" aria-selected={sel} data-foco={i === foco} onMouseEnter={() => setFoco(i)} onClick={() => escolher(c)}
                      className={`flex cursor-pointer items-center gap-2 rounded-[8px] py-1.5 pr-2 text-sm ${sub ? "pl-7" : "pl-2"} ${i === foco ? "bg-surface-2" : ""} ${sel ? "font-medium text-ink" : "text-ink-2"}`}>
                      {c ? <CategoryDot category={c} parent={sub} size={sub ? 18 : 22} /> : <span className="inline-flex h-[22px] w-[22px] items-center justify-center text-muted"><Icon name="list" size={14} /></span>}
                      <span className="flex-1 truncate">{c ? catLabel(c.name) : allLabel}</span>
                      {sel && <Icon name="check" size={14} className="text-accent-text" />}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
