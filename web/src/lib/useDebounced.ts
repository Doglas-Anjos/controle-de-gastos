"use client";
import { useEffect, useState } from "react";

// Busca digitada so dispara a requisicao depois de uma pausa (300ms), nao a cada tecla.
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
