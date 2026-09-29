"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PromotionAnalyticsDetailResult, PromotionDetail } from "@celebix/saas-contracts";
import { PanelLoadingState, PanelPageHeader } from "@/components/panel/PanelPageShell";
import { promotionApi } from "@/lib/promotion-ui/client";
import { formatPromotionMinor } from "@/lib/promotion-ui/model";
import styles from "./promotion-studio.module.css";

export function PromotionAnalytics({ promotionId }: Readonly<{ promotionId: string }>) {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [promotion, setPromotion] = useState<PromotionDetail | null>(null);
  const [report, setReport] = useState<PromotionAnalyticsDetailResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setFailed(false); setReport(null);
    void Promise.all([promotionApi.detail(promotionId, controller.signal), promotionApi.analytics(promotionId, days, controller.signal)])
      .then(([detail, analytics]) => { setPromotion(detail); setReport(analytics); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [promotionId, days, retry]);
  return <section className={styles.list}>
    <PanelPageHeader title="Kampanya analizi" />
    <header className={styles.pageHeader}><div><h1 className={styles.srOnly}>Kampanya analizi</h1><strong className={styles.recordName}>{promotion?.name ?? "Kampanya"}</strong><p>Ödemesi tamamlanan siparişler</p></div><Link href={`/discounts/${promotionId}`}>Kampanyaya dön</Link></header>
    <div className={styles.kpiHeader}><h2>Performans</h2><div role="group" aria-label="Analiz dönemi">{([7, 30, 90] as const).map((value) => <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>Son {value} gün</button>)}</div></div>
    {failed ? <div role="alert" className={styles.error}>Analiz yüklenemedi. <button type="button" className={styles.textButton} onClick={() => setRetry((value) => value + 1)}>Yeniden dene</button></div> : null}
    {!failed && !report ? <PanelLoadingState label="Kampanya analizi yükleniyor…" /> : null}
    {report ? <>
      {report.currencies.length === 0 ? <p className={styles.info}>Bu dönemde kampanyalı, ödemesi tamamlanmış sipariş yok.</p> : <div className={styles.kpis}>{report.currencies.map((row) => <article key={row.currency}><span>{row.currency}</span><strong>{row.affectedOrders} sipariş</strong><small>{row.usageCount} kullanım · {formatPromotionMinor(row.discountMinor, row.currency)} indirim</small><small>{formatPromotionMinor(row.netRevenueMinor, row.currency)} net ciro · {formatPromotionMinor(row.averageOrderMinor, row.currency)} ortalama</small><small>{row.newCustomerOrders} yeni müşteri · {row.recoveredOrders} geri kazanılan sepet</small></article>)}</div>}
      <div className={styles.reportGrid}>
        <article><h2>Kaynaklar</h2>{report.attribution.length ? <div className={styles.reportTable} role="region" aria-label="Kampanya kaynakları tablosu" tabIndex={0}><table><thead><tr><th scope="col">Kaynak</th><th scope="col">Kampanya</th><th scope="col">Sipariş</th><th scope="col">Ciro</th></tr></thead><tbody>{report.attribution.map((row) => <tr key={`${row.source}:${row.medium}:${row.campaign}:${row.currency}`}><td>{row.source} / {row.medium}</td><td>{row.campaign ?? "—"}</td><td>{row.orders}</td><td>{formatPromotionMinor(row.revenueMinor, row.currency)}</td></tr>)}</tbody></table></div> : <p>Kaynak verisi yok.</p>}</article>
        <article><h2>En çok satan ürünler</h2>{report.topProducts.length ? <ol>{report.topProducts.map((row) => <li key={`${row.productId}:${row.currency}`}><span>{row.label}</span><strong>{row.quantity} adet · {formatPromotionMinor(row.revenueMinor, row.currency)}</strong></li>)}</ol> : <p>Ürün verisi yok.</p>}</article>
        <article><h2>En çok satan kategoriler</h2>{report.topCategories.length ? <ol>{report.topCategories.map((row) => <li key={`${row.categoryId}:${row.currency}`}><span>{row.label}</span><strong>{row.quantity} adet · {formatPromotionMinor(row.revenueMinor, row.currency)}</strong></li>)}</ol> : <p>Kategori verisi yok.</p>}</article>
      </div>
    </> : null}
  </section>;
}
