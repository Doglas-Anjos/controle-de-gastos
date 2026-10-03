"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

type Toast = { id: number; text: string; tone: "ok" | "error"; action?: { label: string; run: () => void } };
type Show = (text: string, opts?: { tone?: Toast["tone"]; action?: Toast["action"] }) => void;

const Ctx = createContext<Show>(() => {});
export const useToast = () => useContext(Ctx);

// Um toast por vez basta aqui: cada acao substitui a anterior, some sozinho em 4s (6s se tiver "Desfazer").
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback<Show>((text, opts = {}) => {
    clearTimeout(timer.current);
    const t = { id: Date.now(), text, tone: opts.tone ?? "ok", action: opts.action };
    setToast(t);
    timer.current = setTimeout(() => setToast((cur) => (cur?.id === t.id ? undefined : cur)), opts.action ? 6000 : 4000);
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 md:bottom-6">
        {toast && (
          <div key={toast.id} role={toast.tone === "error" ? "alert" : "status"}
            className="toast-in pointer-events-auto flex max-w-md items-center gap-3 rounded-[12px] border border-line bg-surface py-2.5 pl-3.5 pr-2 text-sm text-ink shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
            <Icon name={toast.tone === "ok" ? "check" : "alert"} size={16} className={toast.tone === "ok" ? "text-accent" : "text-danger"} />
            <span className="min-w-0 flex-1">{toast.text}</span>
            {toast.action && (
              <button className="rounded-[8px] px-2 py-1 text-sm font-medium text-accent-text hover:bg-accent-soft"
                onClick={() => { toast.action!.run(); setToast(undefined); }}>
                {toast.action.label}
              </button>
            )}
            <button aria-label="Fechar aviso" className="rounded-[8px] p-1 text-muted hover:bg-surface-2 hover:text-ink" onClick={() => setToast(undefined)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
