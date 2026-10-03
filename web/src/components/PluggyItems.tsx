"use client";
import { useState } from "react";
import { formatDate } from "@/lib/format";
import type { AccountOut, PluggyItemOut } from "@/lib/types";
import { Icon } from "./Icon";
import { btn, btnGhost, Chip, iconBtn, input, type Tone } from "./ui";

const RECONECTAR = "Reconecte em meu.pluggy.ai ou remova e conecte de novo.";
const STATUS: Record<string, { text: string; tone: Tone; ajuda?: string }> = {
  UPDATED: { text: "Atualizada", tone: "accent" },
  UPDATING: { text: "Atualizando", tone: "neutral" },
  OUTDATED: { text: "Desatualizada", tone: "warn" },
  LOGIN_ERROR: { text: "Login inválido", tone: "warn", ajuda: RECONECTAR },
  WAITING_USER_INPUT: { text: "Aguardando você", tone: "warn", ajuda: RECONECTAR },
  ERROR: { text: "Erro", tone: "danger" },
};
const TIPO: Record<string, string> = { checking: "Conta corrente", savings: "Poupança", credit: "Cartão de crédito" };
const BANCOS = ["Nubank", "Inter", "Itau", "Banco do Brasil", "Bradesco", "Santander", "Caixa", "C6", "BTG", "XP", "Mercado Pago", "PicPay", "PagBank"];

// Nome da conexao: o conector MeuPluggy nao diz o banco, entao mostramos os bancos das contas.
export function itemTitle(it: PluggyItemOut) {
  const bancos = [...new Set(it.accounts.map((a) => a.bank))].filter((b) => b !== "Banco");
  if (bancos.length) return bancos.join(" · ");
  return it.connector_name ?? "Conexão";
}

export function AccountRow({ account, onRename, busy }: { account: AccountOut; onRename?: (id: number, bank: string) => void; busy?: boolean }) {
  const [editando, setEditando] = useState(false);
  const [banco, setBanco] = useState(account.bank);
  const generico = account.bank === "Banco";
  const salvar = () => { if (banco.trim() && banco.trim() !== account.bank) onRename?.(account.id, banco.trim()); setEditando(false); };
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-xs">
      <Icon name={account.type === "credit" ? "card" : "bank"} size={13} className="shrink-0 text-muted" />
      {editando ? (
        <form className="flex flex-1 items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
          <input list="bancos-conhecidos" className={`${input} h-7 min-w-0 flex-1 text-xs`} value={banco} autoFocus
            aria-label="Nome do banco" onChange={(e) => setBanco(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setEditando(false)} />
          <datalist id="bancos-conhecidos">{BANCOS.map((b) => <option key={b} value={b} />)}</datalist>
          <button type="submit" className={`${btn} h-7 px-2.5 text-xs`} disabled={busy}>Salvar</button>
          <button type="button" className={`${btnGhost} h-7 px-2 text-xs`} onClick={() => setEditando(false)}>Cancelar</button>
        </form>
      ) : (
        <>
          <span className={`font-medium ${generico ? "text-warn-text" : "text-ink"}`}>{generico ? "Banco não identificado" : account.bank}</span>
          <span className="text-muted">{TIPO[account.type] ?? account.type}{account.hint ? ` · ${account.hint}` : ""}</span>
          {onRename && (
            <button type="button" className={`${btnGhost} ml-auto h-7 px-2 text-xs`} onClick={() => { setBanco(generico ? "" : account.bank); setEditando(true); }}>
              {generico ? "Informar banco" : "Renomear"}
            </button>
          )}
        </>
      )}
    </li>
  );
}

export function PluggyItems({ items, onRemove, onRename, busy }: {
  items: PluggyItemOut[]; onRemove: (id: number) => void; onRename?: (accountId: number, bank: string) => void; busy?: boolean;
}) {
  const [confirmar, setConfirmar] = useState<number>();
  return (
    <ul className="divide-y divide-line rounded-[12px] border border-line">
      {items.map((it) => {
        const st = it.status ? STATUS[it.status] ?? { text: it.status, tone: "neutral" as Tone } : undefined;
        return (
          <li key={it.id} className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{itemTitle(it)}</span>
              {st && <Chip tone={st.tone}>{st.text}</Chip>}
              {it.source === "widget" && confirmar !== it.id && (
                <button className={iconBtn} aria-label={`Remover ${itemTitle(it)}`} disabled={busy} onClick={() => setConfirmar(it.id)}>
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {it.connector_name && it.connector_name !== itemTitle(it) ? `via ${it.connector_name} · ` : ""}
              {it.source === "env" ? "Configurado no .env" : it.created_at ? `Conectado em ${formatDate(it.created_at)}` : "Conectado pelo widget"}
            </div>
            {it.accounts.length > 0 && (
              <ul className="mt-1.5 divide-y divide-line/60 border-t border-line/60 pt-1">
                {it.accounts.map((a) => <AccountRow key={a.id} account={a} onRename={onRename} busy={busy} />)}
              </ul>
            )}
            {it.accounts.length === 0 && it.status === "UPDATED" && <p className="mt-1 text-xs text-muted">Nenhuma conta sincronizada ainda.</p>}
            {st?.ajuda && <p className="mt-1 text-xs text-warn-text">{st.ajuda}</p>}
            {confirmar === it.id && (
              <div className="mt-2 flex items-center justify-end gap-2 text-xs text-ink-2">
                Remover esta conexão?
                <button className={btnGhost} onClick={() => setConfirmar(undefined)}>Cancelar</button>
                <button className={btnGhost} disabled={busy} onClick={() => { setConfirmar(undefined); onRemove(it.id); }}>Remover</button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
