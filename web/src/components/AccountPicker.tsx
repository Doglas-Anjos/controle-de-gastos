"use client";
import { PAY_COLOR } from "@/lib/colors";
import type { AccountOut } from "@/lib/types";
import { Icon } from "./Icon";
import { Picker, TodasIcon, type PickerGroup } from "./Picker";

export const TIPO_CONTA: Record<string, string> = { checking: "Conta corrente", savings: "Poupança", credit: "Cartão de crédito" };

// Icone de cartao ou conta com a cor fixa do meio de pagamento (a mesma do painel).
export function AccountDot({ account, size = 22 }: { account: AccountOut; size?: number }) {
  const cor = account.type === "credit" ? PAY_COLOR.card : PAY_COLOR.bank;
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, color: cor, background: `color-mix(in srgb, ${cor} 16%, transparent)` }}>
      <Icon name={account.type === "credit" ? "card" : "bank"} size={Math.round(size * 0.6)} />
    </span>
  );
}

// O nome que vem do banco e feio ("Nu Pagamentos S.A. - Instituicao de Pagamento"); mostramos o banco, o
// tipo e a pista (bandeira, final do cartao), que e como o usuario reconhece a conta.
const rotulo = (a: AccountOut) => ({ text: a.bank === "Banco" ? "Banco não identificado" : a.bank, extra: [TIPO_CONTA[a.type] ?? a.type, a.hint].filter(Boolean).join(" · ") });

export function AccountPicker({ accounts, value, onChange, ariaLabel = "Conta", id }: {
  accounts: AccountOut[]; value: number | ""; onChange: (id: number | "") => void; ariaLabel?: string; id?: string;
}) {
  const ordem = (a: AccountOut, b: AccountOut) => a.bank.localeCompare(b.bank) || a.type.localeCompare(b.type) || a.id - b.id;
  const groups: PickerGroup[] = [
    { label: "", items: [{ key: "", text: "Todas as contas", icon: <TodasIcon /> }] },
    { label: "Contas e cartões", items: [...accounts].sort(ordem).map((a) => ({ key: a.id, icon: <AccountDot account={a} />, ...rotulo(a) })) },
  ];
  const atual = accounts.find((a) => a.id === value);
  const trigger = atual
    ? { icon: <AccountDot account={atual} size={20} />, ...rotulo(atual) }
    : { icon: <Icon name="list" size={16} className="text-muted" />, text: "Todas as contas" };
  return <Picker groups={groups} value={value} onChange={onChange} trigger={trigger} ariaLabel={ariaLabel} id={id} />;
}
