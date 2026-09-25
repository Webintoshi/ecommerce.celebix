"use client";

import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { SkuInput } from "@/components/catalog/SkuInput";
import { BarcodeInput } from "@/components/catalog/BarcodeInput";

export type VariantDraft = Readonly<{
  title: string;
  sku: string;
  barcode: string;
  price: string;
  compareAt: string;
  cost: string;
  stockQuantity: string;
  continueSellingWhenOutOfStock: boolean;
  shippingDesi: string;
  hsCode: string;
  attributes: Readonly<Record<string, string>>;
}>;

export function emptyVariant(title = "Standart", attributes: Readonly<Record<string, string>> = {}): VariantDraft {
  return Object.freeze({ title, sku: "", barcode: "", price: "", compareAt: "", cost: "", stockQuantity: "0", continueSellingWhenOutOfStock: false, shippingDesi: "", hsCode: "", attributes });
}

export function ProductVariantBuilder({ variants, onChange, allowMultiple, showShipping = false, allowManualAdd = true, simplified = false, skuPrefix }: Readonly<{
  variants: readonly VariantDraft[];
  onChange(value: readonly VariantDraft[]): void;
  allowMultiple: boolean;
  showShipping?: boolean;
  allowManualAdd?: boolean;
  simplified?: boolean;
  skuPrefix?: string;
}>) {
  const change = (index: number, patch: Partial<VariantDraft>) => onChange(Object.freeze(variants.map((variant, position) => position === index ? Object.freeze({ ...variant, ...patch }) : variant)));
  return <div className="onboarding-variant-builder" data-layout={allowMultiple ? "multiple" : "simple"}>
    {!simplified ? <div className="onboarding-variant-list-heading" aria-hidden="true"><span>Varyant</span><span>SKU</span><span>Satış fiyatı</span><span>Stok</span><span>Karşılaştırma</span><span>İşlem</span></div> : null}
    {variants.map((variant, index) => <article key={index}>
      <header>
        <span className="onboarding-variant-index">{index + 1}</span>
        <span><strong>{allowMultiple ? variant.title || `Varyant ${index + 1}` : "Standart varyant"}</strong><small>{allowMultiple ? "Ayrı fiyat ve stok" : "Basit ürünün satış seçeneği"}</small></span>
        {allowMultiple && (!simplified || allowManualAdd) && variants.length > 1 ? <button type="button" onClick={() => onChange(Object.freeze(variants.filter((_, position) => position !== index)))} aria-label={`${index + 1}. varyantı kaldır`}><Trash2 aria-hidden="true" /></button> : null}
      </header>
      <div className="onboarding-variant-primary-fields">
        {allowMultiple && !simplified ? <label className="onboarding-variant-title"><span>Varyant adı *</span><input required value={variant.title} maxLength={200} onChange={(event) => change(index, { title: event.target.value })} /></label> : null}
        <SkuInput skuPrefix={skuPrefix} value={variant.sku} onChange={(sku) => change(index, { sku })} />
        <label><span>Satış fiyatı *</span><input required inputMode="decimal" placeholder="0,00" value={variant.price} onChange={(event) => change(index, { price: event.target.value })} /></label>
        <label><span>Stok</span><input inputMode="numeric" value={variant.stockQuantity} onChange={(event) => change(index, { stockQuantity: event.target.value })} /></label>
        {!simplified ? <label><span>Karşılaştırma</span><input inputMode="decimal" placeholder="0,00" value={variant.compareAt} onChange={(event) => change(index, { compareAt: event.target.value })} /></label> : null}
      </div>
      {!simplified ? <label className="onboarding-check onboarding-continue-selling"><input type="checkbox" checked={variant.continueSellingWhenOutOfStock} onChange={(event) => change(index, { continueSellingWhenOutOfStock: event.target.checked })} /><span>Stok bitince satışa devam et</span></label> : null}
      <details className="onboarding-variant-advanced">
        <summary><span>Diğer bilgiler</span><ChevronDown aria-hidden="true" /></summary>
        <div className="onboarding-editor-grid">
          {allowMultiple && simplified ? <label className="onboarding-variant-title"><span>Varyant adı</span><input required value={variant.title} maxLength={200} onChange={(event) => change(index, { title: event.target.value })} /></label> : null}
          {simplified ? <label><span>Karşılaştırma fiyatı</span><input inputMode="decimal" placeholder="0,00" value={variant.compareAt} onChange={(event) => change(index, { compareAt: event.target.value })} /></label> : null}
          <BarcodeInput value={variant.barcode} reservationIdentity={variant} onChange={(barcode) => change(index, { barcode })} />
          <label><span>Maliyet</span><input inputMode="decimal" value={variant.cost} onChange={(event) => change(index, { cost: event.target.value })} /></label>
          {showShipping ? <><label><span>Kargo desi</span><input inputMode="decimal" value={variant.shippingDesi} onChange={(event) => change(index, { shippingDesi: event.target.value })} /></label><label><span>GTİP / HS kodu</span><input maxLength={32} value={variant.hsCode} onChange={(event) => change(index, { hsCode: event.target.value })} /></label></> : null}
          {simplified ? <label className="onboarding-check onboarding-continue-selling"><input type="checkbox" checked={variant.continueSellingWhenOutOfStock} onChange={(event) => change(index, { continueSellingWhenOutOfStock: event.target.checked })} /><span>Stok bitince satışa devam et</span></label> : null}
        </div>
      </details>
    </article>)}
    {allowMultiple && allowManualAdd && variants.length < 100 ? <button className="onboarding-add-variant" type="button" onClick={() => onChange(Object.freeze([...variants, emptyVariant(`Varyant ${variants.length + 1}`)]))}><Plus aria-hidden="true" />Varyant ekle</button> : null}
  </div>;
}
