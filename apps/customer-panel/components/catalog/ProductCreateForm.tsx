"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CatalogOnboardingOptions } from "@celebix/saas-contracts";

import { ProductQuickCreateDialog } from "@/components/catalog-onboarding/ProductQuickCreateDialog";
import { PanelTopbarBridge } from "@/components/panel/PanelTopbarChrome";
import { CatalogOnboardingApiError, catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";
import {
  commitProductDraft,
  createEmptyProductDraftSession,
  productDraftIsDirty,
  type ProductDraftSession,
} from "@/lib/catalog-ui/product-draft-session";
import { createDirtyNavigationGuard } from "@/lib/catalog-ui/dirty-navigation";
import styles from "@/components/catalog-onboarding/product-create-entry.module.css";

const ProductAdvancedEditor = dynamic(() => import("@/components/catalog-onboarding/ProductAdvancedEditor").then((module) => module.ProductAdvancedEditor), {
  loading: () => <p role="status">Form yükleniyor…</p>,
});

export function ProductCreateForm({ initialMode = "choose" }: Readonly<{ initialMode?: "choose" | "quick" | "advanced" }>) {
  const [options, setOptions] = useState<CatalogOnboardingOptions | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(busy);
  const modeRef = useRef(mode);
  busyRef.current = busy;
  modeRef.current = mode;
  const [loadRevision, setLoadRevision] = useState(0);
  const quickChoiceRef = useRef<HTMLButtonElement>(null);
  const advancedChoiceRef = useRef<HTMLButtonElement>(null);
  const lastChoiceRef = useRef<"quick" | "advanced" | null>(initialMode === "choose" ? null : initialMode);
  const [draftSession, setDraftSession] = useState<ProductDraftSession>(() => createEmptyProductDraftSession());
  const sessionRef = useRef(draftSession);
  const mediaUrlsRef = useRef(new Set<string>());
  const createdQuickProductIdRef = useRef<string | undefined>(undefined);
  sessionRef.current = draftSession;

  useEffect(() => {
    const nextUrls = new Set(draftSession.current.media.map(({ preview }) => preview));
    for (const previous of mediaUrlsRef.current) if (!nextUrls.has(previous)) URL.revokeObjectURL(previous);
    mediaUrlsRef.current = nextUrls;
  }, [draftSession.current.media]);
  useEffect(() => () => { for (const preview of mediaUrlsRef.current) URL.revokeObjectURL(preview); }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    catalogOnboardingClient.getOptions(controller.signal).then(setOptions).catch((failure) => {
      if (!controller.signal.aborted) setError(failure instanceof CatalogOnboardingApiError ? failure.message : "Ürün seçenekleri yüklenemedi.");
    });
    return () => controller.abort();
  }, [loadRevision]);

  useEffect(() => {
    if (mode !== "choose" || lastChoiceRef.current === null) return;
    (lastChoiceRef.current === "quick" ? quickChoiceRef : advancedChoiceRef).current?.focus();
  }, [mode]);

  useEffect(() => {
    const guard = createDirtyNavigationGuard({
      isDirty: () => productDraftIsDirty(sessionRef.current),
      confirm: () => window.confirm("Kaydedilmemiş ürün değişiklikleriniz var. Sayfadan ayrılmak istiyor musunuz?"),
    });
    const cleanupBeforeUnload = guard.bindBeforeUnload(window);
    const cleanupApplicationNavigation = guard.bindApplicationNavigation(document, () => window.location.href);
    return () => { cleanupBeforeUnload(); cleanupApplicationNavigation(); };
  }, []);

  function finish(path: string) {
    setDraftSession((current) => commitProductDraft(current));
    sessionRef.current = commitProductDraft(sessionRef.current);
    location.assign(path);
  }

  function selectMode(next: "choose" | "quick" | "advanced") {
    if (busy) return;
    if (createdQuickProductIdRef.current) { finish(`/products/${createdQuickProductIdRef.current}`); return; }
    if (next !== "choose") lastChoiceRef.current = next;
    setMode(next);
    const url = next === "choose" ? "/products/new" : `/products/new?mode=${next}`;
    window.history.pushState({ productCreateMode: next }, "", url);
  }

  useEffect(() => {
    const restore = () => {
      if (busyRef.current) {
        const activeMode = modeRef.current;
        window.history.replaceState({ productCreateMode: activeMode }, "", `/products/new?mode=${activeMode}`);
        return;
      }
      if (createdQuickProductIdRef.current) { finish(`/products/${createdQuickProductIdRef.current}`); return; }
      const selected = new URL(window.location.href).searchParams.get("mode");
      setMode(selected === "advanced" ? "advanced" : selected === "quick" ? "quick" : "choose");
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  return (
    <section data-presentation="hemenaku-product-create" className={`catalog-page ${styles.createPage}`} aria-labelledby="create-title">
      <PanelTopbarBridge title="Yeni ürün oluştur" hideHeading />
      <h1 className={styles.srOnly} id="create-title">Yeni ürün oluştur</h1>
      <div className={styles.navigation}>
        {mode === "choose" ? <Link className={styles.backLink} href="/products"><ArrowLeft aria-hidden="true" />Ürünlere dön</Link> : <button type="button" className={styles.backLink} disabled={busy} onClick={() => selectMode("choose")}><ArrowLeft aria-hidden="true" />Yöntemlere dön</button>}
        {mode !== "choose" ? <span className={styles.draftState}>Taslak</span> : null}
      </div>
      {error ? <div className="feedback feedback-error" role="alert"><div><strong>Seçenekler yüklenemedi</strong><p>{error}</p><button type="button" onClick={() => setLoadRevision((revision) => revision + 1)}>Tekrar dene</button></div></div> : null}
      {mode === "choose" ? <div className={styles.createChoices} role="group" aria-label="Ürün yükleme yöntemi">
        <button ref={quickChoiceRef} type="button" onClick={() => selectMode("quick")} className={styles.createChoice} aria-label="Hızlı ürün yükle">
          <img src="/illustrations/product-create/quick.webp" width={260} height={260} alt="" decoding="async" />
          <span><strong>Hızlı ürün</strong><small>Tek fiyat · Tek stok</small></span>
          <span className={styles.start}>{lastChoiceRef.current === "quick" && productDraftIsDirty(draftSession) ? "Devam et" : "Başla"}<ArrowRight aria-hidden="true" /></span>
        </button>
        <button ref={advancedChoiceRef} type="button" onClick={() => selectMode("advanced")} className={styles.createChoice} aria-label="Detaylı ürün yükle">
          <img src="/illustrations/product-create/advanced.webp" width={260} height={260} alt="" decoding="async" />
          <span><strong>Detaylı ürün</strong><small>Varyantlar · Gelişmiş ayarlar</small></span>
          <span className={styles.start}>{lastChoiceRef.current === "advanced" && productDraftIsDirty(draftSession) ? "Devam et" : "Başla"}<ArrowRight aria-hidden="true" /></span>
        </button>
      </div> : mode === "advanced" && options ? <ProductAdvancedEditor options={options} draftSession={draftSession} onDraftSessionChange={setDraftSession} onBusyChange={setBusy} onCancel={() => selectMode("choose")} onCreated={(result) => finish(`/products/${result.product.id}`)} /> : mode === "quick" ? <ProductQuickCreateDialog
          open
          mode="page"
          options={options}
          draftSession={draftSession}
          onDraftSessionChange={setDraftSession}
          onBusyChange={setBusy}
          onCreatedProductChange={(productId) => { createdQuickProductIdRef.current = productId; }}
          onClose={() => selectMode("choose")}
          onCreated={(result) => finish(`/products/${result.product.id}`)}
          onAdvanced={() => selectMode("advanced")}
        /> : !error ? <p className={styles.loading} role="status">Ürün seçenekleri yükleniyor…</p> : null}
    </section>
  );
}
