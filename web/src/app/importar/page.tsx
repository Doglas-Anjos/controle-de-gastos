"use client";
import { useState } from "react";
import { Async, btn, btn2, Title } from "@/components/Async";
import { ApiError, syncPluggy, uploadFiles } from "@/lib/api";
import type { ImportResult, SyncResult } from "@/lib/types";

type Res = ImportResult | SyncResult;

function Result({ r }: { r: Res }) {
  const rows: [string, number][] = [
    ...("files" in r ? ([["Arquivos", r.files], ["Contas criadas", r.accounts_created]] as [string, number][]) : [["Itens", r.items], ["Contas", r.accounts]] as [string, number][]),
    ["Transações novas", r.transactions_new], ["Transações atualizadas", r.transactions_updated],
  ];
  return (
    <div className="mt-3 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
      <ul>{rows.map(([k, v]) => <li key={k}>{k}: <b>{v}</b></li>)}</ul>
      {r.errors.length > 0 && <ul className="mt-2 text-red-600">{r.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
    </div>
  );
}

export default function Importar() {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ res?: Res; error?: string }>({});

  const run = async (fn: () => Promise<Res>) => {
    setBusy(true);
    try { setOut({ res: await fn() }); }
    catch (e) {
      const err = e as ApiError;
      setOut({ error: err.status === 409 ? "Pluggy não configurado. Defina as credenciais no .env da API ou importe arquivos OFX/CSV." : err.message });
    }
    setBusy(false);
  };

  return (
    <>
      <Title>Importar</Title>
      <section className="mb-8">
        <h2 className="mb-2 font-medium">Arquivos OFX ou CSV</h2>
        <input type="file" multiple accept=".ofx,.csv" onChange={(e) => setFiles([...(e.target.files ?? [])])} />
        <button className={btn + " ml-2"} disabled={busy || files.length === 0} onClick={() => run(() => uploadFiles(files))}>
          {busy ? "Enviando…" : "Importar"}
        </button>
      </section>
      <section>
        <h2 className="mb-2 font-medium">Pluggy</h2>
        <button className={btn2} disabled={busy} onClick={() => run(syncPluggy)}>Sincronizar Pluggy</button>
      </section>
      <Async loading={false} error={out.error}>{out.res && <Result r={out.res} />}</Async>
    </>
  );
}
