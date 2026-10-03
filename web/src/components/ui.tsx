import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

// Classes base. Botoes e campos: raio 10px, 36px de altura; transicao so de cor/transform, 150ms.
const press = "transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";
export const btn = `inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] bg-accent px-3.5 text-sm font-medium text-accent-ink hover:bg-accent-hover ${press}`;
export const btn2 = `inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-line bg-surface px-3.5 text-sm font-medium text-ink hover:border-line-strong hover:bg-surface-2 ${press}`;
export const btnGhost = `inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-3 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink ${press}`;
export const iconBtn = `inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-muted hover:bg-surface-2 hover:text-ink ${press}`;
export const input = "h-9 rounded-[10px] border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted transition-colors duration-150 hover:border-line-strong focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent";
export const label = "text-xs font-medium text-ink-2";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-[65ch] text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ title, subtitle, actions, children, className = "", pad = true }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean
}) {
  return (
    <section className={`min-w-0 rounded-[14px] border border-line bg-surface ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export type Tone = "neutral" | "accent" | "danger" | "warn";
const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  accent: "bg-accent-soft text-accent-text border-transparent",
  danger: "bg-danger-soft text-danger-text border-transparent",
  warn: "bg-warn-soft text-warn-text border-transparent",
};

export function Chip({ children, tone = "neutral", dot, title, className = "" }: {
  children: ReactNode; tone?: Tone; dot?: string; title?: string; className?: string
}) {
  return (
    <span title={title} className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-xs font-medium ${TONE[tone]} ${className}`}>
      {dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}

export function Kpi({ label, value, delta, hint, loading }: {
  label: string; value: ReactNode; delta?: { text: string; tone: Tone; icon?: IconName }; hint?: ReactNode; loading?: boolean
}) {
  return (
    <div className="min-w-0 rounded-[14px] border border-line bg-surface p-5">
      <div className="text-sm text-muted">{label}</div>
      {loading ? <Skeleton className="mt-3 h-8 w-32" /> : (
        <div className="mt-2 flex flex-wrap items-baseline gap-2">
          <div className="text-[28px] font-semibold leading-tight tracking-tight text-ink">{value}</div>
          {delta && (
            <Chip tone={delta.tone}>
              {delta.icon && <Icon name={delta.icon} size={12} strokeWidth={2.25} />}
              {delta.text}
            </Chip>
          )}
        </div>
      )}
      {hint && !loading && <div className="mt-1.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export const Skeleton = ({ className = "" }: { className?: string }) => <div aria-hidden="true" className={`skeleton ${className}`} />;

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Carregando" className="space-y-3">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 rounded-[14px] border border-transparent bg-danger-soft p-4 text-sm text-danger-text">
      <Icon name="alert" className="mt-0.5 shrink-0" />
      <p className="min-w-0 flex-1">{message}</p>
      {onRetry && <button className={btn2} onClick={onRetry}><Icon name="refresh" size={16} />Tentar de novo</button>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-accent-soft text-accent-text">
        <Icon name={icon} size={22} />
      </div>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {children && <p className="mt-1 max-w-[46ch] text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// Padroniza carregando/erro/vazio. `loading` deve ser so a primeira carga: refetch mantem o conteudo na tela.
export function Async({ loading, error, empty, skeleton, onRetry, children }: {
  loading: boolean; error?: string; empty?: ReactNode | false; skeleton?: ReactNode; onRetry?: () => void; children: ReactNode
}) {
  if (error) return <ErrorBox message={error} onRetry={onRetry} />;
  if (loading) return <>{skeleton ?? <SkeletonRows />}</>;
  if (empty) return <>{empty}</>;
  return <>{children}</>;
}

// Dica acessivel: abre no hover e no foco do teclado.
export function Hint({ children, text, side = "top", className = "" }: { children: ReactNode; text: ReactNode; side?: "top" | "right" | "left"; className?: string }) {
  const pos = {
    top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
    right: "left-full top-1/2 ml-2 -translate-y-1/2",
    left: "right-full top-1/2 mr-2 -translate-y-1/2",
  }[side];
  return (
    <span className={`group relative inline-flex ${className}`}>
      {children}
      <span role="tooltip" className={`pointer-events-none invisible absolute z-30 w-60 rounded-[10px] border border-line bg-surface px-3 py-2 text-xs font-normal leading-relaxed text-ink-2 opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 ${pos}`}>
        {text}
      </span>
    </span>
  );
}

export function Tabs<K extends string>({ value, onChange, items, label: aria }: {
  value: K; onChange: (k: K) => void; items: { key: K; label: string; count?: number; attention?: boolean }[]; label: string
}) {
  return (
    <div role="tablist" aria-label={aria} className="inline-flex rounded-[12px] border border-line bg-surface p-1">
      {items.map((it) => {
        const on = it.key === value;
        return (
          <button key={it.key} role="tab" aria-selected={on} onClick={() => onChange(it.key)}
            className={`inline-flex h-8 items-center gap-2 rounded-[9px] px-3 text-sm font-medium transition-colors duration-150 ${on ? "bg-surface-2 text-ink shadow-[inset_0_0_0_1px_var(--line)]" : "text-muted hover:text-ink"}`}>
            {it.label}
            {it.count !== undefined && (
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${it.attention ? "bg-warn-soft text-warn-text" : "bg-surface-2 text-muted"}`}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Meter({ value, tone = "accent", label: aria }: { value: number; tone?: "accent" | "warn" | "muted"; label: string }) {
  const fill = { accent: "bg-accent", warn: "bg-warn", muted: "bg-line-strong" }[tone];
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div role="meter" aria-label={aria} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2 shadow-[inset_0_0_0_1px_var(--line)]">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
