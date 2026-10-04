"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import type { StoreEngagementCaptureRequest, StoreEngagementPublicCampaign, StoreEngagementPublicSettings } from "@celebix/saas-contracts";
import { createStoreEngagementClient, prepareEngagementContact, StoreEngagementClientError } from "../lib/engagement/client.ts";
import { campaignWasShown, cartContactWasCaptured, clearPendingCoupon, engagementRouteAllowed, getEngagementCart, markCampaignShown, markCartContactCaptured, readPendingCoupon, rememberPendingCoupon, subscribeSuccessfulCartAdd, type SuccessfulCartAdd } from "../lib/engagement/integration.ts";
import { storefrontCartClient } from "../lib/cart/client.ts";
import { createCheckoutQuoteQueue } from "../lib/checkout/quote-queue.ts";
import styles from "./StoreEngagement.module.css";

type Active = { campaign: StoreEngagementPublicCampaign; trigger: HTMLElement | null };
function otherModal(): boolean {
  return [...document.querySelectorAll<HTMLElement>('dialog[open], [role="dialog"][aria-modal="true"]')].some(element => !element.hasAttribute("data-store-engagement") && !element.hidden && window.getComputedStyle(element).display !== "none");
}
const deviceAllowed = (campaign: StoreEngagementPublicCampaign) => window.innerWidth < 768 ? campaign.config.devices.mobile : campaign.config.devices.desktop;
function captureError(error: unknown): string {
  if (error instanceof StoreEngagementClientError) {
    if (error.code === "contact_conflict") return "Bu sepetin iletişim bilgisi daha önce kaydedildi. Alışverişinize devam edebilirsiniz.";
    if (error.code === "cart_unavailable") return "Sepetiniz değişti. Ürünlerinizi kontrol edip alışverişinize devam edin.";
    if (error.code === "campaign_unavailable" || error.code === "promotion_unavailable" || error.code === "invalid_reference") return "Bu teklif şu anda kullanılamıyor. Alışverişinize devam edebilirsiniz.";
    if (error.code === "rate_limited") return "Kısa sürede çok fazla deneme yapıldı. Biraz bekleyip yeniden deneyebilirsiniz.";
  }
  return "Bağlantı kurulamadı. Bilgileriniz korunuyor; yeniden deneyebilirsiniz.";
}

export function StoreEngagement({ storefrontId, storefrontName, brandColor }: Readonly<{ storefrontId: string; storefrontName: string; brandColor: string }>) {
  const pathname = usePathname() ?? "/", headingId = useId(), bodyId = useId();
  const [settings, setSettings] = useState<StoreEngagementPublicSettings | null>(null);
  const [account, setAccount] = useState<"loading" | "anonymous" | "authenticated" | "unknown">("loading");
  const [addition, setAddition] = useState<SuccessfulCartAdd | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [viewport, setViewport] = useState(0);
  const [email, setEmail] = useState(""), [phone, setPhone] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [captured, setCaptured] = useState(false), [coupon, setCoupon] = useState<string | null>(null), [couponStatus, setCouponStatus] = useState("");
  const dialogRef = useRef<HTMLElement | null>(null), activeRef = useRef<Active | null>(null);
  const busy = useRef(false), command = useRef<StoreEngagementCaptureRequest | null>(null);
  const generation = useRef(0), opening = useRef(false), consideredCapture = useRef(false), alive = useRef(true);
  const captureTimer = useRef<number | null>(null), captureTimerRoute = useRef<string | null>(null), shownPopup = useRef(false);
  const client = useRef<ReturnType<typeof createStoreEngagementClient> | null>(null);
  if (!client.current) client.current = createStoreEngagementClient();
  const requestQuote = useRef(createCheckoutQuoteQueue((intent, codes) => storefrontCartClient.quotePromotionsWithDigest(intent, codes)));
  const applyingCoupons = useRef(new Map<string, Promise<string>>());

  const dismiss = useCallback(() => {
    generation.current++; opening.current = false;
    const trigger = activeRef.current?.trigger;
    activeRef.current = null; setActive(null); setError(""); setEmail(""); setPhone(""); setMarketingConsent(false); command.current = null;
    window.requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); });
  }, []);
  useEffect(() => {
    alive.current = true;
    const abort = new AbortController();
    void client.current!.settings(abort.signal).then(value => { if (!abort.signal.aborted) setSettings(value); }).catch(() => undefined);
    const resize = () => setViewport(window.innerWidth); resize(); window.addEventListener("resize", resize);
    return () => { alive.current = false; generation.current++; abort.abort(); if (captureTimer.current !== null) window.clearTimeout(captureTimer.current); window.removeEventListener("resize", resize); };
  }, [storefrontId]);
  useEffect(() => {
    const abort = new AbortController(); setAccount("loading");
    if (engagementRouteAllowed(pathname)) void client.current!.accountSession(abort.signal).then(value => { if (!abort.signal.aborted) setAccount(value); });
    else setAccount("unknown");
    return () => abort.abort();
  }, [storefrontId, pathname]);
  useEffect(() => subscribeSuccessfulCartAdd(event => { if (event.storefrontId === storefrontId && engagementRouteAllowed(window.location.pathname)) setAddition(event); }), [storefrontId]);
  useEffect(() => {
    if (captureTimer.current !== null && captureTimerRoute.current !== `${window.location.pathname}${window.location.search}`) { window.clearTimeout(captureTimer.current); captureTimer.current = null; }
    if (!engagementRouteAllowed(pathname) || (active && !deviceAllowed(active.campaign))) dismiss();
  }, [pathname, viewport, active, dismiss]);

  const applyCoupon = useCallback((code: string): Promise<string> => {
    rememberPendingCoupon(storefrontId, code);
    const controller = getEngagementCart(storefrontId);
    if (!controller?.getCart()?.itemCount) return Promise.resolve("Kodu alışverişinizde kullanabilirsiniz.");
    if (!engagementRouteAllowed(window.location.pathname)) return Promise.resolve("Kodu ödeme adımında kullanabilirsiniz.");
    const inFlight = applyingCoupons.current.get(code);
    if (inFlight) return inFlight;
    const result = requestQuote.current("cart", [code]).then(({ quote }) => {
      if (readPendingCoupon(storefrontId) === code) clearPendingCoupon(storefrontId);
      return quote.rejectedPromotions.some(item => item.normalizedCode === code) ? "Kod şu anda bu sepete uygulanamıyor. Koşullarını kontrol edin." : "Kod sepetinize uygulandı. Ödeme adımında tekrar kontrol edilir.";
    }).catch(() => "Kodunuz hazır. Bağlantı kurulamadı; ödeme adımında kodu kullanabilirsiniz.");
    applyingCoupons.current.set(code, result);
    void result.finally(() => { if (applyingCoupons.current.get(code) === result) applyingCoupons.current.delete(code); });
    return result;
  }, [storefrontId]);
  useEffect(() => {
    if (!addition) return;
    const code = readPendingCoupon(storefrontId);
    if (code) void applyCoupon(code);
  }, [addition, storefrontId, applyCoupon]);

  const open = useCallback(async (campaign: StoreEngagementPublicCampaign) => {
    if (opening.current || activeRef.current || !deviceAllowed(campaign) || !engagementRouteAllowed(window.location.pathname)) return;
    const token = ++generation.current, sourceRoute = `${window.location.pathname}${window.location.search}`;
    opening.current = true;
    const controller = getEngagementCart(storefrontId);
    const trigger = controller?.getTrigger?.() ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const valid = () => alive.current && token === generation.current && !activeRef.current && sourceRoute === `${window.location.pathname}${window.location.search}` && engagementRouteAllowed(window.location.pathname) && deviceAllowed(campaign);
    try {
      if (controller && !await controller.closeDrawerAndWait(false)) return;
      // Drawer state and native dialog cleanup finish before a second modal.
      for (let attempt = 0; attempt < 150; attempt++) {
        await new Promise(resolve => window.setTimeout(resolve, attempt ? 100 : 16));
        if (!valid()) return;
        if (otherModal()) continue;
        if (campaign.kind === "cart_capture" && !getEngagementCart(storefrontId)?.getCart()?.itemCount) return;
        const selected = { campaign, trigger }; activeRef.current = selected;
        shownPopup.current = true;
        command.current = null; busy.current = false; setPending(false); setEmail(""); setPhone(""); setMarketingConsent(false); setError(""); setCaptured(false); setCoupon(campaign.couponCode); setCouponStatus("");
        markCampaignShown(storefrontId, campaign.id); setActive(selected); return;
      }
    } finally { if (token === generation.current) opening.current = false; }
  }, [storefrontId]);
  useEffect(() => {
    const campaign = settings?.cartCapture;
    if (!addition || !campaign?.enabled || consideredCapture.current || account === "loading" || active || opening.current || !engagementRouteAllowed(pathname)) return;
    consideredCapture.current = true;
    if (account !== "anonymous" || cartContactWasCaptured(storefrontId) || !deviceAllowed(campaign) || campaignWasShown(storefrontId, campaign.id, campaign.config.repeatDays)) return;
    const sourceRoute = addition.route;
    captureTimerRoute.current = sourceRoute;
    captureTimer.current = window.setTimeout(() => {
      captureTimer.current = null;
      if (sourceRoute === `${window.location.pathname}${window.location.search}`) void open(campaign);
    }, campaign.config.delaySeconds * 1000);
  }, [settings, addition, account, active, pathname, viewport, storefrontId, open]);
  useEffect(() => {
    if (!settings || active || opening.current || shownPopup.current || !engagementRouteAllowed(pathname)) return;
    if (addition && settings.cartCapture?.enabled && (!consideredCapture.current || captureTimer.current !== null)) return;
    const campaign = settings.popups.find(value => value.enabled && deviceAllowed(value) && !campaignWasShown(storefrontId, value.id, value.config.repeatDays));
    if (!campaign) return;
    const timer = window.setTimeout(() => { void open(campaign); }, campaign.config.delaySeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [settings, active, addition, pathname, viewport, storefrontId, open]);

  useEffect(() => {
    if (!active) return;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>("input, button")?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); dismiss(); return; }
      if (event.key !== "Tab") return;
      const elements = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]') ?? [])];
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener("keydown", keydown); document.body.style.overflow = overflow; };
  }, [active, captured, dismiss]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy.current || !active || captured) return;
    const campaign = active.campaign, token = generation.current;
    if (!command.current) {
      try { command.current = prepareEngagementContact({ operationId: crypto.randomUUID(), campaignId: campaign.id, ...(email.trim() ? { email } : {}), ...(phone.trim() ? { phone } : {}), marketingConsent: Boolean(campaign.config.marketingOptInLabel && marketingConsent) }); }
      catch { setError(campaign.config.collectMode === "email" ? "Geçerli bir e-posta adresi girin." : campaign.config.collectMode === "phone" ? "Telefonunuzu ülke koduyla veya 05 ile başlayan biçimde girin." : "Geçerli bir e-posta adresi veya telefon girin."); return; }
    }
    busy.current = true; setPending(true); setError("");
    try {
      const result = await client.current!.captureContact(command.current);
      markCartContactCaptured(storefrontId);
      const status = result.couponCode ? await applyCoupon(result.couponCode) : "Sepetinize daha sonra devam edebilirsiniz.";
      if (alive.current && token === generation.current) { setCaptured(true); setCoupon(result.couponCode); setCouponStatus(status); }
    } catch (failure) { if (alive.current && token === generation.current) setError(captureError(failure)); }
    finally { busy.current = false; if (alive.current && token === generation.current) setPending(false); }
  };
  const copyCoupon = async () => {
    if (!coupon || busy.current) return;
    busy.current = true; setPending(true);
    let copied = false;
    try { await window.navigator.clipboard?.writeText(coupon); copied = Boolean(window.navigator.clipboard); } catch { /* The visible code can be copied manually. */ }
    const status = await applyCoupon(coupon);
    if (alive.current && activeRef.current) setCouponStatus(`${copied ? "Kod kopyalandı. " : ""}${status}`);
    busy.current = false; if (alive.current) setPending(false);
  };
  if (!active || !engagementRouteAllowed(pathname)) return null;
  const { config } = active.campaign, capture = active.campaign.kind === "cart_capture", locked = pending || Boolean(command.current);
  return <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) dismiss(); }}>
    <section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={headingId} aria-describedby={bodyId} data-store-engagement data-template={config.template} style={{ "--engagement-brand": brandColor } as CSSProperties}>
      <button className={styles.close} type="button" aria-label="Pencereyi kapat" data-engagement-dismiss onClick={dismiss}>×</button>
      {active.campaign.imageUrl && config.template === "image_left" ? <div className={styles.image}><img src={active.campaign.imageUrl} alt="" loading="lazy" /></div> : null}
      <div className={styles.content}>
        <span className={styles.store}>{storefrontName}</span>
        <h2 id={headingId}>{captured ? "Teşekkürler" : config.heading}</h2>
        <p id={bodyId} className={styles.body}>{captured ? "Bilgileriniz kaydedildi. Alışverişinize devam edebilirsiniz." : config.body}</p>
        {capture && !captured ? <form onSubmit={event => { void submit(event); }}>
          {config.collectMode !== "phone" ? <label className={styles.field}>E-posta<input type="email" autoComplete="email" maxLength={254} value={email} required={config.collectMode === "email"} disabled={locked} onInput={event => setEmail(event.currentTarget.value)} /></label> : null}
          {config.collectMode !== "email" ? <label className={styles.field}>Telefon<input type="tel" autoComplete="tel" inputMode="tel" maxLength={32} value={phone} required={config.collectMode === "phone"} disabled={locked} placeholder="05xx xxx xx xx" onInput={event => setPhone(event.currentTarget.value)} /></label> : null}
          {config.collectMode === "either" ? <p className={styles.hint}>E-posta veya telefon alanlarından birini doldurmanız yeterli.</p> : null}
          {config.marketingOptInLabel ? <label className={styles.consent}><input type="checkbox" checked={marketingConsent} disabled={locked} onChange={event => setMarketingConsent(event.currentTarget.checked)} /><span>{config.marketingOptInLabel}</span></label> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <button className={styles.primary} type="submit" disabled={pending}>{pending ? "Kaydediliyor…" : error && command.current ? "Yeniden dene" : config.buttonLabel}</button>
        </form> : <>
          {coupon ? <div className={styles.coupon}><span>İndirim kodunuz</span><strong>{coupon}</strong></div> : null}
          {couponStatus ? <p className={styles.hint} role="status">{couponStatus}</p> : null}
          <button className={styles.primary} type="button" disabled={pending} onClick={() => { if (coupon) void copyCoupon(); else dismiss(); }}>{pending ? "Kontrol ediliyor…" : coupon ? capture ? "Kodu kopyala" : config.buttonLabel : capture ? "Alışverişe devam et" : config.buttonLabel}</button>
        </>}
        <button className={styles.secondary} type="button" data-engagement-dismiss onClick={dismiss}>{captured ? "Alışverişe devam et" : "Şimdi değil"}</button>
      </div>
    </section>
  </div>;
}
