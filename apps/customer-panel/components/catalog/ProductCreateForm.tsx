"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, Box, Layers } from "lucide-react";
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
import { CatalogWorkspaceLoading } from "./CatalogWorkspaceLoading";
import styles from "@/components/catalog-onboarding/product-create-entry.module.css";

const ProductAdvancedEditor = dynamic(() => import("@/components/catalog-onboarding/ProductAdvancedEditor").then((module) => module.ProductAdvancedEditor), {
  loading: () => <CatalogWorkspaceLoading layout="product" label="Form yükleniyor…" />,
});

type ProductKind = "simple" | "variant";
function createUrl(mode: "choose" | "quick" | "advanced", kind: ProductKind | null) {
  return mode === "choose" ? "/products/new" : `/products/new?mode=${mode}${mode === "advanced" && kind ? `&kind=${kind}` : ""}`;
}

export function ProductCreateForm({ initialMode = "choose", initialProductKind, aiAvailable = true }: Readonly<{ initialMode?: "choose" | "quick" | "advanced"; initialProductKind?: ProductKind; aiAvailable?: boolean }>) {
  const [options, setOptions] = useState<CatalogOnboardingOptions | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(initialMode);
  const [advancedKind, setAdvancedKind] = useState<ProductKind | null>(initialProductKind ?? null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(busy);
  const modeRef = useRef(mode);
  const kindRef = useRef(advancedKind);
  busyRef.current = busy;
  modeRef.current = mode;
  kindRef.current = advancedKind;
  const [loadRevision, setLoadRevision] = useState(0);
  const quickChoiceRef = useRef<HTMLButtonElement>(null);
  const advancedChoiceRef = useRef<HTMLButtonElement>(null);
  const singleChoiceRef = useRef<HTMLButtonElement>(null);
  const variantChoiceRef = useRef<HTMLButtonElement>(null);
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
    if (mode === "advanced" && advancedKind === null) (singleChoiceRef.current?.disabled ? variantChoiceRef : singleChoiceRef).current?.focus();
  }, [mode, advancedKind]);

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
    window.history.pushState({ productCreateMode: next, productKind: advancedKind }, "", createUrl(next, advancedKind));
  }

  function selectProductKind(next: ProductKind | null) {
    if (busy || (next === "simple" && draftSession.current.kind === "variant") || (next && draftSession.current.creationRecovery && next !== draftSession.current.kind)) return;
    setAdvancedKind(next);
    window.history.pushState({ productCreateMode: "advanced", productKind: next }, "", createUrl("advanced", next));
  }

  useEffect(() => {
    const restore = () => {
      if (busyRef.current) {
        const activeMode = modeRef.current;
        window.history.replaceState({ productCreateMode: activeMode, productKind: kindRef.current }, "", createUrl(activeMode, kindRef.current));
        return;
      }
      if (createdQuickProductIdRef.current) { finish(`/products/${createdQuickProductIdRef.current}`); return; }
      const query = new URL(window.location.href).searchParams;
      const selected = query.get("mode"), kind = query.get("kind");
      setAdvancedKind(sessionRef.current.current.creationRecovery && (kind === "simple" || kind === "variant") ? sessionRef.current.current.kind : kind === "variant" ? "variant" : kind === "simple" && sessionRef.current.current.kind !== "variant" ? "simple" : null);
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
        {mode === "choose" ? <Link className={styles.backLink} href="/products"><ArrowLeft aria-hidden="true" />Ürünlere dön</Link> : <button type="button" className={styles.backLink} disabled={busy} onClick={() => mode === "advanced" && advancedKind !== null ? selectProductKind(null) : selectMode("choose")}><ArrowLeft aria-hidden="true" />{mode === "advanced" && advancedKind !== null ? "Ürün yapısına dön" : "Yöntemlere dön"}</button>}
        {mode !== "choose" && productDraftIsDirty(draftSession) ? <span className={styles.draftState}>Kaydedilmedi</span> : null}
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
      </div> : mode === "advanced" && advancedKind === null ? <section className={styles.kindSection} aria-labelledby="product-kind-title">
        <h2 id="product-kind-title">Ürün yapısı</h2>
        <div className={styles.kindChoices} role="group" aria-label="Ürün yapısı">
          <button ref={singleChoiceRef} type="button" className={styles.kindChoice} disabled={draftSession.current.kind === "variant"} onClick={() => selectProductKind("simple")} aria-label="Tek ürün"><Box aria-hidden="true" /><span><strong>Tek ürün</strong><small>Tek fiyat ve stokla satışa sunun.</small></span><ArrowRight aria-hidden="true" /></button>
          <button ref={variantChoiceRef} type="button" className={styles.kindChoice} disabled={Boolean(draftSession.current.creationRecovery) && draftSession.current.kind !== "variant"} onClick={() => selectProductKind("variant")} aria-label="Varyantlı ürün"><Layers aria-hidden="true" /><span><strong>Varyantlı ürün</strong><small>Renk, beden veya farklı seçenekler ekleyin.</small></span><ArrowRight aria-hidden="true" /></button>
        </div>
        {draftSession.current.creationRecovery ? <p className={styles.kindHint}>Ürün kaydınız korunuyor. Aynı ürünle kalan yüklemeye devam edin.</p> : draftSession.current.kind === "variant" ? <p className={styles.kindHint}>Hazırladığınız varyantlar korunuyor. Varyantlı ürünle devam edin.</p> : null}
      </section> : mode === "advanced" && options && advancedKind ? <ProductAdvancedEditor initialKind={advancedKind} aiAvailable={aiAvailable} options={options} draftSession={draftSession} onDraftSessionChange={setDraftSession} onBusyChange={setBusy} onCancel={() => selectMode("choose")} onCreated={(result) => finish(`/products/${result.product.id}`)} /> : mode === "quick" ? <ProductQuickCreateDialog
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
        /> : !error ? <CatalogWorkspaceLoading layout="product" label="Ürün seçenekleri yükleniyor…" /> : null}
    </section>
  );
}
