"use client";

import Link from "next/link";
import { ArrowRight, Boxes, PackagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CatalogOnboardingOptions } from "@celebix/saas-contracts";

import { ProductQuickCreateDialog } from "@/components/catalog-onboarding/ProductQuickCreateDialog";
import { ProductAdvancedEditor } from "@/components/catalog-onboarding/ProductAdvancedEditor";
import { CatalogOnboardingApiError, catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";
import {
  commitProductDraft,
  createEmptyProductDraftSession,
  productDraftIsDirty,
  type ProductDraftSession,
} from "@/lib/catalog-ui/product-draft-session";
import { createDirtyNavigationGuard } from "@/lib/catalog-ui/dirty-navigation";
import styles from "@/components/catalog-onboarding/product-onboarding.module.css";

export function ProductCreateForm({ initialMode = "choose" }: Readonly<{ initialMode?: "choose" | "quick" | "advanced" }>) {
  const [options, setOptions] = useState<CatalogOnboardingOptions | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(initialMode);
  const [draftSession, setDraftSession] = useState<ProductDraftSession>(() => createEmptyProductDraftSession());
  const sessionRef = useRef(draftSession);
  sessionRef.current = draftSession;

  useEffect(() => {
    const controller = new AbortController();
    catalogOnboardingClient.getOptions(controller.signal).then(setOptions).catch((failure) => {
      if (!controller.signal.aborted) setError(failure instanceof CatalogOnboardingApiError ? failure.message : "Ürün seçenekleri yüklenemedi.");
    });
    return () => controller.abort();
  }, []);

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
    setMode(next);
    const url = next === "choose" ? "/products/new" : `/products/new?mode=${next}`;
    window.history.pushState({ productCreateMode: next }, "", url);
  }

  useEffect(() => {
    const restore = () => {
      const selected = new URL(window.location.href).searchParams.get("mode");
      setMode(selected === "advanced" ? "advanced" : selected === "quick" ? "quick" : "choose");
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  return (
    <section data-presentation="hemenaku-product-create" className={`catalog-page ${styles.createPage}`} aria-labelledby="create-title">
      <Link className={`back-link ${styles.createBackLink}`} href="/products">← Ürünlere dön</Link>
      <header className={`catalog-heading product-create-heading ${styles.createHeading}`}>
        <h1 className={styles.srOnly} id="create-title">Yeni ürün oluştur</h1>
        <p>{mode === "choose" ? "Ürününüz için en uygun başlangıcı seçin." : mode === "quick" ? "Temel bilgileri girip ürünü hazırlayın." : "Ürün, varyant ve görselleri tek sayfada tamamlayın."}</p>
      </header>
      {error ? <div className="feedback feedback-error" role="alert"><div><strong>Seçenekler yüklenemedi</strong><p>{error}</p></div></div> : null}
      {mode === "choose" ? <div className={styles.createChoices} role="group" aria-label="Ürün yükleme yöntemi">
        <button type="button" onClick={() => selectMode("quick")} className={styles.createChoice}>
          <span className={styles.createChoiceIcon}><PackagePlus aria-hidden="true" /></span>
          <span><strong>Hızlı Ürün Yükle</strong><small>Tek fiyat ve stokla basit ürün oluşturun.</small></span>
          <ArrowRight aria-hidden="true" />
        </button>
        <button type="button" onClick={() => selectMode("advanced")} className={styles.createChoice}>
          <span className={styles.createChoiceIcon}><Boxes aria-hidden="true" /></span>
          <span><strong>Detaylı Ürün Yükle</strong><small>Varyant, görsel ve diğer ayrıntıları ekleyin.</small></span>
          <ArrowRight aria-hidden="true" />
        </button>
      </div> : mode === "advanced" && options ? <ProductAdvancedEditor options={options} draftSession={draftSession} onDraftSessionChange={setDraftSession} onCancel={() => selectMode("choose")} onCreated={(result) => finish(`/products/${result.product.id}`)} /> : mode === "quick" ? <ProductQuickCreateDialog
          open
          mode="page"
          options={options}
          draftSession={draftSession}
          onDraftSessionChange={setDraftSession}
          onClose={() => selectMode("choose")}
          onCreated={(result) => finish(`/products/${result.product.id}`)}
          onAdvanced={() => selectMode("advanced")}
        /> : null}
    </section>
  );
}
