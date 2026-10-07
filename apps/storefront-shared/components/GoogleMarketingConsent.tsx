"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { PublicGoogleMarketingProjection } from "../../../packages/saas-contracts/src/google-marketing/index.ts";
import { createGoogleMarketingClient, type GoogleConsent, type GoogleMarketingClient } from "../lib/google-marketing.ts";
import { GOOGLE_MARKETING_PAYMENT_CAPTURED_EVENT } from "../lib/google-marketing-events.ts";
import { STOREFRONT_COMMERCE_EVENT, type PublicCommerceEvent } from "../lib/analytics/events.ts";

export function GoogleMarketingConsent(props: Readonly<{ storeId: string; hostname: string; nonce: string; projection: PublicGoogleMarketingProjection }>) {
  const pathname = usePathname(), manager = useRef<GoogleMarketingClient | null>(null);
  const [consent, setConsent] = useState<GoogleConsent>("undecided"), [preferences, setPreferences] = useState(false);
  const acceptButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    manager.current ??= createGoogleMarketingClient({ ...props, browser: window as never });
    const runtime = manager.current; setConsent(runtime.consent());
    const controller = new AbortController(); let purchaseRequested = false, ready = false;
    const readPurchase = () => {
      if (pathname !== "/checkout/payment/result" || purchaseRequested || runtime.consent() !== "granted") return;
      purchaseRequested = true;
      void fetch("/api/marketing/google/purchase", { credentials: "same-origin", cache: "no-store", signal: controller.signal, headers: { accept: "application/json" } })
        .then(async (response) => response.ok ? response.json() : null)
        .then((result: unknown) => { if (!controller.signal.aborted && result && typeof result === "object" && Object.keys(result).join(",") === "purchase") runtime.purchase((result as { purchase: unknown }).purchase); })
        .catch(() => undefined);
    };
    const release = runtime.onReady(() => { ready = true; readPurchase(); });
    const captured = () => { purchaseRequested = false; if (ready) readPurchase(); };
    window.addEventListener(GOOGLE_MARKETING_PAYMENT_CAPTURED_EVENT, captured);
    const commerce = (event: Event) => { if (event instanceof window.CustomEvent) runtime.commerce(event.detail as PublicCommerceEvent); };
    window.addEventListener(STOREFRONT_COMMERCE_EVENT, commerce);
    const storage = (event: StorageEvent) => {
      if (event.key === `celebix:google-consent:v1:${props.storeId}:${props.hostname}`) window.location.reload();
    };
    window.addEventListener("storage", storage);
    return () => { controller.abort(); release(); window.removeEventListener(GOOGLE_MARKETING_PAYMENT_CAPTURED_EVENT, captured); window.removeEventListener(STOREFRONT_COMMERCE_EVENT, commerce); window.removeEventListener("storage", storage); };
  }, [pathname, props.storeId, props.hostname, props.nonce, props.projection]);
  function choose(value: "granted" | "denied") {
    const previouslyGranted = manager.current?.consent() === "granted";
    manager.current?.setConsent(value); setConsent(value); setPreferences(false);
    // A fresh document unloads every handler installed by the previously granted container.
    if (value === "denied" && previouslyGranted) window.location.reload();
  }
  const open = consent === "undecided" || preferences;
  return <div className="google-consent-shell">
    {open ? <section className="google-consent-banner" role="region" aria-label="Çerez tercihleri">
      <div><h2>Çerez tercihleri</h2><p>Google analiz ve reklam ölçümü için çerez kullanımına izin veriyor musunuz? Tercihinizi istediğiniz zaman değiştirebilirsiniz. <a href="/policies/cookies">Çerez politikası</a></p></div>
      <div className="google-consent-actions">
        <button type="button" data-google-consent="denied" onClick={() => choose("denied")}>{consent === "granted" ? "İzni geri çek" : "Reddet"}</button>
        <button ref={acceptButton} type="button" data-google-consent="granted" onClick={() => choose("granted")}>Kabul et</button>
      </div>
    </section> : null}
    {!open ? <button type="button" className="google-consent-preferences" aria-expanded="false" onClick={() => { setPreferences(true); requestAnimationFrame(() => acceptButton.current?.focus()); }}>Çerez tercihleri</button> : null}
  </div>;
}
