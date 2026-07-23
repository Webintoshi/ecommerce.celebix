"use client";

import { useEffect, useState, type ReactNode } from "react";

import { PanelEmptyState } from "@/components/panel/PanelPageShell";
import styles from "./inventory-console.module.css";

export type InventoryListPhase = "loading" | "loaded" | "error" | "denied";

export function useInventoryCollection<Item>(options: Readonly<{
  enabled?: boolean;
  canRead: boolean;
  initial?: readonly Item[];
  load: (signal?: AbortSignal) => Promise<readonly Item[]>;
}>) {
  const [phase, setPhase] = useState<InventoryListPhase>(options.canRead ? (options.initial ? "loaded" : "loading") : "denied");
  const [items, setItems] = useState<readonly Item[]>(options.initial ?? []);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (options.enabled === false || !options.canRead || options.initial) return;
    const request = new AbortController();
    setPhase("loading");
    setError("");
    void options.load(request.signal).then((result) => {
      if (!request.signal.aborted) { setItems(result); setPhase("loaded"); }
    }).catch((caught: unknown) => {
      if (!request.signal.aborted) {
        setError(caught instanceof Error && caught.message ? caught.message : "Envanter listesi yüklenemedi.");
        setPhase("error");
      }
    });
    return () => request.abort();
  }, [options.canRead, options.enabled, options.initial, options.load, revision]);

  return Object.freeze({ phase, items, error, retry: () => setRevision((value) => value + 1) });
}

export function InventoryListState(props: Readonly<{
  state: InventoryListPhase;
  count: number;
  error: string;
  emptyTitle: string;
  emptyDescription: string;
  onRetry: () => void;
  children: ReactNode;
}>) {
  if (props.state === "denied") return <div className={styles.denied} role="status"><h2>Erişim yok</h2><p>Bu envanter listesini görüntüleme yetkiniz yok.</p></div>;
  if (props.state === "loading") return <div className={styles.state} role="status" aria-live="polite">Kalıcı envanter kayıtları yükleniyor…</div>;
  if (props.state === "error") return <div className={styles.error} role="alert"><h2>Liste yüklenemedi</h2><p>{props.error}</p><button type="button" onClick={props.onRetry}>Tekrar dene</button></div>;
  if (props.count === 0) return <PanelEmptyState title={props.emptyTitle} description={props.emptyDescription} />;
  return <>{props.children}</>;
}
