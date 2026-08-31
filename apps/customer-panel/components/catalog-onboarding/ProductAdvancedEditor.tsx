"use client";

import Link from "next/link";
import { Boxes, Check, ImagePlus, Package } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
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
import {
  updateProductDraft,
  type ProductDraftSession,
} from "@/lib/catalog-ui/product-draft-session";
import { createDirtyNavigationGuard } from "@/lib/catalog-ui/dirty-navigation";
import { ProductDescriptionField } from "@/components/catalog/ProductDescriptionField";
import { ProductClassificationPicker } from "./ProductClassificationPicker";
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
  draftSession?: ProductDraftSession;
  onDraftSessionChange?(session: ProductDraftSession): void;
}>;

type EditorMediaSelection = ProductMediaSelection & Readonly<{ preview: string }>;

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

function initialChannelIds(options: CatalogOnboardingOptions, editor?: CatalogProductEditorProjection): readonly string[] {
  if (editor) return editor.channelIds;
  const storefrontChannels = options.channels.filter((channel) => channel.kind === "storefront").map((channel) => channel.id);
  return Object.freeze(storefrontChannels.length ? storefrontChannels : options.channels.map((channel) => channel.id));
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

export function ProductAdvancedEditor({ options, onCancel, api = catalogOnboardingClient, mediaClient = productMediaApi, editor, onCreated, onUpdated, onConflictReload, draftSession, onDraftSessionChange }: ProductAdvancedEditorProps) {
  const editing = editor !== undefined;
  const [kind, setKind] = useState<"simple" | "variant">(draftSession?.current.kind ?? ((editor?.variants.length ?? 1) > 1 ? "variant" : "simple"));
  const [productType, setProductType] = useState<"physical" | "digital">(draftSession?.current.productType ?? editor?.profile.productType ?? "physical");
  const [variants, setVariants] = useState<readonly VariantDraft[]>(() => draftSession?.current.variants ?? initialVariants(editor));
  const [titleValue, setTitleValue] = useState(draftSession?.current.title ?? editor?.product.title ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [media, setMedia] = useState<readonly EditorMediaSelection[]>(draftSession?.current.media ?? []);
  const [categoryIds, setCategoryIds] = useState<readonly string[]>(draftSession?.current.categoryIds ?? editor?.categoryIds ?? []);
  const [collectionIds, setCollectionIds] = useState<readonly string[]>(draftSession?.current.collectionIds ?? editor?.resourceIds.collections ?? []);
  const [tagIds, setTagIds] = useState<readonly string[]>(draftSession?.current.tagIds ?? editor?.resourceIds.tags ?? []);
  const [selectedChannelIds, setSelectedChannelIds] = useState<readonly string[]>(() => draftSession?.current.channelIds ?? initialChannelIds(options, editor));
  const [showValidation, setShowValidation] = useState(false);
  const [createdProductId, setCreatedProductId] = useState<string>();
  const [progress, setProgress] = useState(0);
  const lock = useRef(false);
  const editingDirtyRef = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const mediaPreviewUrlsRef = useRef<readonly string[]>([]);
  const categoryHierarchy = buildCatalogCategoryHierarchy(options.categories);
  const categoryRows = categoryHierarchy.valid ? categoryHierarchy.rows : [];
  const activeResources = (resourceKind: CatalogOnboardingResourceKind) => options.resources.filter(({ kind: selectedKind }) => selectedKind === resourceKind);
  const summary = useMemo(() => {
    const validPrices = variants.filter(({ price }) => parseTurkishMoneyToCents(price) !== null).length;
    const validVariants = variants.filter((variant) => variantIntent(variant, productType) !== null).length;
    const missing = [
      ...(titleValue.trim() ? [] : [Object.freeze({ href: "#product-basics", label: "Ürün adını tamamlayın." })]),
      ...(validPrices === variants.length ? [] : [Object.freeze({ href: "#product-commerce", label: kind === "simple" ? "Satış fiyatını tamamlayın." : "Varyant fiyatlarını tamamlayın." })]),
      ...(validPrices < variants.length || validVariants === variants.length ? [] : [Object.freeze({ href: "#product-commerce", label: "Varyant stok ve zorunlu alanlarını kontrol edin." })]),
    ];
    const firstPrice = variants[0] && parseTurkishMoneyToCents(variants[0].price) !== null ? `${variants[0].price} ₺` : "Eksik";
    return Object.freeze({ variantCount: variants.length, validPrices, validVariants, firstPrice, missing: Object.freeze(missing) });
  }, [kind, productType, titleValue, variants]);

  useEffect(() => () => {
    if (onDraftSessionChange === undefined) for (const preview of mediaPreviewUrlsRef.current) URL.revokeObjectURL(preview);
  }, [onDraftSessionChange]);

  useEffect(() => {
    if (!editing) return;
    const guard = createDirtyNavigationGuard({
      isDirty: () => editingDirtyRef.current,
      confirm: () => window.confirm("Kaydedilmemiş satış ayarı değişiklikleriniz var. Düzenleyiciyi kapatmak istiyor musunuz?"),
    });
    return guard.bindBeforeUnload(window);
  }, [editing]);

  useEffect(() => {
    if (draftSession === undefined || onDraftSessionChange === undefined || editing) return;
    onDraftSessionChange(updateProductDraft(draftSession, {
      kind,
      productType,
      title: titleValue,
      variants,
      categoryIds,
      collectionIds,
      tagIds,
      channelIds: selectedChannelIds,
      media,
    }));
  // Parent session updates are projections of these local fields.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, productType, titleValue, variants, categoryIds, collectionIds, tagIds, selectedChannelIds, media, editing, onDraftSessionChange]);

  function markEditingDirty() {
    if (editing) editingDirtyRef.current = true;
  }

  function requestCancel() {
    if (editing) {
      const guard = createDirtyNavigationGuard({
        isDirty: () => editingDirtyRef.current,
        confirm: () => window.confirm("Kaydedilmemiş satış ayarı değişiklikleriniz var. Düzenleyiciyi kapatmak istiyor musunuz?"),
      });
      if (!guard.canLeave()) return;
      editingDirtyRef.current = false;
    }
    onCancel();
  }

  function reloadConflict() {
    editingDirtyRef.current = false;
    onConflictReload?.();
  }

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
    if (onDraftSessionChange === undefined) for (const preview of mediaPreviewUrlsRef.current) URL.revokeObjectURL(preview);
    const next = Object.freeze(files.map((file) => Object.freeze({ file, altText: "", preview: URL.createObjectURL(file) })));
    mediaPreviewUrlsRef.current = Object.freeze(next.map(({ preview }) => preview));
    setMedia(next);
  }

  function changeMediaAlt(index: number, altText: string) {
    setMedia((current) => Object.freeze(current.map((selected, position) => position === index ? Object.freeze({ ...selected, altText }) : selected)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    if (!categoryHierarchy.valid) { setError("Kategori seçenekleri şu anda kullanılamıyor."); return; }
    const data = new FormData(event.currentTarget);
    const parsedCreateVariants = editing ? [] : variants.map((variant) => variantIntent(variant, productType));
    if (!editing) {
      setShowValidation(true);
      if (!titleValue.trim() || parsedCreateVariants.some((variant) => variant === null)) {
        setError("Zorunlu ürün ve satış alanlarını kontrol edin.");
        if (!titleValue.trim()) titleRef.current?.focus();
        else document.querySelector<HTMLElement>("#product-commerce")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
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
        editingDirtyRef.current = false;
        onUpdated?.(updated);
        return;
      }
      const publish = (event.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement && (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "publish";
      const candidate: CatalogAdvancedCreateIntent = {
        kind: "advanced", productType, title: text(data, "title"), ...(text(data, "description") ? { description: text(data, "description") } : {}), publish,
        variants: parsedCreateVariants as readonly CatalogOnboardingVariantIntent[], categoryIds, resourceIds, channelIds, profile,
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
      else if (outcome.kind === "draft_media_failed") onCreated?.(outcome.result);
      else onCreated?.(outcome.result);
    } catch (failure) {
      if (failure instanceof CatalogOnboardingApiError && failure.code === "version_conflict") {
        setConflict(true);
        setError("Bu ürün sunucuda değişti. Yerel alanlarınız korunuyor; isterseniz sunucudaki sürümü yükleyin.");
      } else setError(failure instanceof CatalogOnboardingApiError ? failure.message : "Ürün kaydedilemedi.");
    } finally { lock.current = false; setBusy(false); }
  }

  const has = (ids: readonly string[], id: string) => ids.includes(id);
  const categoryChoices = categoryRows.map(({ category, label }) => Object.freeze({ id: category.id, label }));
  const collectionChoices = activeResources("collection").map((resource) => Object.freeze({ id: resource.id, label: resource.name }));
  const tagChoices = activeResources("tag").map((resource) => Object.freeze({ id: resource.id, label: resource.name }));

  if (editor === undefined) return <form className={`${styles.advancedEditor} ${styles.createWorkspace}`} onSubmit={submit} onChange={markEditingDirty} noValidate>
    {error ? <div className={styles.error} role="alert"><span>{error}</span>{conflict ? <button type="button" className={styles.secondary} onClick={reloadConflict}>Sunucudaki sürümü yükle</button> : null}{createdProductId ? <Link className={styles.secondary} href={`/products/${createdProductId}`}>Ürüne git</Link> : null}</div> : null}
    {!categoryHierarchy.valid ? <div className={styles.error} role="alert">Kategori seçenekleri şu anda kullanılamıyor.</div> : null}
    <div className={styles.productKind} aria-label="Ürün yapısı">
      <button type="button" aria-pressed={kind === "simple"} className={kind === "simple" ? styles.selected : ""} onClick={() => switchKind("simple")}><span className={styles.kindIcon}><Package aria-hidden="true" /></span><span><strong>Basit ürün</strong><small>Tek fiyat ve stok</small></span>{kind === "simple" ? <Check className={styles.kindCheck} aria-hidden="true" /> : null}</button>
      <button type="button" aria-pressed={kind === "variant"} className={kind === "variant" ? styles.selected : ""} onClick={() => switchKind("variant")}><span className={styles.kindIcon}><Boxes aria-hidden="true" /></span><span><strong>Varyantlı ürün</strong><small>Renk, beden veya diğer seçenekler</small></span>{kind === "variant" ? <Check className={styles.kindCheck} aria-hidden="true" /> : null}</button>
    </div>
    <div className={styles.editorLayout}>
      <div className={styles.sections}>
        <ProductEditorSection id="product-basics" title="Temel bilgiler" description="Ürün adı, türü ve açıklaması" open><div className="onboarding-editor-grid"><label className="onboarding-wide onboarding-title-field"><span>Ürün adı *</span><input ref={titleRef} name="title" required maxLength={200} autoFocus value={titleValue} onChange={(event) => setTitleValue(event.target.value)} aria-invalid={showValidation && !titleValue.trim()} />{showValidation && !titleValue.trim() ? <small className={styles.fieldError}>Ürün adı gerekli.</small> : null}</label><label><span>Ürün türü</span><select value={productType} onChange={(event) => setProductType(event.target.value as "physical" | "digital")}><option value="physical">Fiziksel ürün</option><option value="digital">Dijital ürün</option></select></label><ProductDescriptionField className="onboarding-wide" rows={4} previewCollapsed /></div></ProductEditorSection>
        <ProductEditorSection id="product-commerce" title={kind === "simple" ? "Fiyat ve stok" : "Varyantlar"} description={kind === "simple" ? "Ürünün satış fiyatı ve stok durumu" : `${variants.length} satış varyantı`} open>
          {showValidation && summary.validVariants < variants.length ? <p className={styles.inlineValidation}>Fiyat, stok ve zorunlu varyant alanlarını kontrol edin.</p> : null}
          {kind === "variant" ? <p className={styles.helper}>Her satır ayrı fiyat, stok ve SKU bilgisi taşır.</p> : null}
          <ProductVariantBuilder variants={variants} onChange={setVariants} allowMultiple={kind === "variant"} showShipping={productType === "physical"} />
        </ProductEditorSection>
        <ProductEditorSection id="product-media" title="Medya" description={media.length ? `${media.length} görsel seçildi` : "Görselleri ekleyin ve alt metinlerini tamamlayın"}>
          <div className={styles.advancedMedia}>
            <label className={`${styles.media} ${styles.createMediaPicker}`}><ImagePlus aria-hidden="true" /><span>{media.length ? "Görselleri değiştir" : "+ Görsel ekle"}<small>JPEG, PNG veya WebP · en fazla 16 görsel · dosya başına 5 MB</small></span><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={selectMedia} /></label>
            {media.length ? <div className={styles.createMediaGrid}>{media.map((selected, index) => <article key={`${selected.file.name}-${index}`}><div className={styles.createMediaThumbnail}><img src={selected.preview} alt={`${index + 1}. yüklenecek ürün görseli önizlemesi`} />{index === 0 ? <span>Birincil</span> : null}</div><label><span>Alt metin</span><input value={selected.altText} maxLength={500} onChange={(event) => changeMediaAlt(index, event.target.value)} placeholder="Görseli kısaca açıklayın" /></label></article>)}</div> : null}
            {busy && media.length ? <progress max="100" value={progress}>{progress}%</progress> : null}
          </div>
        </ProductEditorSection>
        <ProductEditorSection id="product-organization" title="Organizasyon" description="Kategori, marka, koleksiyon ve etiketler">
          <div className={styles.organizationGrid}>
            <ProductClassificationPicker label="Kategoriler" name="categoryIds" options={categoryChoices} selected={categoryIds} onChange={setCategoryIds} searchLabel="Kategori ara" />
            <label><span>Marka</span><select name="resource-brand" defaultValue=""><option value="">Marka seçilmedi</option>{activeResources("brand").map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>
            <ProductClassificationPicker label="Koleksiyonlar" name="resource-collection" options={collectionChoices} selected={collectionIds} onChange={setCollectionIds} searchLabel="Koleksiyon ara" />
            <ProductClassificationPicker label="Etiketler" name="resource-tag" options={tagChoices} selected={tagIds} onChange={setTagIds} searchLabel="Etiket ara" />
            <label><span>Tedarikçi</span><input name="supplierName" maxLength={200} /></label>
          </div>
        </ProductEditorSection>
        <ProductEditorSection id="product-advanced" title="Gelişmiş ayarlar" description="Satış kanalları, SEO ve diğer ayrıntılar">
          <div className={styles.advancedGroups}>
            <details><summary>Kargo ve sipariş sınırları</summary><div className="onboarding-editor-grid"><label><span>Minimum sipariş</span><input name="minimumPurchaseQuantity" inputMode="numeric" defaultValue={1} /></label><label><span>Maksimum sipariş</span><input name="maximumPurchaseQuantity" inputMode="numeric" /></label><label><span>Google ürün kategori kimliği</span><input name="googleProductCategoryId" inputMode="numeric" maxLength={20} /></label></div></details>
            <details><summary>SEO</summary><div className="onboarding-editor-grid"><label className="onboarding-wide"><span>SEO başlığı</span><input name="seoTitle" maxLength={200} /></label><label className="onboarding-wide"><span>SEO açıklaması</span><textarea name="seoDescription" maxLength={500} rows={4} /></label></div></details>
            <details><summary>Satış kanalları</summary><div className={styles.optionList}>{options.channels.length ? options.channels.map((channel) => <label key={channel.id}><input type="checkbox" name="channelIds" value={channel.id} checked={selectedChannelIds.includes(channel.id)} onChange={(event) => setSelectedChannelIds((current) => event.target.checked ? Object.freeze([...current, channel.id]) : Object.freeze(current.filter((id) => id !== channel.id)))} /><span>{channel.name}<small>{channel.kind === "storefront" ? "Online mağaza" : "Pazar yeri"}</small></span></label>) : <p>Etkin satış kanalı bulunamadı.</p>}</div></details>
            <details><summary>Nitelikler ve ekstralar</summary><div className={styles.optionList}>{(["attribute", "extra", "definition"] as const).flatMap((resourceKind) => activeResources(resourceKind).map((resource) => <label key={resource.id}><input type="checkbox" name={`resource-${resourceKind}`} value={resource.id} /><span>{resource.name}<small>{resourceKind}</small></span></label>))}</div></details>
          </div>
        </ProductEditorSection>
      </div>
      <aside className={styles.stickySummary} aria-label="Ürün hazırlık özeti"><span>ÜRÜN ÖZETİ</span><strong>{kind === "simple" ? "Basit ürün" : "Varyantlı ürün"}</strong><dl><div><dt>Varyant</dt><dd>{summary.variantCount}</dd></div><div><dt>Geçerli fiyat</dt><dd>{kind === "simple" ? summary.firstPrice : `${summary.validPrices}/${summary.variantCount} tamam`}</dd></div><div><dt>Medya</dt><dd>{media.length}</dd></div><div><dt>Satış kanalı</dt><dd>{selectedChannelIds.length}/{options.channels.length} seçili</dd></div></dl>{summary.missing.length ? <div className={styles.summaryMissing}><span>Tamamlanması gerekenler</span><ul>{summary.missing.map((item) => <li key={item.label}><a href={item.href}>{item.label}</a></li>)}</ul></div> : <p className={styles.summaryReady}><Check aria-hidden="true" /> Zorunlu alanlar tamam.</p>}</aside>
    </div>
    <footer className={styles.editorActions}><button type="button" className={styles.advanced} onClick={requestCancel} disabled={busy}>Vazgeç</button><button type="submit" name="intent" value="draft" className={styles.secondary} disabled={busy}>Taslak kaydet</button><button type="submit" name="intent" value="publish" className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet ve satışa aç"}</button></footer>
  </form>;

  return <form className={styles.advancedEditor} onSubmit={submit} onChange={markEditingDirty} noValidate>
    {error ? <div className={styles.error} role="alert"><span>{error}</span>{conflict ? <button type="button" className={styles.secondary} onClick={reloadConflict}>Sunucudaki sürümü yükle</button> : null}{createdProductId ? <Link className={styles.secondary} href={`/products/${createdProductId}`}>Ürüne git</Link> : null}</div> : null}
    {!categoryHierarchy.valid ? <div className={styles.error} role="alert">Kategori seçenekleri şu anda kullanılamıyor.</div> : null}
    <div className={styles.productKind} aria-label="Ürün yapısı"><button type="button" disabled className={kind === "simple" ? styles.selected : ""}>Basit ürün<small>Tek fiyat ve stok</small></button><button type="button" disabled className={kind === "variant" ? styles.selected : ""}>Varyantlı ürün<small>Renk, beden veya seçenekler</small></button></div>
    <div className={styles.editorLayout}>
      <div className={styles.sections}>
        <ProductEditorSection title="Temel bilgiler" description="Temel alanlar mevcut ürün düzenleyicisinden yönetilir" open><div className="onboarding-editor-grid"><label className="onboarding-wide"><span>Ürün adı *</span><input name="title" required maxLength={200} defaultValue={editor.product.title} readOnly /></label><label><span>Ürün türü</span><select value={productType} disabled><option value="physical">Fiziksel ürün</option><option value="digital">Dijital ürün</option></select></label><ProductDescriptionField className="onboarding-wide" defaultValue={editor.product.description ?? ""} readOnly /></div></ProductEditorSection>
        <ProductEditorSection title="Fiyat ve stok" description="Varyant kartlarından ayrı, sürümlü olarak yönetilir" open><p className={styles.helper}>{variants.length} kalıcı varyant yüklendi. Fiyat ve stok değişiklikleri aşağıdaki mevcut varyant kartlarından yapılır.</p></ProductEditorSection>
        <ProductEditorSection title="Varyantlar" description="Renk, beden ve diğer seçenek kombinasyonları"><p className={styles.helper}>{kind === "variant" ? `${variants.length} varyant düzenleniyor. Benzersiz seçenek kombinasyonları en fazla 100 varyant oluşturabilir.` : "Basit üründe tek Standart varyant kullanılır."}</p></ProductEditorSection>
        <ProductEditorSection title="Medya" description="Görseller güvenli medya akışından yönetilir"><p className={styles.helper}>{editor.mediaCount} kalıcı görsel bulunuyor. Sıralama, alt metin ve kapak işlemleri aşağıdaki medya yöneticisinde korunur.</p></ProductEditorSection>
        <ProductEditorSection title="Kategori, koleksiyon, marka ve etiket" description="Mağazadaki kalıcı sınıflandırmaları seçin"><div className="onboarding-editor-grid"><label><span>Kategoriler</span><select name="categoryIds" multiple defaultValue={editor.categoryIds} size={Math.min(5, Math.max(2, categoryRows.length))}>{categoryRows.map(({ category, label }) => <option key={category.id} value={category.id}>{label}</option>)}</select></label><label><span>Marka</span><select name="resource-brand" defaultValue={editor.resourceIds.brand ?? ""}><option value="">Marka seçilmedi</option>{activeResources("brand").map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>{(["collection", "tag"] as const).map((resourceKind) => <label key={resourceKind}><span>{resourceKind === "collection" ? "Koleksiyonlar" : "Etiketler"}</span><select multiple name={`resource-${resourceKind}`} defaultValue={resourceKind === "collection" ? editor.resourceIds.collections : editor.resourceIds.tags}>{activeResources(resourceKind).map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>)}<label><span>Tedarikçi</span><input name="supplierName" maxLength={200} defaultValue={editor.profile.supplierName ?? ""} /></label></div></ProductEditorSection>
        <ProductEditorSection title="Kargo ve gümrük" description="Fiziksel ürün ölçü ve HS bilgileri"><div className="onboarding-editor-grid"><label><span>Minimum sipariş</span><input name="minimumPurchaseQuantity" inputMode="numeric" defaultValue={editor.profile.minimumPurchaseQuantity} /></label><label><span>Maksimum sipariş</span><input name="maximumPurchaseQuantity" inputMode="numeric" defaultValue={editor.profile.maximumPurchaseQuantity ?? ""} /></label><label><span>Google ürün kategori kimliği</span><input name="googleProductCategoryId" inputMode="numeric" maxLength={20} defaultValue={editor.profile.googleProductCategoryId ?? ""} /></label></div></ProductEditorSection>
        <ProductEditorSection title="SEO" description="Arama sonucu başlığı ve açıklaması"><div className="onboarding-editor-grid"><label className="onboarding-wide"><span>SEO başlığı</span><input name="seoTitle" maxLength={200} defaultValue={editor.profile.seoTitle ?? ""} /></label><label className="onboarding-wide"><span>SEO açıklaması</span><textarea name="seoDescription" maxLength={500} rows={4} defaultValue={editor.profile.seoDescription ?? ""} /></label></div></ProductEditorSection>
        <ProductEditorSection title="Satış kanalları" description="Yalnız doğrulanmış etkin kanallar"><div className={styles.optionList}>{options.channels.length ? options.channels.map((channel) => <label key={channel.id}><input type="checkbox" name="channelIds" value={channel.id} defaultChecked={has(editor.channelIds, channel.id)} /><span>{channel.name}<small>{channel.kind === "storefront" ? "Online mağaza" : "Pazar yeri"}</small></span></label>) : <p>Etkin satış kanalı bulunamadı.</p>}</div></ProductEditorSection>
        <ProductEditorSection title="Nitelikler ve ekstralar" description="Mağazadaki ürün seçenekleri"><div className={styles.optionList}>{(["attribute", "extra", "definition"] as const).flatMap((resourceKind) => activeResources(resourceKind).map((resource) => <label key={resource.id}><input type="checkbox" name={`resource-${resourceKind}`} value={resource.id} defaultChecked={has(editor.resourceIds[`${resourceKind}s` as "attributes" | "extras" | "definitions"] ?? [], resource.id)} /><span>{resource.name}<small>{resourceKind}</small></span></label>))}</div></ProductEditorSection>
      </div>
      <aside className={styles.stickySummary} aria-label="Ürün hazırlık özeti"><span>ÜRÜN ÖZETİ</span><strong>{kind === "simple" ? "Basit ürün" : "Varyantlı ürün"}</strong><dl><div><dt>Varyant</dt><dd>{summary.variantCount}</dd></div><div><dt>Geçerli fiyat</dt><dd>{summary.validPrices}/{summary.variantCount}</dd></div><div><dt>Medya</dt><dd>{editor.mediaCount}</dd></div><div><dt>Kanal</dt><dd>{options.channels.length} kullanılabilir</dd></div></dl><p>Kalıcı profil v{editor.profile.version}</p></aside>
    </div>
    <footer className={styles.editorActions}><button type="button" className={styles.secondary} onClick={requestCancel} disabled={busy}>Vazgeç</button><button type="submit" className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : "Satış ayarlarını kaydet"}</button></footer>
  </form>;
}
