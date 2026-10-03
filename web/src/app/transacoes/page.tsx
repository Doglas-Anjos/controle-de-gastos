"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { Async, btn, btn2, btnGhost, Chip, EmptyState, iconBtn, input, PageHeader, Panel, Skeleton } from "@/components/ui";
import { deleteOverride, getAccounts, getCategories, getSummary, getTransactions, putOverride } from "@/lib/api";
import { categoryColor } from "@/lib/colors";
import { catLabel, currentMonth, formatBRL, formatDayMonth, formatMonthLong, shiftMonth } from "@/lib/format";
import type { TransactionOut } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useDebounced } from "@/lib/useDebounced";

const ORIGEM: Record<string, { icon: IconName; text: string }> = {
  override: { icon: "hand", text: "Categoria definida por você" },
  regra: { icon: "rules", text: "Categoria definida por uma regra" },
  pluggy: { icon: "bank", text: "Categoria sugerida pelo Open Finance" },
};
const SIZE = 25;

// Rotulo em portugues ("outubro de 2026") independente do idioma do navegador; o seletor nativo abre no clique.
function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const abrir = () => {
    const el = ref.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); }
  };
  return (
    <span className="relative">
      <button type="button" onClick={abrir} aria-label={`Mês: ${formatMonthLong(value)}. Escolher outro mês`}
        className="inline-flex h-9 min-w-[150px] items-center justify-center gap-2 rounded-[8px] px-2 text-sm font-medium text-ink hover:bg-surface-2">
        <Icon name="calendar" size={15} className="text-muted" />
        <span className="inline-block first-letter:uppercase">{formatMonthLong(value)}</span>
      </button>
      <input ref={ref} type="month" tabIndex={-1} aria-hidden="true" value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0" />
    </span>
  );
}

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Mes inicial: ?mes=YYYY-MM da URL; senao o mes atual se ele tiver transacoes; senao o ultimo mes com
// transacoes (/summary termina nele), para a primeira tela nao abrir vazia quando o extrato e antigo.
async function mesInicial(): Promise<string> {
  const daUrl = new URLSearchParams(window.location.search).get("mes");
  if (daUrl && MES_RE.test(daUrl)) return daUrl;
  const atual = currentMonth();
  try {
    if ((await getTransactions({ month: atual, page_size: 1 })).total > 0) return atual;
    return (await getSummary(1)).months.at(-1) ?? atual;
  } catch {
    return atual;
  }
}

export default function Transacoes() {
  const [inicial, setInicial] = useState<string>();
  useEffect(() => {
    let off = false;
    mesInicial().then((m) => !off && setInicial(m));
    return () => { off = true; };
  }, []);
  if (!inicial) {
    return (
      <>
        <PageHeader title="Transações" subtitle="Ajuste categorias e exclua lançamentos que não devem contar nos totais." />
        <Skeleton className="mb-4 h-[62px] w-full" />
        <Panel><div className="space-y-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div></Panel>
      </>
    );
  }
  return <Lista inicial={inicial} />;
}

function Lista({ inicial }: { inicial: string }) {
  const toast = useToast();
  const [month, setMonth] = useState(inicial);
  // Reflete o mes na URL (sem nova entrada no historico) para compartilhar e recarregar no mesmo mes.
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get("mes") === month) return;
    u.searchParams.set("mes", month);
    window.history.replaceState(window.history.state, "", u);
  }, [month]);
  const [cat, setCat] = useState<number | "">("");
  const [acc, setAcc] = useState<number | "">("");
  const [busca, setBusca] = useState("");
  const q = useDebounced(busca.trim());
  // Pagina volta a 1 quando qualquer filtro muda, sem um segundo fetch com a pagina antiga.
  const filtros = `${month}|${cat}|${acc}|${q}`;
  const [pg, setPg] = useState({ filtros, n: 1 });
  const page = pg.filtros === filtros ? pg.n : 1;
  const setPage = (n: number) => setPg({ filtros, n });
  const [busy, setBusy] = useState<number>();
  const cats = useApi(getCategories).data ?? [];
  const accs = useApi(getAccounts).data ?? [];
  const tx = useApi(() => getTransactions({ month, category_id: cat, account_id: acc, q, page, page_size: SIZE }), [month, cat, acc, q, page]);
  const total = tx.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / SIZE));
  const filtrado = cat !== "" || acc !== "" || q !== "";

  // PUT substitui o override inteiro: sempre reenvia o que ja existia (categoria manual e exclusao).
  const manual = (t: TransactionOut) => (t.category_source === "override" ? t.category?.id ?? null : null);
  const run = async (t: TransactionOut, fn: () => Promise<unknown>, ok: string, undo?: () => Promise<unknown>) => {
    setBusy(t.id);
    try {
      await fn();
      toast(ok, undo && { action: { label: "Desfazer", run: () => undo().then(tx.reload, (e: Error) => toast(e.message, { tone: "error" })) } });
      tx.reload();
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(undefined);
    }
  };
  const restaurar = (t: TransactionOut) => (manual(t) !== null ? putOverride(t.id, { category_id: manual(t), exclude: false }) : deleteOverride(t.id));
  const setCategoria = (t: TransactionOut, id: number) =>
    run(t, () => putOverride(t.id, { category_id: id, exclude: t.excluded }), `Categoria alterada para ${catLabel(cats.find((c) => c.id === id)?.name)}`);
  const excluir = (t: TransactionOut) =>
    run(t, () => putOverride(t.id, { category_id: manual(t), exclude: true }), "Transação excluída dos totais", () => restaurar(t));
  const voltarAuto = (t: TransactionOut) =>
    run(t, () => (t.excluded ? putOverride(t.id, { category_id: null, exclude: true }) : deleteOverride(t.id)), "Categoria automática restaurada");

  const limpar = () => { setCat(""); setAcc(""); setBusca(""); };

  return (
    <>
      <PageHeader title="Transações" subtitle="Ajuste categorias e exclua lançamentos que não devem contar nos totais." />

      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur md:top-0 md:mx-0 md:rounded-[14px] md:border md:bg-surface md:px-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-[10px] border border-line bg-surface">
            <button className={iconBtn} aria-label="Mês anterior" onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="left" size={16} /></button>
            <MonthPicker value={month} onChange={setMonth} />
            <button className={iconBtn} aria-label="Próximo mês" onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="right" size={16} /></button>
          </div>
          <select aria-label="Categoria" className={`${input} min-w-0 flex-1 sm:flex-none`} value={cat} onChange={(e) => setCat(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Todas as categorias</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{catLabel(c.name)}</option>)}
          </select>
          <select aria-label="Conta" className={`${input} min-w-0 flex-1 sm:flex-none`} value={acc} onChange={(e) => setAcc(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Todas as contas</option>
            {accs.map((a) => <option key={a.id} value={a.id}>{a.bank} · {a.name}</option>)}
          </select>
          <label className="relative min-w-[180px] flex-1">
            <span className="sr-only">Buscar na descrição</span>
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="search" className={`${input} w-full pl-9`} placeholder="Buscar na descrição" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          {filtrado && <button className={btnGhost} onClick={limpar}><Icon name="x" size={14} />Limpar filtros</button>}
        </div>
      </div>

      <Panel pad={false}>
        <Async loading={tx.loading && !tx.data} error={tx.error} onRetry={tx.reload}
          skeleton={<div className="space-y-2 p-5">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>}
          empty={tx.data?.items.length === 0 && (filtrado ? (
            <EmptyState icon="search" title="Nada encontrado com esses filtros" action={<button className={btn2} onClick={limpar}>Limpar filtros</button>}>
              Tente outro termo de busca ou remova a categoria e a conta selecionadas.
            </EmptyState>
          ) : (
            <EmptyState icon="upload" title={`Nenhuma transação em ${formatMonthLong(month)}`}
              action={<Link href="/importar" className={btn}><Icon name="upload" size={16} />Importar extratos</Link>}>
              Importe um arquivo OFX ou CSV deste mês, sincronize pelo Open Finance ou navegue para outro mês com as setas.
            </EmptyState>
          ))}>
          <div className={`overflow-x-auto transition-opacity duration-150 ${tx.loading ? "opacity-60" : ""}`}>
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th scope="col" className="w-20 py-3 pl-5 pr-2 font-medium">Data</th>
                  <th scope="col" className="px-2 py-3 font-medium">Descrição</th>
                  <th scope="col" className="w-64 px-2 py-3 font-medium">Categoria</th>
                  <th scope="col" className="w-32 px-2 py-3 text-right font-medium">Valor</th>
                  <th scope="col" className="w-24 py-3 pl-2 pr-5"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {tx.data?.items.map((t) => {
                  const origem = ORIGEM[t.category_source];
                  return (
                    <tr key={t.id} className={`border-b border-line/60 transition-colors duration-150 last:border-0 even:bg-surface-2/60 hover:bg-surface-2 ${busy === t.id ? "opacity-60" : ""}`}>
                      <td className="whitespace-nowrap py-2.5 pl-5 pr-2 tabular-nums text-ink-2">{formatDayMonth(t.date)}</td>
                      <td className="px-2 py-2.5">
                        <div className={`max-w-[38ch] truncate ${t.excluded ? "text-muted line-through" : "text-ink"}`} title={t.description}>{t.description}</div>
                        {(t.installment || t.recurrence_id !== null || t.excluded) && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {t.installment && <Chip title="Parcela">{t.installment}</Chip>}
                            {t.recurrence_id !== null && <Chip><Icon name="repeat" size={11} />Recorrente</Chip>}
                            {t.excluded && <Chip tone="danger">Fora dos totais</Chip>}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(t.category) }} />
                          <select aria-label={`Categoria de ${t.description}`} disabled={busy === t.id}
                            className="h-8 min-w-0 flex-1 cursor-pointer rounded-[8px] border border-transparent bg-transparent px-1.5 text-sm text-ink transition-colors duration-150 hover:border-line hover:bg-surface focus:border-accent focus:outline-none"
                            value={t.category?.id ?? ""} onChange={(e) => e.target.value && setCategoria(t, Number(e.target.value))}>
                            {!t.category && <option value="" disabled>Sem categoria</option>}
                            {cats.map((c) => <option key={c.id} value={c.id}>{catLabel(c.name)}</option>)}
                          </select>
                          <span title={origem?.text} className="w-4 shrink-0 text-muted">
                            {origem && <><Icon name={origem.icon} size={14} /><span className="sr-only">{origem.text}</span></>}
                          </span>
                        </div>
                      </td>
                      <td className={`whitespace-nowrap px-2 py-2.5 text-right font-medium tabular-nums ${t.excluded ? "text-muted line-through" : t.amount > 0 ? "text-accent-text" : "text-ink"}`}>
                        {t.amount > 0 ? "+" : ""}{formatBRL(t.amount)}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pl-2 pr-5 text-right">
                        {t.category_source === "override" && (
                          <button className={iconBtn} disabled={busy === t.id} aria-label="Restaurar categoria automática" title="Restaurar categoria automática" onClick={() => voltarAuto(t)}>
                            <Icon name="refresh" size={16} />
                          </button>
                        )}
                        {t.excluded ? (
                          <button className={iconBtn} disabled={busy === t.id} aria-label="Voltar a contar nos totais" title="Voltar a contar nos totais"
                            onClick={() => run(t, () => restaurar(t), "Transação de volta aos totais")}>
                            <Icon name="undo" size={16} />
                          </button>
                        ) : (
                          <button className={`${iconBtn} hover:!text-danger`} disabled={busy === t.id} aria-label="Excluir dos totais" title="Excluir dos totais" onClick={() => excluir(t)}>
                            <Icon name="trash" size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm">
            <span className="text-muted tabular-nums">
              {total === 0 ? "0 transações" : `${(page - 1) * SIZE + 1}-${Math.min(page * SIZE, total)} de ${total} transações`}
            </span>
            <div className="flex items-center gap-2">
              <button className={btn2} disabled={page <= 1} onClick={() => setPage(page - 1)}><Icon name="left" size={16} />Anterior</button>
              <span className="px-1 tabular-nums text-ink-2">{page} / {pages}</span>
              <button className={btn2} disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima<Icon name="right" size={16} /></button>
            </div>
          </div>
        </Async>
      </Panel>
    </>
  );
}
