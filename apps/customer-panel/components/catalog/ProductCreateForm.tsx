"use client";

import Link from "next/link";
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

export function ProductCreateForm({ initialMode = "quick" }: Readonly<{ initialMode?: "quick" | "advanced" }>) {
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

  function leave(path = "/products") {
    const guard = createDirtyNavigationGuard({
      isDirty: () => productDraftIsDirty(sessionRef.current),
      confirm: () => window.confirm("Kaydedilmemiş ürün değişiklikleriniz var. Sayfadan ayrılmak istiyor musunuz?"),
    });
    if (guard.canLeave()) location.assign(path);
  }

  function finish(path: string) {
    setDraftSession((current) => commitProductDraft(current));
    sessionRef.current = commitProductDraft(sessionRef.current);
    location.assign(path);
  }

  return (
    <section data-presentation="hemenaku-product-create" className={`catalog-page ${styles.createPage}`} aria-labelledby="create-title">
      <Link className={`back-link ${styles.createBackLink}`} href="/products">← Ürünlere dön</Link>
      <header className={`catalog-heading product-create-heading ${styles.createHeading}`}>
        <h1 id="create-title">Yeni ürün oluştur</h1>
        <p>Temel bilgileri girin; diğer ayrıntıları ihtiyacınız olduğunda tamamlayın.</p>
      </header>
      {error ? <div className="feedback feedback-error" role="alert"><div><strong>Seçenekler yüklenemedi</strong><p>{error}</p></div></div> : null}
      {mode === "advanced" && options ? <ProductAdvancedEditor options={options} draftSession={draftSession} onDraftSessionChange={setDraftSession} onCancel={() => leave()} onCreated={(result) => finish(`/products/${result.product.id}`)} /> : <ProductQuickCreateDialog
          open
          mode="page"
          options={options}
          draftSession={draftSession}
          onDraftSessionChange={setDraftSession}
          onClose={() => leave()}
          onCreated={(result) => finish(`/products/${result.product.id}`)}
          onAdvanced={() => setMode("advanced")}
        />}
    </section>
  );
}
