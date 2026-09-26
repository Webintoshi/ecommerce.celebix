"use client";

import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { SkuInput } from "@/components/catalog/SkuInput";
import { BarcodeInput } from "@/components/catalog/BarcodeInput";
import { variantAttributeKey } from "@/lib/catalog-onboarding-ui/attribute-variants";
import { parseTurkishMoneyToCents } from "@/lib/catalog-onboarding-ui/forms";
import createStyles from "./create-advanced.module.css";

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

export function ProductVariantBuilder({ variants, onChange, allowMultiple, showShipping = false, allowManualAdd = true, simplified = false, skuPrefix, presentation = "default", onBarcodeBusyChange, disableStructureChanges = false, showValidation = false }: Readonly<{
  variants: readonly VariantDraft[];
  onChange(value: readonly VariantDraft[]): void;
  allowMultiple: boolean;
  showShipping?: boolean;
  allowManualAdd?: boolean;
  simplified?: boolean;
  skuPrefix?: string;
  presentation?: "default" | "create";
  onBarcodeBusyChange?(busy: boolean): void;
  disableStructureChanges?: boolean;
  showValidation?: boolean;
}>) {
  const reservationOwnersRef = useRef(new Map<string, object>());
  const createRowKeys = useMemo(() => presentation === "create" ? variants.map((variant, index) => allowMultiple
    ? Object.keys(variant.attributes).length ? `variant:${variantAttributeKey(variant.attributes)}` : `variant:${index}`
    : "standard") : [], [allowMultiple, presentation, variants]);
  useEffect(() => {
    const activeKeys = new Set(createRowKeys);
    for (const key of reservationOwnersRef.current.keys()) if (!activeKeys.has(key)) reservationOwnersRef.current.delete(key);
  }, [createRowKeys]);
  const change = (index: number, patch: Partial<VariantDraft>) => onChange(Object.freeze(variants.map((variant, position) => position === index ? Object.freeze({ ...variant, ...patch }) : variant)));
  if (presentation === "create") return <div className={allowMultiple ? createStyles.variantList : createStyles.standardVariant}>
    {allowMultiple ? <div className={createStyles.variantHeading} aria-hidden="true"><span>Varyant</span><span>Fiyat</span><span>Stok</span><span>SKU / barkod</span></div> : null}
    {variants.map((variant, index) => {
      const rowKey = createRowKeys[index]!;
      let reservationOwner = reservationOwnersRef.current.get(rowKey);
      if (reservationOwner === undefined) {
        reservationOwner = Object.freeze({});
        reservationOwnersRef.current.set(rowKey, reservationOwner);
      }
      const invalidPrice = parseTurkishMoneyToCents(variant.price) === null;
      const invalidStock = variant.stockQuantity !== "" && (!/^(?:0|[1-9]\d*)$/.test(variant.stockQuantity) || !Number.isSafeInteger(Number(variant.stockQuantity)));
      const invalidMoney = (value: string) => value !== "" && parseTurkishMoneyToCents(value) === null;
      const invalidDetails = !variant.title.trim() || invalidMoney(variant.compareAt) || invalidMoney(variant.cost) || (showShipping && invalidMoney(variant.shippingDesi));
      return <article className={allowMultiple ? createStyles.variantRow : createStyles.standardRow} key={rowKey}>
      {allowMultiple ? <strong className={createStyles.variantName}>{variant.title || `Varyant ${index + 1}`}</strong> : null}
      <div className={createStyles.priceStock}>
        <label className={createStyles.field}><span>Satış fiyatı <span aria-hidden="true">*</span></span><span className={createStyles.moneyField}><span aria-hidden="true">₺</span><input aria-label={allowMultiple ? `${variant.title} satış fiyatı` : "Satış fiyatı"} aria-invalid={showValidation && invalidPrice} required inputMode="decimal" placeholder="0,00" value={variant.price} onChange={(event) => change(index, { price: event.target.value })} /></span>{showValidation && invalidPrice ? <small className={createStyles.fieldError}>Geçerli bir fiyat girin.</small> : null}</label>
        <label className={createStyles.field}><span>Stok</span><input aria-label={allowMultiple ? `${variant.title} stok` : "Stok"} aria-invalid={showValidation && invalidStock} inputMode="numeric" value={variant.stockQuantity} onChange={(event) => change(index, { stockQuantity: event.target.value })} />{showValidation && invalidStock ? <small className={createStyles.fieldError}>Geçerli bir stok girin.</small> : null}</label>
      </div>
      <div className={createStyles.variantIdentity}>
        <SkuInput skuPrefix={skuPrefix} value={variant.sku} labelClassName={createStyles.field} onChange={(sku) => change(index, { sku })} />
        <BarcodeInput value={variant.barcode} reservationIdentity={reservationOwner} inputLabel={allowMultiple ? `${variant.title} barkod` : "Ürün barkodu"} actionLabel="Oluştur" labelClassName={createStyles.barcodeField} onBusyChange={onBarcodeBusyChange} onChange={(barcode) => change(index, { barcode })} />
      </div>
      <details className={createStyles.variantDetails} open={showValidation && invalidDetails}>
        <summary><span>{allowMultiple ? "Varyant detayları" : "Diğer satış bilgileri"}</span><ChevronDown aria-hidden="true" /></summary>
        <div className={createStyles.detailsBody}>
          <div className={createStyles.fieldGrid}>
            {allowMultiple ? <label className={`${createStyles.field} ${createStyles.wide}`}><span>Varyant adı</span><input required value={variant.title} maxLength={200} onChange={(event) => change(index, { title: event.target.value })} /></label> : null}
            <label className={createStyles.field}><span>Karşılaştırma fiyatı</span><input inputMode="decimal" placeholder="0,00" value={variant.compareAt} onChange={(event) => change(index, { compareAt: event.target.value })} /></label>
            <label className={createStyles.field}><span>Maliyet</span><input inputMode="decimal" placeholder="0,00" value={variant.cost} onChange={(event) => change(index, { cost: event.target.value })} /></label>
            {showShipping ? <><label className={createStyles.field}><span>Kargo desi</span><input inputMode="decimal" value={variant.shippingDesi} onChange={(event) => change(index, { shippingDesi: event.target.value })} /></label><label className={createStyles.field}><span>GTİP / HS kodu</span><input maxLength={32} value={variant.hsCode} onChange={(event) => change(index, { hsCode: event.target.value })} /></label></> : null}
          </div>
          {showValidation && invalidDetails ? <p className={createStyles.fieldError}>Varyant adı ve ek satış alanlarını kontrol edin.</p> : null}
          <div className={createStyles.variantDetailFooter}><label className={createStyles.check}><input type="checkbox" checked={variant.continueSellingWhenOutOfStock} onChange={(event) => change(index, { continueSellingWhenOutOfStock: event.target.checked })} /><span>Stok bitince satışa devam et</span></label>{allowMultiple ? <button className={createStyles.dangerAction} type="button" disabled={disableStructureChanges} onClick={() => { if (window.confirm(`${variant.title || "Bu varyant"} ve girilmiş satış bilgileri kaldırılacak. Devam edilsin mi?`)) onChange(Object.freeze(variants.filter((_, position) => position !== index))); }}><Trash2 aria-hidden="true" />Kaldır</button> : null}</div>
        </div>
      </details>
    </article>; })}
  </div>;
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
