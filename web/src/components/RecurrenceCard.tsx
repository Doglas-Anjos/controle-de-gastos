import { categoryColor } from "@/lib/colors";
import { catLabel, formatBRL, formatDayMonth, formatRelativeDay, merchantLabel, PERIODICIDADE } from "@/lib/format";
import { confidenceLevel, installmentProgress, isCard, isPending } from "@/lib/recurrence";
import type { RecurrenceOut } from "@/lib/types";
import { Icon } from "./Icon";
import { btn, btn2, Chip, Meter, PayChip, type Tone } from "./ui";

const NIVEL: Record<ReturnType<typeof confidenceLevel>, Tone> = { alta: "accent", "média": "neutral", baixa: "warn" };
const SUFIXO: Record<string, string> = { semanal: "/sem", mensal: "/mês", anual: "/ano" };

export function RecurrenceCard({ rec, onDecide, busy }: {
  rec: RecurrenceOut; onDecide?: (id: number, d: "confirmada" | "descartada") => void; busy?: boolean
}) {
  const pending = isPending(rec);
  const parcelas = installmentProgress(rec);
  const nivel = confidenceLevel(rec.confidence);
  return (
    <article className={`flex flex-col rounded-[14px] border bg-surface p-5 transition-colors duration-150 ${pending ? "border-warn/50" : "border-line hover:border-line-strong"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-ink" title={merchantLabel(rec.merchant)}>{merchantLabel(rec.merchant)}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: categoryColor(rec.category) }} />
            {catLabel(rec.category?.name)}
            <span aria-hidden="true">·</span>
            {rec.account.bank}
            <PayChip card={isCard(rec)} />
          </div>
        </div>
        {pending ? <Chip tone="warn">Aguardando decisão</Chip>
          : rec.user_decision === "confirmada" ? <Chip tone="accent"><Icon name="check" size={12} strokeWidth={2.5} />Confirmada</Chip> : null}
      </div>

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight text-ink">{formatBRL(Math.abs(rec.expected_amount))}</span>
        <span className="text-sm text-muted">{SUFIXO[rec.periodicity] ?? ""}</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted">Periodicidade</dt>
          <dd className="text-ink-2">{PERIODICIDADE[rec.periodicity] ?? rec.periodicity}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Próxima cobrança</dt>
          <dd className="text-ink-2">{rec.next_due ? <>{formatDayMonth(rec.next_due)} <span className="text-muted">({formatRelativeDay(rec.next_due)})</span></> : "Sem previsão"}</dd>
        </div>
      </dl>

      {parcelas && (
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="text-muted">Parcelas pagas</span>
            <span className="font-medium tabular-nums text-ink-2">{parcelas.paid}/{parcelas.total}</span>
          </div>
          <Meter value={parcelas.total ? parcelas.paid / parcelas.total : 0} label={`${parcelas.paid} de ${parcelas.total} parcelas pagas`} />
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          Confiança
          <Chip tone={NIVEL[nivel]} title={`${rec.occurrences} ocorrências observadas`}>
            {nivel}<span className="tabular-nums">{Math.round(rec.confidence * 100)}%</span>
          </Chip>
        </span>
        <span className="tabular-nums">{rec.occurrences} {rec.occurrences === 1 ? "ocorrência" : "ocorrências"}</span>
      </div>

      {pending && onDecide && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className={btn} disabled={busy} onClick={() => onDecide(rec.id, "confirmada")}>Confirmar</button>
          <button className={btn2} disabled={busy} onClick={() => onDecide(rec.id, "descartada")}>Descartar</button>
        </div>
      )}
    </article>
  );
}
