"use client";

import { useEffect, useState, type ReactNode } from "react";

import { PanelEmptyState } from "@/components/panel/PanelPageShell";
import styles from "./inventory-console.module.css";

export type InventoryListPhase = "loading" | "loaded" | "error" | "denied";

export function useInventoryCollection<Item>(options: Readonly<{
  enabled?: boolean;
  refreshKey?: number;
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
  }, [options.canRead, options.enabled, options.initial, options.load, options.refreshKey, revision]);

  return Object.freeze({ phase: !options.canRead ? "denied" as const : phase, items, error, retry: () => setRevision((value) => value + 1) });
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
  return <div className={styles.listBody} data-inventory-list-body aria-busy={props.state === "loading"}>
    {props.state === "denied" ? <div className={styles.denied} role="status"><h2>Erişim yok</h2><p>Bu envanter listesini görüntüleme yetkiniz yok.</p></div> : <>
      {props.state === "error" ? <div className={styles.error} role="alert"><h2>Liste yüklenemedi</h2><p>{props.error}</p>{props.count > 0 ? <p>Son alınan kayıtlar gösteriliyor.</p> : null}<button type="button" onClick={props.onRetry}>Tekrar dene</button></div> : null}
      {props.state === "loading" && props.count === 0 ? <InventoryLoading />
        : props.count === 0 ? props.state === "error" ? null : <PanelEmptyState title={props.emptyTitle} description={props.emptyDescription} />
        : props.children}
    </>}
  </div>;
}

export function InventoryLoading({ label = "Kalıcı envanter kayıtları yükleniyor…", editor = false }: { label?: string; editor?: boolean }) {
  return <div className={`${styles.listBody} ${editor ? styles.editorLoading : styles.listLoading}`} role="status" aria-label={label}>
    <span className={styles.srOnly}>{label}</span>
    {Array.from({ length: editor ? 3 : 5 }, (_, index) => <div className={styles.loadingRow} key={index} aria-hidden="true"><span /><span /><span /></div>)}
  </div>;
}
