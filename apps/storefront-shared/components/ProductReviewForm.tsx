"use client";
import { useEffect, useRef, useState } from "react";
import { parseReviewInvitation, type ReviewInvitation } from "@celebix/saas-contracts";
import styles from "./product-review-form.module.css";
export function ProductReviewForm({ storeName }: Readonly<{ storeName: string }>) {
  const [invitation, setInvitation] = useState<ReviewInvitation | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState(false), [unsubscribe, setUnsubscribe] = useState(false), [optedOut, setOptedOut] = useState(false), [rating, setRating] = useState(5), [name, setName] = useState(""), [title, setTitle] = useState(""), [body, setBody] = useState("");
  const token = useRef(""), operation = useRef<string | null>(null);
  async function call(action: string, value: unknown, key?: string) { const result = await fetch(`/api/reviews/${action}`, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) }, body: JSON.stringify(value) }); const json = await result.json().catch(() => null); if (!result.ok) throw new Error(typeof json?.message === "string" ? json.message : "İşlem tamamlanamadı. Tekrar deneyin."); return json; }
  useEffect(() => {
    const hash = window.location.hash.slice(1), optout = hash.startsWith("unsubscribe="); token.current = optout ? hash.slice(12) : hash; setUnsubscribe(optout);
    // The invitation capability stays in the URL fragment, away from request/referrer logs.
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token.current)) { setError("Geçerli yorum daveti bağlantısını kullanın."); setLoading(false); return; }
    if (optout) { setLoading(false); return; }
    let active = true; void call("invitation", { token: token.current }).then(value => { if (active) { const result = parseReviewInvitation(value); setInvitation(result); setDone(result.kind === "completed"); } }).catch(caught => { if (active) setError(caught instanceof Error ? caught.message : "Davet açılamadı."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; };
  }, []);
  async function submit() {
    setBusy(true); setError(""); operation.current ??= crypto.randomUUID();
    try { await call("submit", { token: token.current, review: { reviewerName: name.trim(), rating, ...(title.trim() ? { title: title.trim() } : {}), body: body.trim().replace(/\s+/gu, " ") } }, operation.current); setDone(true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Yorum gönderilemedi."); }
    finally { setBusy(false); }
  }
  async function optOut() { setBusy(true); setError(""); try { await call("unsubscribe", { token: token.current }); setOptedOut(true); } catch (caught) { setError(caught instanceof Error ? caught.message : "İşlem tamamlanamadı."); } finally { setBusy(false); } }
  return <main className={styles.page}><section className={styles.card} aria-busy={loading || busy}><p className={styles.store}>{storeName}</p>
    <h1>{unsubscribe ? "Yorum davetleri" : done ? "Yorumunuz alındı" : "Deneyiminizi paylaşın"}</h1>
    {loading ? <p role="status">Davet kontrol ediliyor…</p> : null}
    {error ? <p className={styles.feedback} role="alert">{error}</p> : null}
    {!loading && unsubscribe ? optedOut ? <p role="status">Bu mağazadan yeni yorum daveti almayacaksınız.</p> : <><p>Bu mağazadan e-posta ile yorum daveti almayı kapatabilirsiniz. Sipariş bildirimleriniz devam eder.</p><button type="button" disabled={busy || !token.current} onClick={() => void optOut()}>{busy ? "Kaydediliyor…" : "Yorum davetlerini kapat"}</button></> : null}
    {!loading && !unsubscribe && done ? <p role="status">Teşekkür ederiz. Yorumunuz mağazanın incelemesinden sonra yayımlanacak.</p> : null}
    {!loading && !unsubscribe && invitation && !done ? <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <div className={styles.product}><strong>{invitation.productTitle}</strong><span>✓ Doğrulanmış alışveriş</span></div>
      <fieldset className={styles.rating} disabled={busy}><legend>Ürüne kaç puan verirsiniz?</legend>{[1, 2, 3, 4, 5].map(value => <label key={value}><input type="radio" name="rating" value={value} checked={rating === value} onChange={() => { setRating(value); operation.current = null; }} /><span aria-hidden="true">{value <= rating ? "★" : "☆"}</span><span className={styles.srOnly}>{value} yıldız</span></label>)}</fieldset>
      <label>Yayında görünen adınız<input required maxLength={120} value={name} disabled={busy} autoComplete="name" onChange={event => { setName(event.currentTarget.value); operation.current = null; }} /><small>Adınız ve yorumunuz mağazada gösterilebilir.</small></label>
      <label>Yorum başlığı <small>İsteğe bağlı</small><input maxLength={200} value={title} disabled={busy} onChange={event => { setTitle(event.currentTarget.value); operation.current = null; }} /></label>
      <label>Yorumunuz<textarea required maxLength={2000} rows={5} value={body} disabled={busy} onChange={event => { setBody(event.currentTarget.value); operation.current = null; }} /><small>{body.length} / 2000</small></label>
      <p className={styles.help}>Sipariş ve iletişim bilgileriniz yorumda yayımlanmaz. Kart veya kişisel iletişim bilgilerinizi yorumunuza yazmayın.</p><button type="submit" disabled={busy || !name.trim() || !body.trim()}>{busy ? "Gönderiliyor…" : "Yorumu gönder"}</button>
    </form> : null}
    <a className={styles.back} href="/">Mağazaya dön</a>
  </section></main>;
}
