"use client";
import { useState, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { formatDate, today } from "@/lib/format";
import { Icon } from "./Icon";
import { btnGhost, input } from "./ui";
import { usePopover } from "./usePopover";

export type Faixa = { de: string; ate: string };
const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Datas como "YYYY-MM-DD" o tempo todo; Date so para aritmetica, sempre ao meio-dia local para o fuso
// nao empurrar o dia.
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const data = (s: string) => new Date(`${s}T12:00:00`);
export const somaDias = (s: string, n: number) => { const d = data(s); d.setDate(d.getDate() + n); return iso(d); };
const primeiroDia = (s: string) => `${s.slice(0, 7)}-01`;
const ultimoDia = (s: string) => { const d = data(primeiroDia(s)); d.setMonth(d.getMonth() + 1); d.setDate(0); return iso(d); };
const somaMeses = (s: string, n: number) => { const d = data(primeiroDia(s)); d.setMonth(d.getMonth() + n); return iso(d); };

// 6 semanas sempre, para o painel nao mudar de altura ao trocar de mes.
function grade(mes: string): string[] {
  const inicio = data(primeiroDia(mes));
  inicio.setDate(inicio.getDate() - inicio.getDay());
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(inicio); d.setDate(d.getDate() + i); return iso(d); });
}

const ATALHOS: { label: string; faixa: () => Faixa }[] = [
  { label: "Hoje", faixa: () => ({ de: today(), ate: today() }) },
  { label: "Últimos 7 dias", faixa: () => ({ de: somaDias(today(), -6), ate: today() }) },
  { label: "Últimos 30 dias", faixa: () => ({ de: somaDias(today(), -29), ate: today() }) },
  { label: "Este mês", faixa: () => ({ de: primeiroDia(today()), ate: today() }) },
  { label: "Mês passado", faixa: () => { const m = somaMeses(today(), -1); return { de: m, ate: ultimoDia(m) }; } },
];

// Calendario de periodo: primeiro clique marca o inicio, segundo o fim (invertidos se vierem ao contrario);
// `single` escolhe um dia so. Sem biblioteca: o que precisamos cabe em uma grade de 42 celulas.
export function DateRangePicker({ value, onChange, single, ariaLabel }: {
  value: Faixa; onChange: (f: Faixa) => void; single?: boolean; ariaLabel?: string;
}) {
  const { open, setOpen, abrir: abrirPainel, root, panel, style } = usePopover(380);
  const [mes, setMes] = useState(value.de || today());
  const [inicio, setInicio] = useState<string>();
  const [hover, setHover] = useState<string>();
  const hoje = today();
  const abrir = () => { setMes(value.de || hoje); setInicio(undefined); abrirPainel(); };
  const escolher = (d: string) => {
    if (single) { onChange({ de: d, ate: d }); setOpen(false); return; }
    if (!inicio) { setInicio(d); return; }
    onChange(d < inicio ? { de: d, ate: inicio } : { de: inicio, ate: d });
    setInicio(undefined);
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === "Escape") setOpen(false); };
  // Faixa desenhada: a confirmada, ou a previa entre o inicio clicado e o dia sob o mouse.
  const previa: Faixa = inicio ? (hover && hover < inicio ? { de: hover, ate: inicio } : { de: inicio, ate: hover ?? inicio }) : value;
  const rotulo = single ? formatDate(value.de) : value.de === value.ate ? formatDate(value.de) : `${formatDate(value.de)} – ${formatDate(value.ate)}`;
  const m = data(primeiroDia(mes));

  return (
    <div ref={root} className="relative" onKeyDown={onKey}>
      <button type="button" aria-label={ariaLabel ?? (single ? "Dia" : "Período")} aria-haspopup="dialog" aria-expanded={open}
        className={`${input} inline-flex items-center gap-2`} onClick={() => (open ? setOpen(false) : abrir())}>
        <Icon name="calendar" size={15} className="text-muted" />
        <span className="tabular-nums">{rotulo}</span>
      </button>
      {open && createPortal(
        <div ref={panel as RefObject<HTMLDivElement>} role="dialog" aria-label={single ? "Escolher dia" : "Escolher período"} style={style}
          className="fixed z-40 flex gap-3 rounded-[12px] border border-line bg-surface p-3 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.35)]">
          {!single && (
            <ul className="hidden w-36 shrink-0 space-y-0.5 border-r border-line pr-3 sm:block">
              {ATALHOS.map((a) => (
                <li key={a.label}><button type="button" className={`${btnGhost} h-8 w-full justify-start px-2 text-xs`} onClick={() => { onChange(a.faixa()); setOpen(false); }}>{a.label}</button></li>
              ))}
            </ul>
          )}
          <div className="w-[252px]">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" className={`${btnGhost} h-7 w-7 px-0`} aria-label="Mês anterior" onClick={() => setMes(somaMeses(mes, -1))}><Icon name="left" size={14} /></button>
              <span className="text-sm font-medium text-ink first-letter:uppercase">{MESES[m.getMonth()]} de {m.getFullYear()}</span>
              <button type="button" className={`${btnGhost} h-7 w-7 px-0`} aria-label="Próximo mês" onClick={() => setMes(somaMeses(mes, 1))}><Icon name="right" size={14} /></button>
            </div>
            <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted">{DIAS.map((d, i) => <span key={i} className="py-1">{d}</span>)}</div>
            <div className="grid grid-cols-7" onMouseLeave={() => setHover(undefined)}>
              {grade(mes).map((d) => {
                const doMes = d.slice(0, 7) === mes.slice(0, 7);
                const ponta = d === previa.de || d === previa.ate;
                const dentro = !single && d > previa.de && d < previa.ate;
                return (
                  <button key={d} type="button" aria-label={formatDate(d)} aria-pressed={ponta} onClick={() => escolher(d)} onMouseEnter={() => setHover(d)}
                    className={`relative h-9 text-sm tabular-nums transition-colors ${
                      ponta ? "z-10 rounded-[8px] bg-accent font-semibold text-accent-ink" : dentro ? "bg-accent-soft text-accent-text" : "rounded-[8px] hover:bg-surface-2"
                    } ${!ponta && !dentro ? (doMes ? "text-ink" : "text-muted/60") : ""} ${d === previa.de && !single && previa.de !== previa.ate ? "rounded-r-none" : ""} ${d === previa.ate && !single && previa.de !== previa.ate ? "rounded-l-none" : ""}`}>
                    {Number(d.slice(8))}
                    {d === hoje && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-current" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>{single ? "Clique no dia" : inicio ? `Início ${formatDate(inicio)} · clique no fim` : "Clique no início e no fim"}</span>
              <button type="button" className={`${btnGhost} h-7 px-2 text-xs`} onClick={() => setMes(hoje)}>Hoje</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
