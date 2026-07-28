"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CatalogOnboardingOptions } from "@celebix/saas-contracts";

import { ProductQuickCreateDialog } from "@/components/catalog-onboarding/ProductQuickCreateDialog";
import { CatalogOnboardingApiError, catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";

export function ProductCreateForm() {
  const [options, setOptions] = useState<CatalogOnboardingOptions | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    catalogOnboardingClient.getOptions(controller.signal).then(setOptions).catch((failure) => {
      if (!controller.signal.aborted) setError(failure instanceof CatalogOnboardingApiError ? failure.message : "Ürün seçenekleri yüklenemedi.");
    });
    return () => controller.abort();
  }, []);

  return (
    <section data-presentation="hemenaku-product-create" className="catalog-page narrow-catalog-page" aria-labelledby="create-title">
      <Link className="back-link" href="/products">← Ürünlere dön</Link>
      <div className="catalog-heading hemenaku-form-hero">
        <span className="eyebrow">YENİ KAYIT</span>
        <h1 id="create-title">Yeni ürün oluştur</h1>
        <p>Yalnız ürün adı ve fiyatıyla başlayın; ayrıntıları istediğiniz zaman tamamlayın.</p>
      </div>
      {error ? <div className="feedback feedback-error" role="alert"><div><strong>Seçenekler yüklenemedi</strong><p>{error}</p></div></div> : null}
      <ProductQuickCreateDialog
        open
        mode="page"
        options={options}
        onClose={() => location.assign("/products")}
        onCreated={(result) => location.assign(`/products/${result.product.id}`)}
        onAdvanced={() => location.assign("/products/new?mode=advanced")}
      />
    </section>
  );
}
