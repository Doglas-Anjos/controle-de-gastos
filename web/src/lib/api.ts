import type * as T from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<R>(path: string, init?: RequestInit): Promise<R> {
  let res: Response;
  try {
    res = await fetch(BASE + path, init);
  } catch {
    throw new ApiError(0, "Não foi possível conectar à API. Ela está rodando em " + BASE + "?");
  }
  if (!res.ok) {
    let msg = res.statusText || "Erro na requisição";
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") msg = body.detail;
      else if (Array.isArray(body?.detail)) msg = body.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.status === 204 ? (undefined as R) : res.json();
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function qs(params: Record<string, string | number | boolean | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? "?" + s : "";
}

export const getHealth = () => req<T.Health>("/health");
export const getAccounts = () => req<T.AccountOut[]>("/accounts");
export const getCategories = () => req<T.CategoryOut[]>("/categories");
export const getTransactions = (p: {
  month?: string; category_id?: number | ""; account_id?: number | ""; q?: string; page?: number; page_size?: number
}) => req<T.Page>("/transactions" + qs(p));
export const putOverride = (id: number, body: T.OverrideIn) => req<unknown>(`/transactions/${id}/override`, json("PUT", body));
export const deleteOverride = (id: number) => req<unknown>(`/transactions/${id}/override`, { method: "DELETE" });
export const getSummary = (months = 12) => req<T.SummaryOut>("/summary" + qs({ months }));
export const getRecurrences = (p: { kind?: string; active?: boolean } = {}) => req<T.RecurrenceOut[]>("/recurrences" + qs(p));
export const decideRecurrence = (id: number, decision: T.RecurrenceDecision["decision"]) =>
  req<unknown>(`/recurrences/${id}/decision`, json("POST", { decision }));
export const getForecast = (horizon = 3) => req<T.ForecastOut>("/forecast" + qs({ horizon }));
export const getRules = () => req<T.RuleOut[]>("/rules");
export const createRule = (r: T.RuleIn) => req<T.RuleOut>("/rules", json("POST", r));
export const deleteRule = (id: number) => req<unknown>(`/rules/${id}`, { method: "DELETE" });
export const uploadFiles = (files: File[]) => {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  return req<T.ImportResult>("/import/upload", { method: "POST", body: fd });
};
export const syncPluggy = () => req<T.SyncResult>("/sync", { method: "POST" });
export const getPluggyItems = () =>
  req<T.PluggyItemOut[]>("/pluggy/items").catch((e) => {
    if (e instanceof ApiError && e.status === 404) return [];
    throw e;
  });
export const createConnectToken = () => req<{ access_token: string }>("/pluggy/connect-token", json("POST", {}));
export const addPluggyItem = (item_id: string, connector_name?: string) =>
  req<T.PluggyItemOut>("/pluggy/items", json("POST", { item_id, connector_name }));
export const deletePluggyItem = (id: number) => req<void>(`/pluggy/items/${id}`, { method: "DELETE" });
export const getInsights = () => req<T.InsightsOut>("/insights");
export const askQuestion = (pergunta: string) => req<T.AnswerOut>("/insights/perguntar", json("POST", { pergunta }));
