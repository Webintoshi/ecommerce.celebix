"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CatalogOnboardingOptions } from "@celebix/saas-contracts";

import { ProductQuickCreateDialog } from "@/components/catalog-onboarding/ProductQuickCreateDialog";
import { ProductAdvancedEditor } from "@/components/catalog-onboarding/ProductAdvancedEditor";
import { CatalogOnboardingApiError, catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";

export function ProductCreateForm({ initialMode = "quick" }: Readonly<{ initialMode?: "quick" | "advanced" }>) {
  const [options, setOptions] = useState<CatalogOnboardingOptions | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(initialMode);

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
      <header className="catalog-heading product-create-heading">
        <h1 id="create-title">Yeni ürün oluştur</h1>
        <p>Yalnız ürün adı ve fiyatıyla başlayın; ayrıntıları istediğiniz zaman tamamlayın.</p>
      </header>
      {error ? <div className="feedback feedback-error" role="alert"><div><strong>Seçenekler yüklenemedi</strong><p>{error}</p></div></div> : null}
      {mode === "advanced" && options ? <ProductAdvancedEditor options={options} onCancel={() => setMode("quick")} onCreated={(result) => location.assign(`/products/${result.product.id}`)} /> : <ProductQuickCreateDialog
          open
          mode="page"
          options={options}
          onClose={() => location.assign("/products")}
          onCreated={(result) => location.assign(`/products/${result.product.id}`)}
          onAdvanced={() => setMode("advanced")}
        />}
    </section>
  );
}
