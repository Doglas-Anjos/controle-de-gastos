"use client";
import dynamic from "next/dynamic";
import { useRef, useState, type DragEvent } from "react";
import { Icon } from "@/components/Icon";
import { PluggyItems } from "@/components/PluggyItems";
import { useToast } from "@/components/Toast";
import { btn, btn2, ErrorBox, iconBtn, PageHeader, Panel } from "@/components/ui";
import { addPluggyItem, ApiError, createConnectToken, deletePluggyItem, getHealth, getPluggyItems, syncPluggy, uploadFiles } from "@/lib/api";
import type { ImportResult, SyncResult } from "@/lib/types";
import { useApi } from "@/lib/useApi";

// O widget injeta script externo da Pluggy: so existe no cliente.
const PluggyConnect = dynamic(() => import("react-pluggy-connect").then((m) => m.PluggyConnect), { ssr: false });
const SANDBOX = process.env.NEXT_PUBLIC_PLUGGY_SANDBOX === "1";

const ACEITOS = [".ofx", ".csv"];
const aceito = (f: File) => ACEITOS.some((ext) => f.name.toLowerCase().endsWith(ext));
const tamanho = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

function Tiles({ items, errors }: { items: [string, number][]; errors: string[] }) {
  return (
    <div className="mt-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {items.map(([k, v]) => (
          <div key={k} className="rounded-[12px] bg-surface-2 px-4 py-3">
            <div className="text-xs text-muted">{k}</div>
            <div className="mt-1 text-xl font-semibold text-ink">{v}</div>
          </div>
        ))}
      </div>
      {errors.length > 0 && (
        <ul className="space-y-1.5 rounded-[12px] bg-danger-soft p-3 text-sm text-danger-text">
          {errors.map((e, i) => <li key={i} className="flex gap-2"><Icon name="alert" size={16} className="mt-0.5 shrink-0" />{e}</li>)}
        </ul>
      )}
    </div>
  );
}

export default function Importar() {
  const toast = useToast();
  const health = useApi(getHealth);
  const pluggyOn = health.data?.pluggy;
  const credOn = health.data?.pluggy_credenciais;
  const itens = useApi(getPluggyItems);
  const [token, setToken] = useState<string>();
  const [conn, setConn] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [rejeitados, setRejeitados] = useState<string[]>([]);
  const [up, setUp] = useState<{ busy?: boolean; res?: ImportResult; error?: string }>({});
  const [sync, setSync] = useState<{ busy?: boolean; res?: SyncResult; error?: string }>({});

  const adicionar = (list: FileList | null) => {
    const novos = [...(list ?? [])];
    setRejeitados(novos.filter((f) => !aceito(f)).map((f) => f.name));
    setFiles((cur) => {
      const chave = (f: File) => `${f.name}:${f.size}`;
      const vistos = new Set(cur.map(chave));
      return [...cur, ...novos.filter((f) => aceito(f) && !vistos.has(chave(f)))];
    });
    setUp({});
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); adicionar(e.dataTransfer.files); };

  const enviar = async () => {
    setUp({ busy: true });
    try {
      const res = await uploadFiles(files);
      setUp({ res });
      setFiles([]);
      toast(`${res.transactions_new} transações novas importadas`);
    } catch (e) {
      setUp({ error: (e as Error).message });
    }
  };
  const sincronizar = async () => {
    setSync({ busy: true });
    try {
      const res = await syncPluggy();
      setSync({ res });
      toast("Sincronização concluída");
    } catch (e) {
      setSync({ error: e instanceof ApiError && e.status === 409 ? "Pluggy não configurado. Defina as credenciais no .env da API ou importe arquivos OFX/CSV." : (e as Error).message });
    }
  };

  const conectar = async () => {
    setConn(true);
    try {
      setToken((await createConnectToken()).access_token);
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
    setConn(false);
  };
  const aoConectar = async ({ item }: { item: { id: string; connector?: { name?: string } } }) => {
    setToken(undefined);
    try {
      await addPluggyItem(item.id, item.connector?.name);
      toast("Banco conectado, sincronizando");
      itens.reload();
      health.reload();
      sincronizar();
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
  };
  const remover = async (id: number) => {
    try {
      await deletePluggyItem(id);
      toast("Conexão removida");
      itens.reload();
      health.reload();
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
  };

  return (
    <>
      <PageHeader title="Importar" subtitle="Traga extratos e faturas do seu banco. Transações repetidas são reconhecidas e não duplicam." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Panel className="lg:col-span-3" title="Arquivos OFX ou CSV" subtitle="Exporte pelo app ou site do seu banco e solte aqui.">
          <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
            className={`flex flex-col items-center justify-center rounded-[12px] border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 ${over ? "border-accent bg-accent-soft" : "border-line-strong bg-surface-2 hover:border-accent/60"}`}>
            <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-surface text-accent-text shadow-[inset_0_0_0_1px_var(--line)]"><Icon name="upload" size={22} /></span>
            <p className="mt-4 text-sm font-medium text-ink">Arraste os arquivos para cá</p>
            <p className="mt-1 text-xs text-muted">ou</p>
            <button type="button" className={`${btn2} mt-2`} onClick={() => inputRef.current?.click()}>Escolher arquivos</button>
            <input ref={inputRef} type="file" multiple accept={ACEITOS.join(",")} className="sr-only" tabIndex={-1}
              onChange={(e) => { adicionar(e.target.files); e.target.value = ""; }} />
            <p className="mt-3 text-xs text-muted">Aceita .ofx e .csv, vários de uma vez</p>
          </div>

          {rejeitados.length > 0 && (
            <p role="alert" className="mt-3 flex gap-2 text-sm text-danger-text"><Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              Ignorados por não serem OFX ou CSV: {rejeitados.join(", ")}
            </p>
          )}

          {files.length > 0 && (
            <div className="mt-5">
              <ul className="divide-y divide-line rounded-[12px] border border-line">
                {files.map((f, i) => (
                  <li key={`${f.name}:${f.size}`} className="flex items-center gap-3 px-3 py-2.5">
                    <Icon name="file" size={18} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{f.name}</span>
                    <span className="text-xs tabular-nums text-muted">{tamanho(f.size)}</span>
                    <button className={iconBtn} aria-label={`Remover ${f.name}`} disabled={up.busy} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                      <Icon name="x" size={14} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <button className={btn2} disabled={up.busy} onClick={() => setFiles([])}>Limpar lista</button>
                <button className={btn} disabled={up.busy} onClick={enviar}>
                  <Icon name="upload" size={16} />{up.busy ? "Importando…" : `Importar ${files.length} ${files.length === 1 ? "arquivo" : "arquivos"}`}
                </button>
              </div>
            </div>
          )}

          {up.error && <div className="mt-5"><ErrorBox message={up.error} /></div>}
          {up.res && (
            <Tiles errors={up.res.errors} items={[
              ["Arquivos lidos", up.res.files], ["Contas criadas", up.res.accounts_created],
              ["Transações novas", up.res.transactions_new], ["Atualizadas", up.res.transactions_updated],
            ]} />
          )}
        </Panel>

        <Panel className="lg:col-span-2" title="Open Finance (Pluggy)" subtitle="Sincroniza contas e cartões direto do banco, sem arquivos.">
          {credOn === false ? (
            <div className="rounded-[12px] bg-surface-2 p-4 text-sm text-ink-2">
              <div className="flex items-center gap-2 font-medium text-ink"><Icon name="lock" size={16} className="text-muted" />Não configurado</div>
              <p className="mt-1.5 leading-relaxed">
                Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no <code className="rounded-[6px] bg-surface px-1 text-[13px]">.env</code> da
                API e reinicie o servidor. Enquanto isso, importe arquivos ao lado.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {itens.error && <ErrorBox message={itens.error} />}
              {itens.data && itens.data.length > 0 ? (
                <PluggyItems items={itens.data} onRemove={remover} />
              ) : (
                !itens.loading && !itens.error && <p className="text-sm text-ink-2">Nenhum banco conectado ainda.</p>
              )}
            </div>
          )}
          <button className={`${btn2} mt-4 w-full`} disabled={!credOn || conn || !!token} onClick={conectar}>
            <Icon name="bank" size={16} />{conn ? "Abrindo…" : "Conectar banco"}
          </button>
          <p className="mt-2 text-xs text-muted">Conexões feitas em meu.pluggy.ai e configuradas no .env também aparecem aqui.</p>
          {token && (
            <PluggyConnect connectToken={token} includeSandbox={SANDBOX} onSuccess={aoConectar}
              onError={(e) => { setToken(undefined); toast(e.message || "Erro ao conectar", { tone: "error" }); }}
              onClose={() => setToken(undefined)} />
          )}
          <button className={`${btn} mt-4 w-full`} disabled={!pluggyOn || sync.busy} onClick={sincronizar}
            title={pluggyOn ? undefined : "Configure a Pluggy para sincronizar"}>
            <Icon name="refresh" size={16} className={sync.busy ? "animate-spin" : ""} />{sync.busy ? "Sincronizando…" : "Sincronizar agora"}
          </button>
          {sync.error && <div className="mt-4"><ErrorBox message={sync.error} /></div>}
          {sync.res && (
            <Tiles errors={sync.res.errors} items={[
              ["Conexões", sync.res.items], ["Contas", sync.res.accounts],
              ["Novas", sync.res.transactions_new], ["Atualizadas", sync.res.transactions_updated],
            ]} />
          )}
        </Panel>
      </div>
    </>
  );
}
