"use client";
import { useState } from "react";
import { formatDate } from "@/lib/format";
import type { PluggyItemOut } from "@/lib/types";
import { Icon } from "./Icon";
import { btnGhost, Chip, iconBtn, type Tone } from "./ui";

const RECONECTAR = "Reconecte em meu.pluggy.ai ou remova e conecte de novo.";
const STATUS: Record<string, { text: string; tone: Tone; ajuda?: string }> = {
  UPDATED: { text: "Atualizada", tone: "accent" },
  UPDATING: { text: "Atualizando", tone: "neutral" },
  OUTDATED: { text: "Desatualizada", tone: "warn" },
  LOGIN_ERROR: { text: "Login inválido", tone: "warn", ajuda: RECONECTAR },
  WAITING_USER_INPUT: { text: "Aguardando você", tone: "warn", ajuda: RECONECTAR },
  ERROR: { text: "Erro", tone: "danger" },
};

export function PluggyItems({ items, onRemove, busy }: { items: PluggyItemOut[]; onRemove: (id: number) => void; busy?: boolean }) {
  const [confirmar, setConfirmar] = useState<number>();
  return (
    <ul className="divide-y divide-line rounded-[12px] border border-line">
      {items.map((it) => {
        const st = it.status ? STATUS[it.status] ?? { text: it.status, tone: "neutral" as Tone } : undefined;
        return (
          <li key={it.id} className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{it.connector_name ?? "Conexão"}</span>
              {st && <Chip tone={st.tone}>{st.text}</Chip>}
              {it.source === "widget" && confirmar !== it.id && (
                <button className={iconBtn} aria-label={`Remover ${it.connector_name ?? "conexão"}`} disabled={busy} onClick={() => setConfirmar(it.id)}>
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {it.source === "env" ? "Configurado no .env" : it.created_at ? `Conectado em ${formatDate(it.created_at)}` : "Conectado pelo widget"}
            </div>
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
