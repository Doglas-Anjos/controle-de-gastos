"use client";
import { useEffect, useId, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { input } from "./ui";
import { usePopover } from "./usePopover";

export type PickerItem = { key: number | ""; text: string; icon: ReactNode; extra?: string; sub?: boolean };
export type PickerGroup = { label: string; items: PickerItem[] };

// Substitui o <select> nativo, que nao aceita icone nem cor nas opcoes (posicionamento em usePopover).
// Setas + Enter navegam; Escape fecha.
export function Picker({ groups, value, onChange, trigger, id, ariaLabel, disabled, compact, muted }: {
  groups: PickerGroup[]; value: number | ""; onChange: (key: number | "") => void;
  trigger: { icon: ReactNode; text: string; extra?: string };
  id?: string; ariaLabel?: string; disabled?: boolean; compact?: boolean; muted?: boolean;
}) {
  const { open, setOpen, abrir: abrirPainel, root, panel: lista, style } = usePopover();
  const [foco, setFoco] = useState(0);
  const listId = useId();
  const planos = groups.flatMap((g) => g.items);

  const abrir = () => { setFoco(Math.max(0, planos.findIndex((c) => c.key === value))); abrirPainel(); };
  const escolher = (c: PickerItem | undefined) => { if (c) onChange(c.key); setOpen(false); };
  // Opcao focada pelo teclado entra na area visivel da lista (no hover ja esta visivel: nao rola).
  useEffect(() => {
    if (open) lista.current?.querySelector<HTMLElement>('[data-foco="true"]')?.scrollIntoView?.({ block: "nearest" }); // jsdom nao implementa
  }, [open, foco, lista]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (!open) { if (["ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); abrir(); } return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setFoco((f) => Math.min(planos.length - 1, f + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFoco((f) => Math.max(0, f - 1)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); escolher(planos[foco]); }
  };

  const estilo = compact
    ? "flex h-8 w-full min-w-0 items-center gap-2 rounded-[8px] border border-transparent px-1.5 text-sm text-ink transition-colors duration-150 hover:border-line hover:bg-surface focus:border-accent focus:outline-none disabled:opacity-60"
    : `${input} flex w-full min-w-0 items-center gap-2 text-left`;
  return (
    <div ref={root} className="relative min-w-0" onKeyDown={onKey}>
      <button type="button" id={id} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        disabled={disabled} className={estilo} onClick={() => (open ? setOpen(false) : abrir())}>
        {trigger.icon}
        <span className={`flex-1 truncate ${muted ? "text-muted" : ""}`}>
          {trigger.text}{trigger.extra && <span className="text-muted"> · {trigger.extra}</span>}
        </span>
        <Icon name="down" size={14} className="shrink-0 text-muted" />
      </button>
      {open && createPortal(
        <ul ref={lista as RefObject<HTMLUListElement>} role="listbox" id={listId} aria-label={ariaLabel} style={style}
          className="fixed z-40 max-h-80 w-72 overflow-auto rounded-[12px] border border-line bg-surface p-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.35)]">
          {groups.map((g, gi) => (
            <li key={g.label || `g${gi}`} role="presentation">
              {g.label && <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">{g.label}</div>}
              <ul role="group" aria-label={g.label || undefined}>
                {g.items.map((c) => {
                  const i = planos.indexOf(c);
                  const sel = c.key === value;
                  return (
                    <li key={c.key === "" ? "todas" : c.key} role="option" aria-selected={sel} data-foco={i === foco} onMouseEnter={() => setFoco(i)} onClick={() => escolher(c)}
                      className={`flex cursor-pointer items-center gap-2 rounded-[8px] py-1.5 pr-2 text-sm ${c.sub ? "pl-7" : "pl-2"} ${i === foco ? "bg-surface-2" : ""} ${sel ? "font-medium text-ink" : "text-ink-2"}`}>
                      {c.icon}
                      <span className="min-w-0 flex-1 truncate">
                        {c.text}{c.extra && <span className="text-muted"> · {c.extra}</span>}
                      </span>
                      {sel && <Icon name="check" size={14} className="text-accent-text" />}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}

export const TodasIcon = () => <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center text-muted"><Icon name="list" size={14} /></span>;
