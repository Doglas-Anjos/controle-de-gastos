import { formatBRL, formatDate } from "@/lib/format";
import type { RecurrenceOut } from "@/lib/types";
import { btn, btn2 } from "./Async";

export function RecurrenceCard({ rec, onDecide }: {
  rec: RecurrenceOut; onDecide?: (id: number, d: "confirmada" | "descartada") => void
}) {
  const pending = rec.kind === "detectada" && rec.user_decision === null;
  return (
    <div className={`rounded-lg border p-4 ${pending ? "border-amber-400" : "border-zinc-200 dark:border-zinc-800"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{rec.merchant}</div>
          <div className="text-xs text-zinc-500">{rec.category?.name ?? "Sem categoria"} · {rec.periodicity} · {rec.account.bank}</div>
        </div>
        <div className="text-right font-semibold">{formatBRL(rec.expected_amount)}</div>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-1 text-xs text-zinc-500">
        <dt>Próximo vencimento</dt><dd>{rec.next_due ? formatDate(rec.next_due) : "—"}</dd>
        {rec.ends_at && <><dt>Fim das parcelas</dt><dd>{formatDate(rec.ends_at)}</dd></>}
        <dt>Confiança</dt><dd>{Math.round(rec.confidence * 100)}%</dd>
        <dt>Ocorrências</dt><dd>{rec.occurrences}</dd>
        {rec.user_decision && <><dt>Decisão</dt><dd>{rec.user_decision}</dd></>}
      </dl>
      {pending && onDecide && (
        <div className="mt-3 flex gap-2">
          <button className={btn} onClick={() => onDecide(rec.id, "confirmada")}>Confirmar</button>
          <button className={btn2} onClick={() => onDecide(rec.id, "descartada")}>Descartar</button>
        </div>
      )}
    </div>
  );
}
