"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { OrderDetail, OrderListItem } from "@celebix/saas-contracts";
import { OrderApiError, orderApi } from "@/lib/order-ui/client";
import { OrderDetailPresentation } from "./OrderDetailConsole";
import styles from "./order-console.module.css";

const readOnly = Object.freeze({ fulfill: false, manage: false, payment: false, shipping: false, note: false });
const noop = () => {};

/** A bounded, read-only inspection; authorized forms remain on the direct detail route. */
export function OrderInspector({ selected, items, onSelect, onClose }: {
  selected: OrderListItem;
  items: readonly OrderListItem[];
  onSelect: (order: OrderListItem) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<{ id: string; detail?: OrderDetail; error?: string }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const node = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node?.showModal();
    return () => { node?.close(); document.body.style.overflow = previousOverflow; trigger?.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    let current = true;
    void orderApi.getOrder(selected.id).then(
      (detail) => { if (current) setResult({ id: selected.id, detail }); },
      (error: unknown) => { if (current) setResult({ id: selected.id, error: error instanceof OrderApiError ? error.message : "Sipariş yüklenemedi. Yeniden deneyin." }); },
    );
    return () => { current = false; };
  }, [selected.id, retry]);
  const active = result?.id === selected.id ? result : undefined;
  const index = items.findIndex((item) => item.id === selected.id);
  return <dialog ref={dialog} className={styles.inspector} aria-label="Sipariş hızlı inceleme" onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter((node) => node.getClientRects().length > 0);
    const first = targets[0], last = targets.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <div className={styles.inspectorHeader}>
      <strong>Hızlı inceleme</strong>
      <button type="button" onClick={() => { const previous = items[index - 1]; if (previous) onSelect(previous); }} disabled={index <= 0} aria-label="Önceki siparişi incele">←</button>
      <button type="button" onClick={() => { const next = items[index + 1]; if (next) onSelect(next); }} disabled={index < 0 || index >= items.length - 1} aria-label="Sonraki siparişi incele">→</button>
      <button type="button" onClick={onClose} aria-label="İncelemeyi kapat" autoFocus>✕</button>
    </div>
    <div className={styles.inspectorBody} key={selected.id}>
      <Link className={styles.primaryAction} href={`/orders/${selected.id}`}>Tam sayfada aç</Link>
      <p className={styles.scopeNote}>İşlem ve düzenlemeler tam detay sayfasında kullanılabilir.</p>
      {active?.detail && active.detail.version !== selected.version ? <p role="status" className={styles.scopeNote}>Sipariş listeden sonra güncellenmiş. Aşağıdaki bilgiler güncel kayda aittir.</p> : null}
      <OrderDetailPresentation state={!active ? "loading" : active.error ? "error" : "loaded"} detail={active?.detail} error={active?.error ?? ""} notice="" busy="" capabilities={readOnly} onRetry={() => { setResult(undefined); setRetry((value) => value + 1); }} onStatusChange={noop} onPaymentChange={noop} onShippingSubmit={noop} onNoteSubmit={noop} onNoteArchive={noop} />
    </div>
  </dialog>;
}
