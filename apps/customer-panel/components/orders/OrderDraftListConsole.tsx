"use client";

import type { OrderDraftListItem, OrderDraftStatus } from "@celebix/saas-contracts";
import { ChevronRight, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
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
        <Link className={styles.draftNumber} href={`/orders/drafts/${draft.id}`} title={draft.draftNumber}>{draft.draftNumber}</Link>
        <PanelStatusBadge tone={statusTone(draft.status)}>{STATUS_LABELS[draft.status]}</PanelStatusBadge>
      </div>
      <dl className={styles.cardFacts}>
        <div><dt>Müşteri</dt><dd>{draft.customerName}<small>{draft.customerEmail}</small></dd></div>
        <div><dt>Ürün satırı</dt><dd><span className={styles.lineCount}>{draft.lineCount.toLocaleString("tr-TR")}</span></dd></div>
        <div className={styles.totalFact}><dt>Toplam</dt><dd>{money(draft.totalCents)}</dd></div>
        <div><dt>Stok</dt><dd><span className={styles.inventoryPolicy}>{draft.adjustInventory ? "Dönüştürmede düş" : "Stok değiştirme"}</span></dd></div>
        <div><dt>Güncellendi</dt><dd>{date(draft.updatedAt)}</dd></div>
      </dl>
      <Link className={styles.recordLink} href={`/orders/drafts/${draft.id}`}>Taslağı aç<ChevronRight aria-hidden="true" size={15} /></Link>
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
        actions={canManage ? <Link className={styles.primaryAction} href="/orders/drafts/new"><Plus aria-hidden="true" size={15} /><span>Yeni taslak sipariş</span></Link> : undefined}
      />
      <section className={styles.listSurface} aria-label="Taslak sipariş çalışma alanı" data-panel-surface="open">
        {phase === "loading" ? <div className={styles.stateSurface}><p className={styles.state} role="status">Taslak siparişler yükleniyor…</p></div> : null}
        {phase === "error" ? <div className={styles.error} role="alert"><div><h2>Taslaklar yüklenemedi</h2><p>{error}</p></div><button type="button" onClick={() => void load()}>Tekrar dene</button></div> : null}
        {phase === "loaded" && items.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}><FileText aria-hidden="true" size={20} /></span>
            <h2>Henüz taslak sipariş yok</h2>
            <p>Müşteri talebini ürün ve teslimat bilgileriyle kaydettiğinizde burada görünecek.</p>
            {canManage ? <Link className={styles.primaryAction} href="/orders/drafts/new"><Plus aria-hidden="true" size={15} /><span>İlk taslağı oluştur</span></Link> : null}
          </div>
        ) : null}
        {phase === "loaded" && items.length > 0 ? (
          <div className={styles.tableSurface}>
            <div className={styles.tableContext}><span className={styles.contextIcon}><FileText aria-hidden="true" size={16} /></span><div><strong>Taslak sipariş kayıtları</strong></div></div>
            <div className={styles.desktopTable}>
              <table aria-label="Taslak sipariş listesi">
                <thead><tr><th className={styles.draftColumn}>Taslak</th><th className={styles.customerColumn}>Müşteri</th><th className={styles.statusColumn}>Durum</th><th className={styles.linesColumn}>Satır</th><th className={styles.inventoryColumn}>Stok politikası</th><th className={styles.totalColumn}>Toplam</th><th className={styles.updatedColumn}>Güncellendi</th><th className={styles.actionColumn}>İşlem</th></tr></thead>
                <tbody>{items.map((draft) => <tr key={draft.id}>
                  <td className={styles.draftCell}><Link className={styles.draftNumber} href={`/orders/drafts/${draft.id}`} title={draft.draftNumber}>{draft.draftNumber}</Link></td>
                  <td className={styles.customerCell}><strong>{draft.customerName}</strong><small>{draft.customerEmail}</small></td>
                  <td className={styles.statusCell}><PanelStatusBadge tone={statusTone(draft.status)}>{STATUS_LABELS[draft.status]}</PanelStatusBadge></td>
                  <td className={styles.linesCell}><span className={styles.lineCount}>{draft.lineCount.toLocaleString("tr-TR")}</span></td>
                  <td className={styles.inventoryCell}><span className={styles.inventoryPolicy}>{draft.adjustInventory ? "Siparişe dönüşünce düş" : "Stok değiştirme"}</span></td>
                  <td className={styles.totalCell}><strong>{money(draft.totalCents)}</strong></td>
                  <td className={styles.updatedCell}>{date(draft.updatedAt)}</td>
                  <td className={styles.actionCell}><Link className={styles.recordLink} href={`/orders/drafts/${draft.id}`} aria-label="Taslağı aç">Aç<ChevronRight aria-hidden="true" size={14} /></Link></td>
                </tr>)}</tbody>
              </table>
            </div>
            <div className={styles.mobileCards}>{items.map((draft) => <DraftCard key={draft.id} draft={draft} />)}</div>
            {nextCursor ? <button className={styles.loadMore} type="button" disabled={loadingMore} onClick={() => void load(nextCursor)}>{loadingMore ? "Yükleniyor…" : "Daha fazla taslak yükle"}</button> : null}
          </div>
        ) : null}
      </section>
    </PanelPageShell>
  );
}
