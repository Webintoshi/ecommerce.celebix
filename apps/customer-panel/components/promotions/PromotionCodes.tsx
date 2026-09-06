"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PromotionCodeBatchListItem, PromotionDetail } from "@celebix/saas-contracts";
import { PanelLoadingState } from "@/components/panel/PanelPageShell";
import { promotionApi, promotionErrorMessage } from "@/lib/promotion-ui/client";
import { zonedLocalInputToIso } from "@/lib/promotion-ui/model";
import styles from "./promotion-studio.module.css";

export function PromotionCodes({ promotionId, timezone, storefrontOrigin, canPublish, canExportCodes }: Readonly<{ promotionId: string; timezone: string; storefrontOrigin: string | null; canPublish: boolean; canExportCodes: boolean }>) {
  const [promotion, setPromotion] = useState<PromotionDetail | null>(null), [items, setItems] = useState<readonly PromotionCodeBatchListItem[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [count, setCount] = useState("100"), [prefix, setPrefix] = useState("VIP_"), [codeLength, setCodeLength] = useState("12"), [perCustomer, setPerCustomer] = useState("1"), [expiresAt, setExpiresAt] = useState("");
  const load = () => { setLoading(true); void Promise.all([promotionApi.detail(promotionId), promotionApi.listCodeBatches(promotionId)]).then(([detail, page]) => { setPromotion(detail); setItems(page.items); setMessage(""); }).catch(() => setMessage("Kupon grupları yüklenemedi.")).finally(() => setLoading(false)); };
  useEffect(load, [promotionId]);
  const create = () => {
    if (busy || !canPublish) return;
    let expiry: string | null = null; try { expiry = expiresAt ? zonedLocalInputToIso(expiresAt, timezone) : null; } catch { setMessage("Geçerli bir son kullanım zamanı seçin."); return; }
    setBusy(true); setMessage(""); void promotionApi.createCodeBatch(promotionId, { count: Number(count), prefix, codeLength: Number(codeLength), perCustomerUsage: Number(perCustomer), expiresAt: expiry }).then(() => { setMessage("Kupon grubu oluşturuldu."); load(); }).catch((error: unknown) => setMessage(promotionErrorMessage(error instanceof Error ? error.message : "promotion_unavailable"))).finally(() => setBusy(false));
  };
  const transition = (batch: PromotionCodeBatchListItem, nextStatus: "active" | "paused" | "revoked") => { if (busy || !canPublish) return; if (nextStatus === "revoked" && !window.confirm("Bu kupon grubu kalıcı olarak iptal edilsin mi?")) return; setBusy(true); void promotionApi.updateCodeBatch(batch, nextStatus).then(() => { setMessage("Kupon grubu güncellendi."); load(); }).catch((error: unknown) => setMessage(promotionErrorMessage(error instanceof Error ? error.message : "promotion_unavailable"))).finally(() => setBusy(false)); };
  const primaryCode = promotion?.ruleDocument.trigger.kind === "code" ? promotion.ruleDocument.trigger.codes[0] ?? null : null;
  const shareUrl = storefrontOrigin && primaryCode ? `${storefrontOrigin}/cart/coupon?coupon=${encodeURIComponent(primaryCode)}` : null;
  return <section className={styles.list}>
    <header className={styles.pageHeader}><div><span className={styles.eyebrow}>Toplu kuponlar</span><h1>{promotion?.name ?? "Kampanya"}</h1><p>Tek kullanımlık kupon grupları oluşturun, durdurun ve CSV olarak indirin.</p></div><Link href={`/discounts/${promotionId}`}>Kampanyaya dön</Link></header>
    {shareUrl ? <div className={styles.info}><strong>Paylaşılabilir kampanya bağlantısı</strong><p><a href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a></p><button type="button" onClick={() => void navigator.clipboard.writeText(shareUrl).then(() => setMessage("Bağlantı kopyalandı."))}>Bağlantıyı kopyala</button></div> : <p className={styles.info}>Paylaşılabilir bağlantı için kodlu kampanya ve doğrulanmış birincil mağaza alan adı gerekir.</p>}
    {canPublish ? <fieldset className={styles.batchForm}><legend>Yeni kupon grubu</legend><label>Kupon adedi<input inputMode="numeric" value={count} onChange={(event) => setCount(event.target.value)} /></label><label>Önek<input value={prefix} onChange={(event) => setPrefix(event.target.value.toUpperCase())} /></label><label>Toplam kod uzunluğu<input inputMode="numeric" value={codeLength} onChange={(event) => setCodeLength(event.target.value)} /></label><label>Müşteri başı kullanım<input inputMode="numeric" value={perCustomer} onChange={(event) => setPerCustomer(event.target.value)} /></label><label>Son kullanım (isteğe bağlı)<input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label><button className={styles.primaryButton} disabled={busy} type="button" onClick={create}>Kuponları oluştur</button></fieldset> : null}
    {message ? <p role="status" className={styles.toast}>{message}</p> : null}
    {loading ? <PanelLoadingState label="Kupon grupları yükleniyor…" /> : items.length === 0 ? <p className={styles.info}>Henüz toplu kupon grubu yok.</p> : <div className={styles.desktopTable}><table aria-label="Kupon grupları"><thead><tr><th>Önek</th><th>Durum</th><th>Toplam</th><th>Kullanılan</th><th>Bekleyen</th><th>Kalan</th><th>Aksiyonlar</th></tr></thead><tbody>{items.map((batch) => <tr key={batch.id}><td>{batch.prefix || "—"}</td><td>{batch.status}</td><td>{batch.count}</td><td>{batch.used}</td><td>{batch.held}</td><td>{batch.remaining}</td><td className={styles.rowActions}>{canPublish && batch.status === "active" ? <button type="button" disabled={busy} onClick={() => transition(batch, "paused")}>Duraklat</button> : null}{canPublish && batch.status === "paused" ? <button type="button" disabled={busy} onClick={() => transition(batch, "active")}>Etkinleştir</button> : null}{canPublish && batch.status !== "revoked" ? <button type="button" disabled={busy} onClick={() => transition(batch, "revoked")}>İptal et</button> : null}{canExportCodes ? <a href={`/api/promotions/code-batches/${batch.id}/csv`} download>CSV indir</a> : null}</td></tr>)}</tbody></table></div>}
  </section>;
}
