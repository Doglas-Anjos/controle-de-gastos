"use client";
import { useCallback, useEffect, useState } from "react";

// Busca no cliente com estados carregando/erro; reload() refaz a chamada.
export function useApi<R>(fn: () => Promise<R>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data?: R; error?: string; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let off = false;
    setState((s) => ({ data: s.data, loading: true }));
    fn().then(
      (data) => !off && setState({ data, loading: false }),
      (e: Error) => !off && setState({ error: e.message, loading: false }),
    );
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: useCallback(() => setTick((t) => t + 1), []) };
}
