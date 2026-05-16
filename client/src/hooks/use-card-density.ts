import { useCallback, useEffect, useState } from "react";

export type CardDensity = "compact" | "full";

const STORAGE_KEY = "gemach:cardDensity";
const DEFAULT_DENSITY: CardDensity = "full";

function readStored(): CardDensity {
  if (typeof window === "undefined") return DEFAULT_DENSITY;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "compact" || v === "full") return v;
  } catch {}
  return DEFAULT_DENSITY;
}

export function useCardDensity(): [CardDensity, (next: CardDensity) => void] {
  const [density, setDensityState] = useState<CardDensity>(readStored);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const v = e.newValue;
      if (v === "compact" || v === "full") setDensityState(v);
      else setDensityState(DEFAULT_DENSITY);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setDensity = useCallback((next: CardDensity) => {
    setDensityState(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {}
    }
  }, []);

  return [density, setDensity];
}
