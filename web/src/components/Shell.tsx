"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { getHealth } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Icon, type IconName } from "./Icon";
import { ToastProvider } from "./Toast";
import { Hint } from "./ui";

export const NAV: readonly (readonly [string, string, IconName])[] = [
  ["/", "Visão geral", "home"], ["/transacoes", "Transações", "list"], ["/recorrencias", "Recorrências", "repeat"],
  ["/previsao", "Previsão", "trend"], ["/dicas", "Dicas", "bulb"], ["/importar", "Importar", "upload"], ["/regras", "Regras", "rules"],
];

const COMO_CONFIGURAR = {
  Pluggy: "Defina PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET e PLUGGY_ITEM_IDS no .env da API e reinicie o servidor.",
  OpenAI: "Defina OPENAI_API_KEY no .env da API e reinicie o servidor.",
};

function Status({ name, on }: { name: keyof typeof COMO_CONFIGURAR; on?: boolean }) {
  return (
    <Hint className="w-full" text={on ? `${name} configurado e pronto para uso.` : COMO_CONFIGURAR[name]}>
      <button type="button" className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1 text-left text-xs text-muted hover:bg-surface-2 hover:text-ink">
        <span className={`h-2 w-2 rounded-full ${on ? "bg-ok" : "bg-line-strong"}`} />
        <span className="flex-1">{name}</span>
        <span>{on ? "ativo" : "não configurado"}</span>
      </button>
    </Hint>
  );
}

// Tema efetivo = data-theme salvo ou, sem escolha manual, o do sistema. Le direto do DOM.
const ESCURO = "(prefers-color-scheme: dark)";
function subscribeTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = matchMedia(ESCURO);
  mq.addEventListener("change", cb);
  return () => { mo.disconnect(); mq.removeEventListener("change", cb); };
}
const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia(ESCURO).matches;
};

function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeTheme, isDark, () => null);
  const flip = () => {
    const next = !dark ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("tema", next); } catch {}
  };
  return (
    <button type="button" onClick={flip} aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}
      className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink">
      <Icon name={dark ? "sun" : "moon"} size={16} />
    </button>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-accent-ink"><Icon name="wallet" size={17} /></span>
      <span className="text-[15px] font-semibold tracking-tight text-ink">Controle de Gastos</span>
    </div>
  );
}

function Nav({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5">
      {NAV.map(([href, label, icon]) => {
        const on = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href} onClick={onNavigate} aria-current={on ? "page" : undefined}
            className={`flex h-9 items-center gap-3 rounded-[10px] px-3 text-sm transition-colors duration-150 ${on ? "bg-accent-soft font-medium text-accent-text" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
            <Icon name={icon} size={17} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Footer() {
  const { data: h, error } = useApi(getHealth);
  return (
    <div className="space-y-1 border-t border-line pt-3">
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-xs font-medium text-ink-2">Integrações</span>
        <ThemeToggle />
      </div>
      {error ? (
        <p className="flex items-center gap-2 px-2 text-xs text-danger-text"><Icon name="alert" size={14} />API fora do ar</p>
      ) : (
        <><Status name="Pluggy" on={h?.pluggy} /><Status name="OpenAI" on={h?.openai} /></>
      )}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [open]);

  return (
    <ToastProvider>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[10px] focus:bg-surface focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col gap-6 border-r border-line bg-surface px-3 py-5 md:flex">
        <div className="px-2"><Brand /></div>
        <Nav path={path} />
        <div className="mt-auto"><Footer /></div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur md:hidden">
        <Brand />
        <button type="button" aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-ink-2 hover:bg-surface-2">
          <Icon name="menu" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="toast-in absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col gap-6 border-l border-line bg-surface px-3 py-4">
            <div className="flex items-center justify-between px-2">
              <span className="text-sm font-medium text-ink-2">Menu</span>
              <button type="button" aria-label="Fechar menu" onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-ink-2 hover:bg-surface-2">
                <Icon name="x" />
              </button>
            </div>
            <Nav path={path} onNavigate={() => setOpen(false)} />
            <div className="mt-auto"><Footer /></div>
          </div>
        </div>
      )}

      <main id="conteudo" className="md:pl-60">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </ToastProvider>
  );
}
