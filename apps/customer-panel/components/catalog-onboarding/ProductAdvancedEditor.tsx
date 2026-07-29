"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type {
  CatalogAdvancedCreateIntent,
  CatalogOnboardingOptions,
  CatalogOnboardingResourceIds,
  CatalogOnboardingResourceKind,
  CatalogOnboardingResult,
  CatalogOnboardingVariantIntent,
  CatalogProductEditorProjection,
  CatalogProductMerchandisingFields,
} from "@celebix/saas-contracts";

import { CatalogOnboardingApiError, catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";
import { buildCatalogCategoryHierarchy } from "@/lib/catalog-onboarding-ui/category-tree";
import { buildAdvancedCreateIntent, parseTurkishMoneyToCents } from "@/lib/catalog-onboarding-ui/forms";
import { completeProductMedia, type ProductMediaSelection } from "@/lib/catalog-onboarding-ui/media-completion";
import { productMediaApi } from "@/lib/catalog-ui/media-client";
import { ProductDescriptionField } from "@/components/catalog/ProductDescriptionField";
import { ProductEditorSection } from "./ProductEditorSection";
import { emptyVariant, ProductVariantBuilder, type VariantDraft } from "./ProductVariantBuilder";
import styles from "./product-onboarding.module.css";

type EditorApi = Pick<typeof catalogOnboardingClient, "createProduct" | "publishAfterMedia" | "updateMerchandising" | "getProductEditor">;

type ProductAdvancedEditorProps = Readonly<{
  options: CatalogOnboardingOptions;
  onCancel(): void;
  api?: EditorApi;
  mediaClient?: Pick<typeof productMediaApi, "upload">;
  editor?: CatalogProductEditorProjection;
  onCreated?(result: CatalogOnboardingResult): void;
  onUpdated?(result: CatalogOnboardingResult): void;
  onConflictReload?(): void;
}>;

function text(data: FormData, name: string) { const value = data.get(name); return typeof value === "string" ? value.trim() : ""; }
function positiveInteger(value: string, fallback?: number) { if (value === "" && fallback !== undefined) return fallback; return /^(?:0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null; }
function optionalMoney(value: string) { return value === "" ? undefined : parseTurkishMoneyToCents(value) ?? null; }
function selected(data: FormData, name: string) { return Object.freeze(data.getAll(name).filter((value): value is string => typeof value === "string")); }
function money(cents?: number) { return cents === undefined ? "" : `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`; }

function initialVariants(editor?: CatalogProductEditorProjection): readonly VariantDraft[] {
  if (!editor) return [emptyVariant()];
  return Object.freeze(editor.variants.map(({ variant, continueSellingWhenOutOfStock, shippingDesiMilli, hsCode }) => Object.freeze({
    title: variant.title,
    sku: variant.sku ?? "",
    barcode: variant.barcode ?? "",
    price: money(variant.priceCents),
    compareAt: money(variant.compareAtCents),
    cost: money(variant.costCents),
    stockQuantity: String(variant.stockQuantity),
    continueSellingWhenOutOfStock,
    shippingDesi: shippingDesiMilli === undefined ? "" : String(shippingDesiMilli / 1000).replace(".", ","),
    hsCode: hsCode ?? "",
    attributes: variant.attributes,
  })));
}

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

export function ProductAdvancedEditor({ options, onCancel, api = catalogOnboardingClient, mediaClient = productMediaApi, editor, onCreated, onUpdated, onConflictReload }: ProductAdvancedEditorProps) {
  const editing = editor !== undefined;
  const [kind, setKind] = useState<"simple" | "variant">((editor?.variants.length ?? 1) > 1 ? "variant" : "simple");
  const [productType, setProductType] = useState<"physical" | "digital">(editor?.profile.productType ?? "physical");
  const [variants, setVariants] = useState<readonly VariantDraft[]>(() => initialVariants(editor));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [media, setMedia] = useState<readonly ProductMediaSelection[]>([]);
  const [createdProductId, setCreatedProductId] = useState<string>();
  const [progress, setProgress] = useState(0);
  const lock = useRef(false);
  const categoryHierarchy = buildCatalogCategoryHierarchy(options.categories);
  const categoryRows = categoryHierarchy.valid ? categoryHierarchy.rows : [];
  const activeResources = (resourceKind: CatalogOnboardingResourceKind) => options.resources.filter(({ kind: selectedKind }) => selectedKind === resourceKind);
  const summary = useMemo(() => Object.freeze({ variantCount: variants.length, validPrices: variants.filter(({ price }) => parseTurkishMoneyToCents(price) !== null).length }), [variants]);

  function switchKind(next: "simple" | "variant") {
    if (editing) return;
    setKind(next);
    setVariants(next === "simple" ? [emptyVariant()] : variants.length > 1 ? variants : [emptyVariant("Varyant 1"), emptyVariant("Varyant 2")]);
  }

  function selectMedia(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    if (files.length > 16 || files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > 5_242_880)) {
      event.currentTarget.value = "";
      setError("En fazla 16 adet PNG, JPEG veya WebP görsel seçin; her dosya en fazla 5 MB olabilir.");
      return;
    }
    setError("");
    setMedia(Object.freeze(files.map((file) => Object.freeze({ file, altText: "" }))));
  }

  function changeMediaAlt(index: number, altText: string) {
    setMedia((current) => Object.freeze(current.map((selected, position) => position === index ? Object.freeze({ ...selected, altText }) : selected)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    if (!categoryHierarchy.valid) { setError("Kategori seçenekleri şu anda kullanılamıyor."); return; }
    const data = new FormData(event.currentTarget);
    const minimum = positiveInteger(text(data, "minimumPurchaseQuantity"), 1);
    const maximumRaw = text(data, "maximumPurchaseQuantity");
    const maximum = maximumRaw ? positiveInteger(maximumRaw) : undefined;
    if (minimum === null || maximum === null) { setError("Satış sınırı alanlarını kontrol edin."); return; }
    const resources = (resourceKind: CatalogOnboardingResourceKind) => selected(data, `resource-${resourceKind}`);
    const brand = text(data, "resource-brand");
    const profile: CatalogProductMerchandisingFields = {
      minimumPurchaseQuantity: minimum,
      ...(maximum === undefined ? {} : { maximumPurchaseQuantity: maximum }),
      ...(text(data, "supplierName") ? { supplierName: text(data, "supplierName") } : {}),
      ...(text(data, "googleProductCategoryId") ? { googleProductCategoryId: text(data, "googleProductCategoryId") } : {}),
      ...(text(data, "seoTitle") ? { seoTitle: text(data, "seoTitle") } : {}),
      ...(text(data, "seoDescription") ? { seoDescription: text(data, "seoDescription") } : {}),
    };
    const resourceIds: CatalogOnboardingResourceIds = { ...(brand ? { brand } : {}), collections: resources("collection"), tags: resources("tag"), attributes: resources("attribute"), extras: resources("extra"), definitions: resources("definition") };
    const categoryIds = selected(data, "categoryIds");
    const channelIds = selected(data, "channelIds");

    lock.current = true; setBusy(true); setError(""); setConflict(false);
    try {
      if (editor) {
        const updated = await api.updateMerchandising(editor.product.id, { expectedProfileVersion: editor.profile.version, profile, categoryIds, resourceIds, channelIds });
        onUpdated?.(updated);
        return;
      }
      const publish = (event.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement && (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "publish";
      const parsedVariants = variants.map((variant) => variantIntent(variant, productType));
      if (parsedVariants.some((variant) => variant === null)) { setError("Varyant, fiyat ve stok alanlarını kontrol edin."); return; }
      const candidate: CatalogAdvancedCreateIntent = {
        kind: "advanced", productType, title: text(data, "title"), ...(text(data, "description") ? { description: text(data, "description") } : {}), publish,
        variants: parsedVariants as readonly CatalogOnboardingVariantIntent[], categoryIds, resourceIds, channelIds, profile,
      };
      const parsed = buildAdvancedCreateIntent(candidate);
      if (!parsed.ok) { setError(parsed.error); return; }
      const created = await api.createProduct(parsed.value);
      setCreatedProductId(created.product.id);
      const outcome = await completeProductMedia({
        result: created,
        files: Object.freeze(media.map(({ file, altText }) => Object.freeze({ file, altText: altText.trim() }))),
        publish,
        upload: (productId, input) => mediaClient.upload(productId, input),
        complete: (productId, input) => api.publishAfterMedia(productId, input),
        recover: (productId) => api.getProductEditor(productId),
        onProgress: ({ index, count, value }) => setProgress(Math.round(((index + value / 100) / Math.max(1, count)) * 100)),
      });
      if (outcome.kind === "published" || outcome.kind === "draft") onCreated?.(outcome.result);
      else if (outcome.kind === "published_recovered") onCreated?.(Object.freeze({ ...outcome.projection, variants: Object.freeze(outcome.projection.variants.map(({ variant }) => variant)), replayed: false }));
      else if (outcome.kind === "draft_media_failed") setError("Ürün oluşturuldu, bazı görseller yüklenemedi. Taslak korundu; medya yöneticisinden kalanları tamamlayın.");
      else setError("Ürün oluşturuldu ancak yayın sonucu doğrulanamadı. İkinci yazma yapılmadı; ürün sayfasından güvenle kontrol edin.");
    } catch (failure) {
      if (failure instanceof CatalogOnboardingApiError && failure.code === "version_conflict") {
        setConflict(true);
        setError("Bu ürün sunucuda değişti. Yerel alanlarınız korunuyor; isterseniz sunucudaki sürümü yükleyin.");
      } else setError(failure instanceof CatalogOnboardingApiError ? failure.message : "Ürün kaydedilemedi.");
    } finally { lock.current = false; setBusy(false); }
  }

  const has = (ids: readonly string[], id: string) => ids.includes(id);
  return <form className={styles.advancedEditor} onSubmit={submit} noValidate>
    {error ? <div className={styles.error} role="alert"><span>{error}</span>{conflict ? <button type="button" className={styles.secondary} onClick={onConflictReload}>Sunucudaki sürümü yükle</button> : null}{createdProductId ? <Link className={styles.secondary} href={`/products/${createdProductId}`}>Ürüne git</Link> : null}</div> : null}
    {!categoryHierarchy.valid ? <div className={styles.error} role="alert">Kategori seçenekleri şu anda kullanılamıyor.</div> : null}
    <div className={styles.productKind} aria-label="Ürün yapısı"><button type="button" disabled={editing} className={kind === "simple" ? styles.selected : ""} onClick={() => switchKind("simple")}>Basit ürün<small>Tek fiyat ve stok</small></button><button type="button" disabled={editing} className={kind === "variant" ? styles.selected : ""} onClick={() => switchKind("variant")}>Varyantlı ürün<small>Renk, beden veya seçenekler</small></button></div>
    <div className={styles.editorLayout}>
      <div className={styles.sections}>
        <ProductEditorSection title="Temel bilgiler" description={editing ? "Temel alanlar mevcut ürün düzenleyicisinden yönetilir" : "Ad, açıklama ve ürün türü"} open><div className="onboarding-editor-grid"><label className="onboarding-wide"><span>Ürün adı *</span><input name="title" required maxLength={200} autoFocus={!editing} defaultValue={editor?.product.title ?? ""} readOnly={editing} /></label><label><span>Ürün türü</span><select value={productType} disabled={editing} onChange={(event) => setProductType(event.target.value as "physical" | "digital")}><option value="physical">Fiziksel ürün</option><option value="digital">Dijital ürün</option></select></label><ProductDescriptionField className="onboarding-wide" defaultValue={editor?.product.description ?? ""} readOnly={editing} /></div></ProductEditorSection>
        <ProductEditorSection title="Fiyat ve stok" description={editing ? "Varyant kartlarından ayrı, sürümlü olarak yönetilir" : "Satış, maliyet ve stok değerleri"} open>{editing ? <p className={styles.helper}>{variants.length} kalıcı varyant yüklendi. Fiyat ve stok değişiklikleri aşağıdaki mevcut varyant kartlarından yapılır.</p> : <ProductVariantBuilder variants={variants} onChange={setVariants} allowMultiple={kind === "variant"} showShipping={productType === "physical"} />}</ProductEditorSection>
        <ProductEditorSection title="Varyantlar" description="Renk, beden ve diğer seçenek kombinasyonları"><p className={styles.helper}>{kind === "variant" ? `${variants.length} varyant düzenleniyor. Benzersiz seçenek kombinasyonları en fazla 100 varyant oluşturabilir.` : "Basit üründe tek Standart varyant kullanılır."}</p></ProductEditorSection>
        <ProductEditorSection title="Medya" description="Görseller güvenli medya akışından yönetilir">{editing ? <p className={styles.helper}>{editor.mediaCount} kalıcı görsel bulunuyor. Sıralama, alt metin ve kapak işlemleri aşağıdaki medya yöneticisinde korunur.</p> : <div className={styles.advancedMedia}><label className={styles.media}><span>{media.length ? `${media.length} görsel seçildi` : "Görselleri seç"}<small>En fazla 16 adet JPEG, PNG veya WebP · dosya başına 5 MB</small></span><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={selectMedia} /></label>{media.map((selected, index) => <label key={`${selected.file.name}-${index}`}><span>{index + 1}. görsel alt metni</span><input value={selected.altText} maxLength={500} onChange={(event) => changeMediaAlt(index, event.target.value)} /></label>)}{busy && media.length ? <progress max="100" value={progress}>{progress}%</progress> : null}</div>}</ProductEditorSection>
        <ProductEditorSection title="Kategori, koleksiyon, marka ve etiket" description="Mağazadaki kalıcı sınıflandırmaları seçin"><div className="onboarding-editor-grid"><label><span>Kategoriler</span><select name="categoryIds" multiple defaultValue={editor?.categoryIds ?? []} size={Math.min(5, Math.max(2, categoryRows.length))}>{categoryRows.map(({ category, label }) => <option key={category.id} value={category.id}>{label}</option>)}</select></label><label><span>Marka</span><select name="resource-brand" defaultValue={editor?.resourceIds.brand ?? ""}><option value="">Marka seçilmedi</option>{activeResources("brand").map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>{(["collection", "tag"] as const).map((resourceKind) => <label key={resourceKind}><span>{resourceKind === "collection" ? "Koleksiyonlar" : "Etiketler"}</span><select multiple name={`resource-${resourceKind}`} defaultValue={resourceKind === "collection" ? editor?.resourceIds.collections ?? [] : editor?.resourceIds.tags ?? []}>{activeResources(resourceKind).map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>)}<label><span>Tedarikçi</span><input name="supplierName" maxLength={200} defaultValue={editor?.profile.supplierName ?? ""} /></label></div></ProductEditorSection>
        <ProductEditorSection title="Kargo ve gümrük" description="Fiziksel ürün ölçü ve HS bilgileri"><div className="onboarding-editor-grid"><label><span>Minimum sipariş</span><input name="minimumPurchaseQuantity" inputMode="numeric" defaultValue={editor?.profile.minimumPurchaseQuantity ?? 1} /></label><label><span>Maksimum sipariş</span><input name="maximumPurchaseQuantity" inputMode="numeric" defaultValue={editor?.profile.maximumPurchaseQuantity ?? ""} /></label><label><span>Google ürün kategori kimliği</span><input name="googleProductCategoryId" inputMode="numeric" maxLength={20} defaultValue={editor?.profile.googleProductCategoryId ?? ""} /></label></div></ProductEditorSection>
        <ProductEditorSection title="SEO" description="Arama sonucu başlığı ve açıklaması"><div className="onboarding-editor-grid"><label className="onboarding-wide"><span>SEO başlığı</span><input name="seoTitle" maxLength={200} defaultValue={editor?.profile.seoTitle ?? ""} /></label><label className="onboarding-wide"><span>SEO açıklaması</span><textarea name="seoDescription" maxLength={500} rows={4} defaultValue={editor?.profile.seoDescription ?? ""} /></label></div></ProductEditorSection>
        <ProductEditorSection title="Satış kanalları" description="Yalnız doğrulanmış etkin kanallar"><div className={styles.optionList}>{options.channels.length ? options.channels.map((channel) => <label key={channel.id}><input type="checkbox" name="channelIds" value={channel.id} defaultChecked={has(editor?.channelIds ?? [], channel.id)} /><span>{channel.name}<small>{channel.kind === "storefront" ? "Online mağaza" : "Pazar yeri"}</small></span></label>) : <p>Etkin satış kanalı bulunamadı.</p>}</div></ProductEditorSection>
        <ProductEditorSection title="Nitelikler ve ekstralar" description="Mağazadaki ürün seçenekleri"><div className={styles.optionList}>{(["attribute", "extra", "definition"] as const).flatMap((resourceKind) => activeResources(resourceKind).map((resource) => <label key={resource.id}><input type="checkbox" name={`resource-${resourceKind}`} value={resource.id} defaultChecked={has(editor?.resourceIds[`${resourceKind}s` as "attributes" | "extras" | "definitions"] ?? [], resource.id)} /><span>{resource.name}<small>{resourceKind}</small></span></label>))}</div></ProductEditorSection>
      </div>
      <aside className={styles.stickySummary} aria-label="Ürün hazırlık özeti"><span>ÜRÜN ÖZETİ</span><strong>{kind === "simple" ? "Basit ürün" : "Varyantlı ürün"}</strong><dl><div><dt>Varyant</dt><dd>{summary.variantCount}</dd></div><div><dt>Geçerli fiyat</dt><dd>{summary.validPrices}/{summary.variantCount}</dd></div><div><dt>Medya</dt><dd>{editor?.mediaCount ?? 0}</dd></div><div><dt>Kanal</dt><dd>{options.channels.length} kullanılabilir</dd></div></dl><p>{editing ? `Kalıcı profil v${editor.profile.version}` : summary.validPrices === summary.variantCount ? "Kaydetmeye hazır." : "Satış fiyatlarını tamamlayın."}</p></aside>
    </div>
    <footer className={styles.editorActions}><button type="button" className={styles.secondary} onClick={onCancel} disabled={busy}>Vazgeç</button>{editing ? <button type="submit" className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : "Satış ayarlarını kaydet"}</button> : <><button type="submit" name="intent" value="draft" className={styles.secondary} disabled={busy}>Taslak kaydet</button><button type="submit" name="intent" value="publish" className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet ve satışa aç"}</button></>}</footer>
  </form>;
}
