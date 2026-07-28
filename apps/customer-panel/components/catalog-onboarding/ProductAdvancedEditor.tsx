"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import type { CatalogAdvancedCreateIntent, CatalogOnboardingOptions, CatalogOnboardingResourceKind, CatalogOnboardingResult, CatalogOnboardingVariantIntent } from "@celebix/saas-contracts";

import { CatalogOnboardingApiError, catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";
import { buildAdvancedCreateIntent, parseTurkishMoneyToCents } from "@/lib/catalog-onboarding-ui/forms";
import { ProductEditorSection } from "./ProductEditorSection";
import { emptyVariant, ProductVariantBuilder, type VariantDraft } from "./ProductVariantBuilder";
import styles from "./product-onboarding.module.css";

function text(data: FormData, name: string) { const value = data.get(name); return typeof value === "string" ? value.trim() : ""; }
function positiveInteger(value: string, fallback?: number) { if (value === "" && fallback !== undefined) return fallback; return /^(?:0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null; }
function optionalMoney(value: string) { return value === "" ? undefined : parseTurkishMoneyToCents(value) ?? null; }
function selected(data: FormData, name: string) { return Object.freeze(data.getAll(name).filter((value): value is string => typeof value === "string")); }

function variantIntent(variant: VariantDraft, productType: "physical" | "digital"): CatalogOnboardingVariantIntent | null {
  const priceCents = parseTurkishMoneyToCents(variant.price);
  const stockQuantity = positiveInteger(variant.stockQuantity, 0);
  const compareAtCents = optionalMoney(variant.compareAt);
  const costCents = optionalMoney(variant.cost);
  const shippingCents = variant.shippingDesi === "" ? undefined : parseTurkishMoneyToCents(variant.shippingDesi);
  if (priceCents === null || stockQuantity === null || compareAtCents === null || costCents === null || shippingCents === null || variant.title.trim().length < 1) return null;
  return Object.freeze({
    title: variant.title.trim(),
    ...(variant.sku.trim() ? { sku: variant.sku.trim() } : {}),
    ...(variant.barcode.trim() ? { barcode: variant.barcode.trim() } : {}),
    priceCents,
    ...(compareAtCents === undefined ? {} : { compareAtCents }),
    ...(costCents === undefined ? {} : { costCents }),
    stockTracking: true,
    stockQuantity,
    attributes: variant.attributes,
    continueSellingWhenOutOfStock: variant.continueSellingWhenOutOfStock,
    ...(productType === "physical" && shippingCents !== undefined ? { shippingDesiMilli: shippingCents * 10 } : {}),
    ...(productType === "physical" && variant.hsCode.trim() ? { hsCode: variant.hsCode.trim() } : {}),
    inventory: [],
  });
}

export function ProductAdvancedEditor({ options, onCreated, onCancel, api = catalogOnboardingClient }: Readonly<{
  options: CatalogOnboardingOptions;
  onCreated(result: CatalogOnboardingResult): void;
  onCancel(): void;
  api?: Pick<typeof catalogOnboardingClient, "createProduct" | "publishAfterMedia">;
}>) {
  const [kind, setKind] = useState<"simple" | "variant">("simple");
  const [productType, setProductType] = useState<"physical" | "digital">("physical");
  const [variants, setVariants] = useState<readonly VariantDraft[]>([emptyVariant()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const activeResources = (resourceKind: CatalogOnboardingResourceKind) => options.resources.filter(({ kind: selectedKind }) => selectedKind === resourceKind);
  const summary = useMemo(() => Object.freeze({ variantCount: variants.length, validPrices: variants.filter(({ price }) => parseTurkishMoneyToCents(price) !== null).length }), [variants]);

  function switchKind(next: "simple" | "variant") {
    setKind(next);
    setVariants(next === "simple" ? [emptyVariant()] : variants.length > 1 ? variants : [emptyVariant("Varyant 1"), emptyVariant("Varyant 2")]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const data = new FormData(event.currentTarget);
    const publish = (event.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement && (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "publish";
    const parsedVariants = variants.map((variant) => variantIntent(variant, productType));
    const minimum = positiveInteger(text(data, "minimumPurchaseQuantity"), 1);
    const maximumRaw = text(data, "maximumPurchaseQuantity");
    const maximum = maximumRaw ? positiveInteger(maximumRaw) : undefined;
    if (parsedVariants.some((variant) => variant === null) || minimum === null || maximum === null) { setError("Varyant, fiyat, stok ve satış sınırı alanlarını kontrol edin."); return; }
    const resources = (resourceKind: CatalogOnboardingResourceKind) => selected(data, `resource-${resourceKind}`);
    const brand = text(data, "resource-brand");
    const profile = {
      minimumPurchaseQuantity: minimum,
      ...(maximum === undefined ? {} : { maximumPurchaseQuantity: maximum }),
      ...(text(data, "supplierName") ? { supplierName: text(data, "supplierName") } : {}),
      ...(text(data, "googleProductCategoryId") ? { googleProductCategoryId: text(data, "googleProductCategoryId") } : {}),
      ...(text(data, "seoTitle") ? { seoTitle: text(data, "seoTitle") } : {}),
      ...(text(data, "seoDescription") ? { seoDescription: text(data, "seoDescription") } : {}),
    };
    const candidate: CatalogAdvancedCreateIntent = {
      kind: "advanced", productType, title: text(data, "title"), ...(text(data, "description") ? { description: text(data, "description") } : {}), publish,
      variants: parsedVariants as readonly CatalogOnboardingVariantIntent[],
      categoryIds: selected(data, "categoryIds"),
      resourceIds: { ...(brand ? { brand } : {}), collections: resources("collection"), tags: resources("tag"), attributes: resources("attribute"), extras: resources("extra"), definitions: resources("definition") },
      channelIds: selected(data, "channelIds"), profile,
    };
    const parsed = buildAdvancedCreateIntent(candidate);
    if (!parsed.ok) { setError(parsed.error); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const created = await api.createProduct(parsed.value);
      onCreated(publish ? await api.publishAfterMedia(created.product.id, { expectedProductVersion: created.product.version, expectedMediaCount: 0 }) : created);
    } catch (failure) { setError(failure instanceof CatalogOnboardingApiError ? failure.message : "Ürün kaydedilemedi."); }
    finally { lock.current = false; setBusy(false); }
  }

  return <form className={styles.advancedEditor} onSubmit={submit} noValidate>
    {error ? <div className={styles.error} role="alert">{error}</div> : null}
    <div className={styles.productKind} aria-label="Ürün yapısı"><button type="button" className={kind === "simple" ? styles.selected : ""} onClick={() => switchKind("simple")}>Basit ürün<small>Tek fiyat ve stok</small></button><button type="button" className={kind === "variant" ? styles.selected : ""} onClick={() => switchKind("variant")}>Varyantlı ürün<small>Renk, beden veya seçenekler</small></button></div>
    <div className={styles.editorLayout}>
      <div className={styles.sections}>
        <ProductEditorSection title="Temel bilgiler" description="Ad, açıklama ve ürün türü" open><div className="onboarding-editor-grid"><label className="onboarding-wide"><span>Ürün adı *</span><input name="title" required maxLength={200} autoFocus /></label><label><span>Ürün türü</span><select value={productType} onChange={(event) => setProductType(event.target.value as "physical" | "digital")}><option value="physical">Fiziksel ürün</option><option value="digital">Dijital ürün</option></select></label><label className="onboarding-wide"><span>Açıklama</span><textarea name="description" maxLength={10_000} rows={5} /></label></div></ProductEditorSection>
        <ProductEditorSection title="Fiyat ve stok" description="Satış, maliyet ve stok değerleri" open><ProductVariantBuilder variants={variants} onChange={setVariants} allowMultiple={kind === "variant"} showShipping={productType === "physical"} /></ProductEditorSection>
        <ProductEditorSection title="Varyantlar" description="Renk, beden ve diğer seçenek kombinasyonları"><p className={styles.helper}>{kind === "variant" ? `${variants.length} varyant düzenleniyor. Benzersiz seçenek kombinasyonları en fazla 100 varyant oluşturabilir.` : "Basit üründe tek Standart varyant kullanılır."}</p></ProductEditorSection>
        <ProductEditorSection title="Medya" description="Görseller oluşturma sonrasında güvenli medya akışında eklenir"><p className={styles.helper}>Ürünü kaydettikten sonra çoklu görsel sıralama, alt metin ve kapak yönetimi ürün sayfasında açılır.</p></ProductEditorSection>
        <ProductEditorSection title="Kategori, koleksiyon, marka ve etiket" description="Mağazadaki kalıcı sınıflandırmaları seçin"><div className="onboarding-editor-grid"><label><span>Kategoriler</span><select name="categoryIds" multiple size={Math.min(5, Math.max(2, options.categories.length))}>{options.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label><span>Marka</span><select name="resource-brand"><option value="">Marka seçilmedi</option>{activeResources("brand").map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>{(["collection", "tag"] as const).map((resourceKind) => <label key={resourceKind}><span>{resourceKind === "collection" ? "Koleksiyonlar" : "Etiketler"}</span><select multiple name={`resource-${resourceKind}`}>{activeResources(resourceKind).map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>)}<label><span>Tedarikçi</span><input name="supplierName" maxLength={200} /></label></div></ProductEditorSection>
        <ProductEditorSection title="Kargo ve gümrük" description="Fiziksel ürün ölçü ve HS bilgileri"><div className="onboarding-editor-grid"><label><span>Minimum sipariş</span><input name="minimumPurchaseQuantity" inputMode="numeric" defaultValue="1" /></label><label><span>Maksimum sipariş</span><input name="maximumPurchaseQuantity" inputMode="numeric" /></label><label><span>Google ürün kategori kimliği</span><input name="googleProductCategoryId" inputMode="numeric" maxLength={20} /></label></div></ProductEditorSection>
        <ProductEditorSection title="SEO" description="Arama sonucu başlığı ve açıklaması"><div className="onboarding-editor-grid"><label className="onboarding-wide"><span>SEO başlığı</span><input name="seoTitle" maxLength={200} /></label><label className="onboarding-wide"><span>SEO açıklaması</span><textarea name="seoDescription" maxLength={500} rows={4} /></label></div></ProductEditorSection>
        <ProductEditorSection title="Satış kanalları" description="Yalnız doğrulanmış etkin kanallar"><div className={styles.optionList}>{options.channels.length ? options.channels.map((channel) => <label key={channel.id}><input type="checkbox" name="channelIds" value={channel.id} /><span>{channel.name}<small>{channel.kind === "storefront" ? "Online mağaza" : "Pazar yeri"}</small></span></label>) : <p>Etkin satış kanalı bulunamadı.</p>}</div></ProductEditorSection>
        <ProductEditorSection title="Nitelikler ve ekstralar" description="Mağazadaki ürün seçenekleri"><div className={styles.optionList}>{(["attribute", "extra", "definition"] as const).flatMap((resourceKind) => activeResources(resourceKind).map((resource) => <label key={resource.id}><input type="checkbox" name={`resource-${resourceKind}`} value={resource.id} /><span>{resource.name}<small>{resourceKind}</small></span></label>))}</div></ProductEditorSection>
      </div>
      <aside className={styles.stickySummary} aria-label="Ürün hazırlık özeti"><span>ÜRÜN ÖZETİ</span><strong>{kind === "simple" ? "Basit ürün" : "Varyantlı ürün"}</strong><dl><div><dt>Varyant</dt><dd>{summary.variantCount}</dd></div><div><dt>Geçerli fiyat</dt><dd>{summary.validPrices}/{summary.variantCount}</dd></div><div><dt>Medya</dt><dd>0</dd></div><div><dt>Kanal</dt><dd>{options.channels.length} kullanılabilir</dd></div></dl><p>{summary.validPrices === summary.variantCount ? "Kaydetmeye hazır." : "Satış fiyatlarını tamamlayın."}</p></aside>
    </div>
    <footer className={styles.editorActions}><button type="button" className={styles.secondary} onClick={onCancel} disabled={busy}>Vazgeç</button><button type="submit" name="intent" value="draft" className={styles.secondary} disabled={busy}>Taslak kaydet</button><button type="submit" name="intent" value="publish" className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet ve satışa aç"}</button></footer>
  </form>;
}
