"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { parseProductPageReviewAvailability, type ProductPageReviewAvailability, type ReviewSubmission } from "@celebix/saas-contracts";
import styles from "./product-page-review-form.module.css";

export function ProductPageReviewForm({ productId, returnTo }: Readonly<{ productId: string; returnTo: string }>) {
  const id = useId(), live = useRef(false), reading = useRef<AbortController | null>(null), sending = useRef(false);
  const operation = useRef<Readonly<{ id: string; review: ReviewSubmission }> | null>(null);
  const [availability, setAvailability] = useState<ProductPageReviewAvailability | null>(null);
  const [readError, setReadError] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [done, setDone] = useState(false), [uncertain, setUncertain] = useState(false), [closed, setClosed] = useState(false), [needsLogin, setNeedsLogin] = useState(false);
  const [name, setName] = useState(""), [title, setTitle] = useState(""), [body, setBody] = useState(""), [rating, setRating] = useState(0);
  const endpoint = `/api/products/${productId}/reviews`;
  const login = `/account/login?returnTo=${encodeURIComponent(returnTo)}`;
  const load = useCallback(async () => {
    reading.current?.abort(); const controller = new AbortController(); reading.current = controller;
    setLoading(true); setReadError(false);
    try {
      const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("review_read_failed");
      const value = parseProductPageReviewAvailability(await response.json());
      if (live.current && !controller.signal.aborted) setAvailability(value);
    } catch { if (live.current && !controller.signal.aborted) setReadError(true); }
    finally { if (live.current && !controller.signal.aborted) setLoading(false); }
  }, [endpoint]);
  useEffect(() => { live.current = true; void load(); return () => { live.current = false; reading.current?.abort(); }; }, [load]);

  async function submit() {
    if (sending.current || closed) return;
    operation.current ??= { id: crypto.randomUUID(), review: { reviewerName: name.trim(), rating, ...(title.trim() ? { title: title.trim() } : {}), body: body.trim().replace(/\s+/gu, " ") } };
    sending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json", "idempotency-key": operation.current.id }, body: JSON.stringify({ review: operation.current.review }) });
      const value = await response.json().catch(() => null);
      if (!live.current) return;
      if (response.ok && value?.status === "pending" && Object.keys(value).length === 1) { setDone(true); setUncertain(false); return; }
      if (response.status === 409 && value?.code === "already_submitted") { setAvailability({ enabled: true, state: "submitted" }); setUncertain(false); return; }
      const knownFailure = [400, 401, 403, 404, 429].includes(response.status);
      setUncertain(!knownFailure);
      if (knownFailure) operation.current = null;
      if (response.status === 401) setNeedsLogin(true);
      if ([403, 404].includes(response.status)) setClosed(true);
      setError(typeof value?.message === "string" ? value.message : "Gönderim tamamlanamadı. Yorumunuz korunuyor; yeniden deneyin.");
    } catch { if (live.current) { setUncertain(true); setError("Gönderim sonucu doğrulanamadı. Aynı yorumu yeniden gönderebilirsiniz."); } }
    finally { sending.current = false; if (live.current) setBusy(false); }
  }

  if ((loading && !availability) || availability?.enabled === false) return null;
  const locked = busy || uncertain || closed;
  return <section className={`${styles.section} store-container`} id="product-review-form" aria-labelledby={`${id}-heading`}>
    <div className={styles.card} aria-busy={loading || busy}>
      <header><h2 id={`${id}-heading`}>Ürün hakkında yorum yapın</h2><p>Deneyiminiz, bu ürünü inceleyen müşterilere yardımcı olur.</p></header>
      {readError ? <div className={styles.feedback} role="alert"><p>Yorum alanı yüklenemedi.</p><button type="button" disabled={loading} onClick={() => void load()}>Tekrar dene</button></div> : null}
      {availability?.enabled && availability.state === "guest" ? <div className={styles.guest}><p>Yorum yazmak için WhatsApp ile hesabınıza giriş yapın.</p><a className={styles.primary} href={login}>Giriş yap ve yorum yaz</a></div> : null}
      {done || (availability?.enabled && availability.state === "submitted") ? <p className={styles.feedback} role="status">{done ? "Teşekkür ederiz. Yorumunuz mağazanın incelemesinden sonra yayımlanacak." : "Bu ürün için yorumunuzu daha önce aldık."}</p> : null}
      {!done && availability?.enabled && availability.state === "available" ? <form onSubmit={event => { event.preventDefault(); void submit(); }}>
        <fieldset className={styles.rating} disabled={locked}><legend>Puanınız</legend><div>{[1, 2, 3, 4, 5].map(value => <label key={value}><input type="radio" name="rating" value={value} checked={rating === value} required onChange={() => { setRating(value); operation.current = null; }} /><span aria-hidden="true">{value <= rating ? "★" : "☆"}</span><span className={styles.srOnly}>{value} yıldız</span></label>)}</div></fieldset>
        <div className={styles.fields}><label htmlFor={`${id}-name`}>Yayında görünen adınız<input id={`${id}-name`} name="reviewerName" required maxLength={120} autoComplete="name" value={name} disabled={locked} onChange={event => { setName(event.currentTarget.value); operation.current = null; }} /></label><label htmlFor={`${id}-title`}>Başlık <small>İsteğe bağlı</small><input id={`${id}-title`} maxLength={200} value={title} disabled={locked} onChange={event => { setTitle(event.currentTarget.value); operation.current = null; }} /></label></div>
        <label htmlFor={`${id}-body`}>Yorumunuz<textarea id={`${id}-body`} required maxLength={2000} rows={4} value={body} disabled={locked} onChange={event => { setBody(event.currentTarget.value); operation.current = null; }} /><small>{body.length} / 2000</small></label>
        <p className={styles.help}>Adınız ve yorumunuz yayımlanabilir. Telefon, adres veya ödeme bilgilerinizi yorumunuza yazmayın.</p>
        {error ? <p className={styles.feedback} role="alert">{error}</p> : null}
        {needsLogin ? <a href={login}>Hesabınıza yeniden giriş yapın</a> : null}
        <div className={styles.actions}><span>Yorumlar yayımlanmadan önce incelenir.</span><button className={styles.primary} type="submit" disabled={busy || closed || !name.trim() || !body.trim() || rating < 1}>{busy ? "Gönderiliyor…" : uncertain ? "Yeniden gönder" : "Yorumu gönder"}</button></div>
      </form> : null}
    </div>
  </section>;
}
