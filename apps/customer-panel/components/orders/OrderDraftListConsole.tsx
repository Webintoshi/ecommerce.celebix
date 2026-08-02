"use client";

import type { OrderDraftListItem, OrderDraftStatus } from "@celebix/saas-contracts";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  PanelActionButton,
  PanelEmptyState,
  PanelPageHeader,
  PanelPageShell,
  PanelStatusBadge,
} from "@/components/panel/PanelPageShell";
import { OrderApiError, orderApi } from "@/lib/order-ui/client";
import styles from "./order-drafts.module.css";

type Phase = "loading" | "loaded" | "error";

const STATUS_LABELS: Readonly<Record<OrderDraftStatus, string>> = Object.freeze({
  draft: "Taslak",
  converted: "Siparişe dönüştürüldü",
  archived: "Arşivlendi",
});

function statusTone(status: OrderDraftStatus): "neutral" | "success" | "warning" {
  return status === "converted" ? "success" : status === "draft" ? "warning" : "neutral";
}

function money(cents: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(cents / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function errorMessage(error: unknown) {
  return error instanceof OrderApiError
    ? error.message
    : "Taslak siparişler şu anda yüklenemiyor. Lütfen yeniden deneyin.";
}

function DraftCard({ draft }: { draft: OrderDraftListItem }) {
  return (
    <article className={styles.draftCard}>
      <div className={styles.cardHeading}>
        <Link href={`/orders/drafts/${draft.id}`}>{draft.draftNumber}</Link>
        <PanelStatusBadge tone={statusTone(draft.status)}>{STATUS_LABELS[draft.status]}</PanelStatusBadge>
      </div>
      <dl className={styles.cardFacts}>
        <div><dt>Müşteri</dt><dd>{draft.customerName}<small>{draft.customerEmail}</small></dd></div>
        <div><dt>Ürün satırı</dt><dd>{draft.lineCount.toLocaleString("tr-TR")}</dd></div>
        <div><dt>Toplam</dt><dd>{money(draft.totalCents)}</dd></div>
        <div><dt>Stok</dt><dd>{draft.adjustInventory ? "Dönüştürmede düş" : "Stok değiştirme"}</dd></div>
        <div><dt>Güncellendi</dt><dd>{date(draft.updatedAt)}</dd></div>
      </dl>
      <Link className={styles.recordLink} href={`/orders/drafts/${draft.id}`}>Taslağı aç</Link>
    </article>
  );
}

export function OrderDraftListConsole({ canManage }: { canManage: boolean }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [items, setItems] = useState<readonly OrderDraftListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  const load = useCallback(async (cursor?: string) => {
    const request = ++requestSequence.current;
    cursor ? setLoadingMore(true) : setPhase("loading");
    setError("");
    try {
      const result = await orderApi.listDrafts({ pageSize: 25, ...(cursor ? { cursor } : {}) });
      if (request !== requestSequence.current) return;
      setItems((current) => cursor ? Object.freeze([...current, ...result.items]) : result.items);
      setNextCursor(result.nextCursor);
      setPhase("loaded");
    } catch (failure) {
      if (request !== requestSequence.current) return;
      setError(errorMessage(failure));
      setPhase("error");
    } finally {
      if (request === requestSequence.current) setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [load]);

  return (
    <PanelPageShell>
      <PanelPageHeader
        title="Taslak Siparişler"
        description="Telefon, e-posta veya mağaza içi talepleri kaydedin; hazır olduğunda gerçek siparişe dönüştürün."
        actions={canManage ? <PanelActionButton primary href="/orders/drafts/new">Yeni taslak sipariş</PanelActionButton> : undefined}
      />
      <section className={styles.listSurface} aria-label="Taslak sipariş çalışma alanı" data-panel-surface="open">
        {phase === "loading" ? <p className={styles.state} role="status">Taslak siparişler yükleniyor…</p> : null}
        {phase === "error" ? <div className={styles.error} role="alert"><div><h2>Taslaklar yüklenemedi</h2><p>{error}</p></div><button type="button" onClick={() => void load()}>Tekrar dene</button></div> : null}
        {phase === "loaded" && items.length === 0 ? (
          <PanelEmptyState
            title="Henüz taslak sipariş yok"
            description="Müşteri talebini ürün ve teslimat bilgileriyle kaydettiğinizde burada görünecek."
            action={canManage ? <PanelActionButton primary href="/orders/drafts/new">İlk taslağı oluştur</PanelActionButton> : undefined}
          />
        ) : null}
        {phase === "loaded" && items.length > 0 ? (
          <>
            <div className={styles.desktopTable}>
              <table aria-label="Taslak sipariş listesi">
                <thead><tr><th>Taslak</th><th>Müşteri</th><th>Durum</th><th>Satır</th><th>Stok politikası</th><th>Toplam</th><th>Güncellendi</th><th>İşlem</th></tr></thead>
                <tbody>{items.map((draft) => <tr key={draft.id}>
                  <td><Link href={`/orders/drafts/${draft.id}`}>{draft.draftNumber}</Link></td>
                  <td><strong>{draft.customerName}</strong><small>{draft.customerEmail}</small></td>
                  <td><PanelStatusBadge tone={statusTone(draft.status)}>{STATUS_LABELS[draft.status]}</PanelStatusBadge></td>
                  <td>{draft.lineCount.toLocaleString("tr-TR")}</td>
                  <td>{draft.adjustInventory ? "Siparişe dönüşünce düş" : "Stok değiştirme"}</td>
                  <td><strong>{money(draft.totalCents)}</strong></td>
                  <td>{date(draft.updatedAt)}</td>
                  <td><Link className={styles.recordLink} href={`/orders/drafts/${draft.id}`}>Taslağı aç</Link></td>
                </tr>)}</tbody>
              </table>
            </div>
            <div className={styles.mobileCards}>{items.map((draft) => <DraftCard key={draft.id} draft={draft} />)}</div>
            {nextCursor ? <button className={styles.loadMore} type="button" disabled={loadingMore} onClick={() => void load(nextCursor)}>{loadingMore ? "Yükleniyor…" : "Daha fazla taslak yükle"}</button> : null}
          </>
        ) : null}
      </section>
    </PanelPageShell>
  );
}
