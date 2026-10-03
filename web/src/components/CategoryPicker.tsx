"use client";
import { categoryColor } from "@/lib/colors";
import { catLabel } from "@/lib/format";
import type { CategoryOut } from "@/lib/types";
import { Icon, type IconName } from "./Icon";
import { Picker, TodasIcon, type PickerGroup, type PickerItem } from "./Picker";

const SEM = "Sem categoria";
const ICONE: Record<string, IconName> = {
  Moradia: "home", "Contas e servicos": "bolt", Assinaturas: "film", Alimentacao: "food", Mercado: "cart",
  Locomocao: "car", Aplicativos: "phone", Combustivel: "fuel", "Estacionamento e pedagio": "parking",
  "Transporte publico": "bus", "Manutencao do carro": "wrench", Saude: "heart", Educacao: "book", Lazer: "smile", Compras: "tag", Viagem: "plane",
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

const porNome = (a: CategoryOut, b: CategoryOut) => a.name.localeCompare(b.name);

// Categorias de um kind na ordem de exibicao: cada mae seguida das filhas (um nivel).
function arvore(categorias: CategoryOut[], kind: string): CategoryOut[] {
  const do_kind = categorias.filter((c) => c.kind === kind && c.name !== SEM);
  const filhas = (id: number) => do_kind.filter((c) => c.parent_id === id).sort(porNome);
  return do_kind.filter((c) => c.parent_id === null || !do_kind.some((p) => p.id === c.parent_id)).sort(porNome).flatMap((m) => [m, ...filhas(m.id)]);
}

export function CategoryPicker({ categories, value, onChange, allLabel, placeholder, id, ariaLabel, disabled, compact }: {
  categories: CategoryOut[]; value: number | ""; onChange: (id: number | "") => void;
  allLabel?: string; placeholder?: string; id?: string; ariaLabel?: string; disabled?: boolean; compact?: boolean;
}) {
  const porId = new Map(categories.map((c) => [c.id, c]));
  const mae = (c: CategoryOut | null | undefined) => (c?.parent_id != null ? porId.get(c.parent_id) : undefined);
  const item = (c: CategoryOut): PickerItem => {
    const sub = mae(c);
    return { key: c.id, text: catLabel(c.name), sub: !!sub, icon: <CategoryDot category={c} parent={sub} size={sub ? 18 : 22} /> };
  };
  const groups: PickerGroup[] = [
    ...(allLabel ? [{ label: "", items: [{ key: "" as const, text: allLabel, icon: <TodasIcon /> }] }] : []),
    { label: "Pendente", items: categories.filter((c) => c.name === SEM).map(item) },
    ...GRUPOS.map((g) => ({ label: g.label, items: arvore(categories, g.kind).map(item) })),
  ].filter((g) => g.items.length);
  const atual = porId.get(value as number);
  const trigger = atual
    ? { icon: <CategoryDot category={atual} parent={mae(atual)} size={20} />, text: catLabel(atual.name), extra: mae(atual) ? catLabel(mae(atual)!.name) : undefined }
    : allLabel
      ? { icon: <Icon name="list" size={16} className="text-muted" />, text: allLabel }
      : { icon: <CategoryDot category={undefined} size={20} />, text: placeholder ?? SEM };
  return <Picker groups={groups} value={value} onChange={onChange} trigger={trigger} id={id} ariaLabel={ariaLabel} disabled={disabled} compact={compact} muted={!atual && !!placeholder} />;
}
