"use client";
import { useEffect, useRef, useState } from "react";

// Painel flutuante em position:fixed num portal no body: dentro da arvore, qualquer ancestral com
// backdrop-filter/transform (a barra sticky de filtros) viraria a referencia do fixed e o painel abriria
// deslocado; a tabela com overflow tambem o cortaria. Fecha ao rolar a pagina (a rolagem interna nao),
// clicar fora, redimensionar ou Escape (quem usa trata a tecla).
export function usePopover(altura = 340) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, acima: false });
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement | null>(null);
  const abrir = () => {
    const r = root.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, acima: window.innerHeight - r.bottom < altura });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (!root.current?.contains(alvo) && !panel.current?.contains(alvo)) setOpen(false);
    };
    const rolou = (e: Event) => { if (!panel.current?.contains(e.target as Node)) setOpen(false); };
    const fechar = () => setOpen(false);
    document.addEventListener("mousedown", fora);
    window.addEventListener("scroll", rolou, true);
    window.addEventListener("resize", fechar);
    return () => { document.removeEventListener("mousedown", fora); window.removeEventListener("scroll", rolou, true); window.removeEventListener("resize", fechar); };
  }, [open]);
  const style = { top: pos.acima ? undefined : pos.top, bottom: pos.acima ? window.innerHeight - pos.top + 40 : undefined, left: pos.left };
  return { open, setOpen, abrir, root, panel, style };
}
