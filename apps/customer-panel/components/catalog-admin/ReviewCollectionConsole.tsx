"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewCollectionOverview, ReviewCollectionSettings } from "@celebix/saas-contracts";
import { PanelEmptyState } from "@/components/panel/PanelPageShell";
import { reviewCollectionApi, ReviewCollectionApiError } from "@/lib/review-collection-ui/client";
import styles from "./review-collection.module.css";
const STATUS: Readonly<Record<string, string>> = { queued: "Gönderim bekliyor", leased: "Hazırlanıyor", sent: "Davet gönderildi", completed: "Yorum alındı", failed: "Gönderilemedi", suppressed: "Gönderim kapatıldı", requires_review: "Kontrol gerekiyor" };
const date = (value: string) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
export function ReviewCollectionConsole({ canManage, view }: Readonly<{ canManage: boolean; view: "requests" | "settings" }>) {
  const [data, setData] = useState<ReviewCollectionOverview | null>(null), [draft, setDraft] = useState<ReviewCollectionSettings | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(""), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const operations = useRef(new Map<string, string>()), settingOperation = useRef<string | null>(null);
  const load = useCallback(async (refreshSettings = true) => { setLoading(true); setError(""); try { const value = await reviewCollectionApi.overview(); setData(value); if (refreshSettings) { setDraft(value.settings); settingOperation.current = null; } } catch (caught) { setError(caught instanceof ReviewCollectionApiError ? caught.message : "Davetler yüklenemedi."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function save() {
    if (!draft || !canManage) return;
    setBusy("settings"); setError(""); setSuccess(""); settingOperation.current ??= crypto.randomUUID();
    try { const saved = await reviewCollectionApi.saveSettings(draft, settingOperation.current); setData(value => value ? { ...value, settings: saved } : value); setDraft(saved); settingOperation.current = null; setSuccess("Ayarlar uygulandı."); }
    catch (caught) { setError(caught instanceof ReviewCollectionApiError ? caught.message : "Ayarlar kaydedilemedi."); }
    finally { setBusy(""); }
  }
  async function request(order: ReviewCollectionOverview["eligibleOrders"][number]) {
    if (!canManage) return; setBusy(order.id); setError(""); setSuccess("");
    const key = `${order.id}:${order.version}`; if (!operations.current.has(key)) operations.current.set(key, crypto.randomUUID());
    try { const result = await reviewCollectionApi.requestOrder(order.id, order.version, operations.current.get(key)!); operations.current.delete(key); await load(false); setSuccess(`${result.queuedCount} ürün için yorum daveti sıraya alındı.`); }
    catch (caught) { setError(caught instanceof ReviewCollectionApiError ? caught.message : "Davet hazırlanamadı."); }
    finally { setBusy(""); }
  }
  const dirty = draft && data && (draft.enabled !== data.settings.enabled || draft.delayDays !== data.settings.delayDays);
  return <section className={styles.workspace} aria-busy={loading}>
    {error ? <div className={styles.feedback} role="alert"><p>{error}</p>{!dirty ? <button type="button" disabled={loading} onClick={() => void load()}>Yeniden yükle</button> : null}</div> : null}
    {success ? <p className={styles.feedback} role="status">{success}</p> : null}
    {loading && !data ? <p role="status">Yorum davetleri yükleniyor…</p> : null}
    {data && draft && view === "settings" ? <form className={styles.settings} onSubmit={event => { event.preventDefault(); void save(); }}>
      <div><h2>Otomatik yorum davetleri</h2><p>Teslim edilmiş, ödemesi tamamlanmış siparişler için e-posta gönderilir. Her ürün ve sipariş için bir davet hazırlanır.</p></div>
      <label className={styles.toggle}><input type="checkbox" checked={draft.enabled} disabled={!canManage || !!busy} onChange={event => { const enabled = event.currentTarget.checked; settingOperation.current = null; setDraft(value => value ? { ...value, enabled } : value); }} /><span>Otomatik davetleri etkinleştir</span></label>
      <label className={styles.field}>Teslimattan kaç gün sonra?<input type="number" min={1} max={60} required value={draft.delayDays} disabled={!canManage || !!busy} onChange={event => { const delayDays = Number(event.currentTarget.value); settingOperation.current = null; setDraft(value => value ? { ...value, delayDays } : value); }} /><small>1–60 gün. Yeni teslimatlar için uygulanır.</small></label>
      <p className={styles.help}>Yeni yorumlar inceleme bekler. E-posta davetlerini kapatan müşterilere gönderim yapılmaz. Önceden teslim edilen siparişlere otomatik davet başlatılmaz.</p>
      {canManage ? <div className={styles.actions}><button type="button" disabled={!dirty || !!busy} onClick={() => { setDraft(data.settings); settingOperation.current = null; setError(""); }}>Vazgeç</button><button className={styles.primary} type="submit" disabled={!dirty || !!busy}>{busy === "settings" ? "Kaydediliyor…" : "Uygula"}</button></div> : <p className={styles.help}>Yorum ayarlarını düzenleme yetkiniz bulunmuyor.</p>}
    </form> : null}
    {data && view === "requests" ? <>
      <div className={styles.sectionHeading}><h2>Davet geçmişi</h2><span>{data.requests.length} davet</span></div>
      {!data.requests.length ? <PanelEmptyState title="Henüz yorum daveti yok" description="Teslim edilmiş siparişlerden davet hazırlayın veya otomatik davetleri açın." /> : <div className={styles.history}>{data.requests.map(item => <article key={item.id}><div><strong>{item.productTitle}</strong><small>{item.orderNumber} · {item.customerName}</small></div><div><span>{STATUS[item.status]}</span><small>{date(item.status === "queued" ? item.scheduledAt : item.updatedAt)}</small>{item.status === "requires_review" ? <small>Belirsiz gönderim sonucu için otomatik tekrar durduruldu.</small> : item.status === "failed" ? <small>Gönderim bağlantısını ve e-posta ayarlarını kontrol edin.</small> : null}</div></article>)}</div>}
      <div className={styles.sectionHeading}><h2>Davet gönderilebilecek siparişler</h2><span>{data.eligibleOrders.length} sipariş</span></div>
      {!data.eligibleOrders.length ? <PanelEmptyState title="Uygun sipariş bulunmuyor" description="Ödemesi tamamlanan ve teslim edilen siparişler burada görünür." /> : <div className={styles.history}>{data.eligibleOrders.map(order => <article key={order.id}><div><strong>{order.orderNumber}</strong><small>{order.customerName} · {order.productCount} ürün</small><small>{date(order.deliveredAt)}</small></div>{canManage ? <button type="button" disabled={!!busy || loading} onClick={() => void request(order)}>{busy === order.id ? "Hazırlanıyor…" : "Davet gönder"}</button> : null}</article>)}</div>}
    </> : null}
  </section>;
}
