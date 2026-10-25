"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { parseProductPageReviewAvailability, parseReviewSubmission, type ProductPageReviewAvailability } from "@celebix/saas-contracts";
import { safeAccountReturnTo } from "../lib/account/request.ts";
import { clearProductReviewDraft, readProductReviewDraft, writeProductReviewDraft, type ProductReviewDraft, type ReviewDraftFields } from "../lib/reviews/product-page-draft.ts";
import styles from "./product-page-review-form.module.css";

const EMPTY_FIELDS: ReviewDraftFields = { reviewerName: "", title: "", body: "", rating: 0 };
const STORAGE_ERROR = "Yorumunuz bu tarayıcıda kaydedilemedi. Alanlarınız burada korunuyor. Tarayıcınızın gizlilik ayarlarını kontrol edip yeniden deneyin.";
const UNCERTAIN_ERROR = "Gönderim sonucu doğrulanamadı. Alanlarınız korunuyor; aynı yorumu yeniden gönderebilirsiniz.";

function saveDraft(value: ProductReviewDraft): boolean {
  try { return writeProductReviewDraft(window.sessionStorage, value); } catch { return false; }
}
function removeDraft(productId: string) {
  try { clearProductReviewDraft(window.sessionStorage, productId); } catch { /* The current view still cancels the intent when storage is blocked. */ }
}

export function ProductPageReviewForm({ productId, returnTo }: Readonly<{ productId: string; returnTo: string }>) {
  const id = useId();
  const section = useRef<HTMLElement | null>(null), heading = useRef<HTMLHeadingElement | null>(null);
  const live = useRef(false), reading = useRef<AbortController | null>(null), sending = useRef(false), redirecting = useRef(false);
  const draft = useRef<ProductReviewDraft | null>(null);
  const restoredAuthIntent = useRef(false);
  const [availability, setAvailability] = useState<ProductPageReviewAvailability | null>(null);
  const [readError, setReadError] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [done, setDone] = useState(false), [uncertain, setUncertain] = useState(false), [closed, setClosed] = useState(false);
  const [fields, setFields] = useState<ReviewDraftFields>(EMPTY_FIELDS);
  const endpoint = `/api/products/${productId}/reviews`;
  const safeReturnTo = safeAccountReturnTo(returnTo);
  const login = `/account/login?returnTo=${encodeURIComponent(safeReturnTo)}`;

  const persist = useCallback((value: ProductReviewDraft) => {
    draft.current = value;
    return saveDraft(value);
  }, []);

  const openLogin = useCallback((value: ProductReviewDraft) => {
    if (!value.pending) return;
    const awaiting: ProductReviewDraft = { ...value, pending: { ...value.pending, phase: "awaiting-auth" } };
    if (!persist(awaiting)) { setError(STORAGE_ERROR); setBusy(false); return; }
    redirecting.current = true;
    setBusy(true); setUncertain(false); setError("");
    try { window.location.assign(login); }
    catch {
      redirecting.current = false; setBusy(false);
      setError("Giriş ekranı açılamadı. Yorumunuz korunuyor; yeniden deneyin.");
    }
  }, [login, persist]);

  const sendPending = useCallback(async (value: ProductReviewDraft) => {
    if (sending.current || redirecting.current || !value.pending) return;
    sending.current = true; setBusy(true); setError("");
    const pending = { ...value.pending, phase: "sending" as const };
    const sendingDraft: ProductReviewDraft = { ...value, savedAt: Date.now(), pending };
    // Persist the exact operation before the request, so a refresh can only offer
    // an explicit retry with the same idempotency key and payload.
    if (!persist(sendingDraft)) {
      sending.current = false; setBusy(false); setError(STORAGE_ERROR); return;
    }
    try {
      const response = await fetch(endpoint, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json", "idempotency-key": pending.operationId },
        body: JSON.stringify({ review: pending.review }),
      });
      const result = await response.json().catch(() => null);
      if (!live.current) return;
      if (response.ok && result?.status === "pending" && Object.keys(result).length === 1) {
        draft.current = null; removeDraft(productId); setDone(true); setUncertain(false); return;
      }
      if (response.status === 409 && result?.code === "already_submitted") {
        draft.current = null; removeDraft(productId); setAvailability({ enabled: true, state: "submitted" }); setUncertain(false); return;
      }
      if (response.status === 401) {
        setAvailability({ enabled: true, state: "guest" });
        openLogin(sendingDraft); return;
      }
      if (response.status === 403 && ["disabled", "feature_disabled", "feature_not_enabled"].includes(result?.code)) {
        draft.current = null; removeDraft(productId); setAvailability({ enabled: false }); setUncertain(false); return;
      }
      const knownFailure = [400, 403, 404, 429].includes(response.status);
      setUncertain(!knownFailure);
      persist({ ...sendingDraft, pending: knownFailure ? null : { ...pending, phase: "uncertain" } });
      if (response.status === 403 || response.status === 404) setClosed(true);
      setError(typeof result?.message === "string" ? result.message : knownFailure ? "Gönderim tamamlanamadı. Yorumunuzu kontrol edip yeniden deneyin." : UNCERTAIN_ERROR);
    } catch {
      if (live.current) {
        persist({ ...sendingDraft, pending: { ...pending, phase: "uncertain" } });
        setUncertain(true); setError(UNCERTAIN_ERROR);
      }
    } finally {
      sending.current = false;
      if (live.current && !redirecting.current) setBusy(false);
    }
  }, [endpoint, openLogin, persist, productId]);

  const load = useCallback(async () => {
    reading.current?.abort();
    const controller = new AbortController(); reading.current = controller;
    setLoading(true); setReadError(false);
    try {
      const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("review_read_failed");
      const value = parseProductPageReviewAvailability(await response.json());
      if (!live.current || controller.signal.aborted) return;
      if (!value.enabled || value.state === "submitted") {
        draft.current = null; removeDraft(productId); setUncertain(false);
      } else if (value.state === "guest" && restoredAuthIntent.current && draft.current?.pending?.phase === "awaiting-auth") {
        // Returning without verification cancels this send action. Keep the raw
        // fields, so an unrelated later login cannot publish a canceled intent.
        if (!persist({ ...draft.current, pending: null })) {
          removeDraft(productId); setError(STORAGE_ERROR);
        }
      }
      restoredAuthIntent.current = false;
      setAvailability(value);
    } catch { if (live.current && !controller.signal.aborted) setReadError(true); }
    finally { if (live.current && !controller.signal.aborted) setLoading(false); }
  }, [endpoint, persist, productId]);

  useEffect(() => {
    live.current = true;
    let saved: ProductReviewDraft | null = null;
    try { saved = readProductReviewDraft(window.sessionStorage, productId, safeReturnTo); } catch { /* Submit reports storage failures without losing the current fields. */ }
    draft.current = saved;
    restoredAuthIntent.current = saved?.pending?.phase === "awaiting-auth";
    setFields(saved?.fields ?? EMPTY_FIELDS);
    const needsRetry = Boolean(saved?.pending && saved.pending.phase !== "awaiting-auth");
    setUncertain(needsRetry); setError(needsRetry ? UNCERTAIN_ERROR : "");
    function returnFromLogin(event: PageTransitionEvent) {
      if (!event.persisted || !redirecting.current) return;
      // BFCache restores this tree with its old redirect lock. Recheck only a
      // login redirect return; an unknown in-flight POST keeps its retry guard.
      redirecting.current = false; sending.current = false; setBusy(false);
      let fresh: ProductReviewDraft | null = null;
      try { fresh = readProductReviewDraft(window.sessionStorage, productId, safeReturnTo); } catch { /* A stored intent must be readable before it may resume. */ }
      // The page may have remained in BFCache beyond the draft TTL. Keep its
      // visible fields in memory, but never re-arm an expired or unreadable send.
      draft.current = fresh ?? (draft.current ? { ...draft.current, pending: null } : null);
      if (fresh) setFields(fresh.fields);
      else removeDraft(productId);
      restoredAuthIntent.current = fresh?.pending?.phase === "awaiting-auth";
      const needsRetry = Boolean(fresh?.pending && fresh.pending.phase !== "awaiting-auth");
      setUncertain(needsRetry); setError(needsRetry ? UNCERTAIN_ERROR : "");
      void load();
    }
    window.addEventListener("pageshow", returnFromLogin);
    void load();
    return () => {
      live.current = false; reading.current?.abort();
      window.removeEventListener("pageshow", returnFromLogin);
    };
  }, [load, productId, safeReturnTo]);

  useEffect(() => {
    const saved = draft.current;
    // Only a confirmed authenticated return may resume a saved send action.
    if (availability?.enabled && availability.state === "available" && saved?.pending?.phase === "awaiting-auth") {
      section.current?.scrollIntoView({ block: "start" });
      heading.current?.focus({ preventScroll: true });
      void sendPending(saved);
    }
  }, [availability, sendPending]);

  function updateFields(next: ReviewDraftFields) {
    if (loading || busy || uncertain || closed) return;
    if (next.reviewerName === fields.reviewerName && next.title === fields.title && next.body === fields.body && next.rating === fields.rating) return;
    setFields(next); setError("");
    // Save only actual edits, with bounded field lengths; rendering and reading
    // availability never refresh a partial draft or its expiry.
    if (!persist({ version: 1, productId, returnTo: safeReturnTo, savedAt: Date.now(), fields: next, pending: null })) setError(STORAGE_ERROR);
  }

  function submit() {
    if (loading || sending.current || redirecting.current || closed || done || !availability?.enabled || availability.state === "submitted") return;
    let value = draft.current;
    if (!value?.pending) {
      try {
        const review = parseReviewSubmission({
          reviewerName: fields.reviewerName.trim(), rating: fields.rating,
          ...(fields.title.trim() ? { title: fields.title.trim() } : {}),
          body: fields.body.trim().replace(/\s+/gu, " "),
        });
        value = { version: 1, productId, returnTo: safeReturnTo, savedAt: Date.now(), fields, pending: { operationId: crypto.randomUUID(), review, phase: "awaiting-auth" } };
      } catch { setError("Puanınızı, adınızı ve yorumunuzu kontrol edin."); return; }
    }
    if (availability.state === "guest") openLogin(value);
    else void sendPending(value);
  }

  if ((loading && !availability) || availability?.enabled === false) return null;
  const locked = loading || busy || uncertain || closed;
  const canWrite = availability?.enabled && (availability.state === "available" || availability.state === "guest");
  const guest = availability?.enabled && availability.state === "guest";
  return <section ref={section} className={`${styles.section} store-container`} id="product-review-form" aria-labelledby={`${id}-heading`}>
    <div className={styles.card} aria-busy={loading || busy}>
      <header><h2 ref={heading} tabIndex={-1} id={`${id}-heading`}>Ürün hakkında yorum yapın</h2><p>Deneyiminiz, bu ürünü inceleyen müşterilere yardımcı olur.</p></header>
      {readError ? <div className={styles.feedback} role="alert"><p>Yorum alanı yüklenemedi.</p><button type="button" disabled={loading} onClick={() => void load()}>Tekrar dene</button></div> : null}
      {done || (availability?.enabled && availability.state === "submitted") ? <p className={styles.feedback} role="status">{done ? "Teşekkür ederiz. Yorumunuz mağazanın incelemesinden sonra yayımlanacak." : "Bu ürün için yorumunuzu daha önce aldık."}</p> : null}
      {!done && canWrite ? <form onSubmit={event => { event.preventDefault(); submit(); }}>
        <fieldset className={styles.rating} disabled={locked} aria-describedby={`${id}-rating-value`}>
          <legend>Puanınız</legend>
          <div>{[1, 2, 3, 4, 5].map(value => <label key={value} className={value <= fields.rating ? styles.selectedStar : undefined}>
            <input type="radio" name="rating" value={value} checked={fields.rating === value} required onChange={() => updateFields({ ...fields, rating: value })} />
            <span aria-hidden="true">{value <= fields.rating ? "★" : "☆"}</span><span className={styles.srOnly}>{value} yıldız</span>
          </label>)}</div>
          <p className={styles.ratingValue} id={`${id}-rating-value`} aria-live="polite">{fields.rating ? `${fields.rating} / 5 yıldız seçildi` : "1 ile 5 arasında bir puan seçin"}</p>
        </fieldset>
        <div className={styles.fields}>
          <label htmlFor={`${id}-name`}>Yayında görünen adınız<input id={`${id}-name`} name="reviewerName" required maxLength={120} autoComplete="name" value={fields.reviewerName} disabled={locked} onChange={event => updateFields({ ...fields, reviewerName: event.currentTarget.value.slice(0, 120) })} /></label>
          <label htmlFor={`${id}-title`}><span>Başlık <small>İsteğe bağlı</small></span><input id={`${id}-title`} name="title" maxLength={200} value={fields.title} disabled={locked} onChange={event => updateFields({ ...fields, title: event.currentTarget.value.slice(0, 200) })} /></label>
        </div>
        <label htmlFor={`${id}-body`}>Yorumunuz<textarea id={`${id}-body`} name="body" required maxLength={2000} rows={4} value={fields.body} disabled={locked} onChange={event => updateFields({ ...fields, body: event.currentTarget.value.slice(0, 2000) })} /><small>{fields.body.length} / 2000</small></label>
        <p className={styles.help}>Adınız ve yorumunuz yayımlanabilir. Telefon, adres veya ödeme bilgilerinizi yorumunuza yazmayın.</p>
        {error ? <p className={styles.feedback} role="alert">{error}</p> : null}
        <div className={styles.actions}><span>Yorumlar yayımlanmadan önce incelenir.</span><button className={styles.primary} type="submit" disabled={loading || busy || closed || !fields.reviewerName.trim() || !fields.body.trim() || fields.rating < 1}>{busy ? "Gönderiliyor…" : uncertain ? "Aynı yorumu yeniden gönder" : "Yorumumu gönder"}</button></div>
        {guest ? <p className={styles.verification}>Bir sonraki adımda WhatsApp ile doğrulayacaksınız. Yorumunuz korunur ve doğrulama sonrası otomatik gönderilir.</p> : null}
      </form> : null}
    </div>
  </section>;
}
