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
import { AttributeVariantPicker } from "./AttributeVariantPicker";
import { ProductEditorSection } from "./ProductEditorSection";
import { emptyVariant, ProductVariantBuilder, type VariantDraft } from "./ProductVariantBuilder";
import styles from "./product-onboarding.module.css";

type EditorApi = Pick<typeof catalogOnboardingClient, "createProduct" | "publishAfterMedia" | "updateMerchandising" | "getProductEditor">;

type ProductAdvancedEditorProps = Readonly<{
  options: CatalogOnboardingOptions;
  onCancel(): void;
  /** Inline product detail rail. The default editor presentation is unchanged. */
  presentation?: "default" | "rail";
  api?: EditorApi;
  mediaClient?: Pick<typeof productMediaApi, "upload">;
  editor?: CatalogProductEditorProjection;
  onCreated?(result: CatalogOnboardingResult): void;
  onUpdated?(result: CatalogOnboardingResult): void;
  onConflictReload?(): boolean | void | Promise<boolean | void>;
  onDirtyChange?(dirty: boolean): void;
  onBusyChange?(busy: boolean): void;
  onSeoPreviewChange?(preview: Readonly<{ title: string; description: string }>): void;
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

export function ProductAdvancedEditor({ options, onCancel, presentation = "default", api = catalogOnboardingClient, mediaClient = productMediaApi, editor, onCreated, onUpdated, onConflictReload, onDirtyChange, onBusyChange, onSeoPreviewChange, draftSession, onDraftSessionChange }: ProductAdvancedEditorProps) {
  const editing = editor !== undefined;
  const [kind, setKind] = useState<"simple" | "variant">(draftSession?.current.kind ?? ((editor?.variants.length ?? 1) > 1 ? "variant" : "simple"));
  const [productType, setProductType] = useState<"physical" | "digital">(draftSession?.current.productType ?? editor?.profile.productType ?? "physical");
  const [variants, setVariants] = useState<readonly VariantDraft[]>(() => draftSession?.current.variants ?? initialVariants(editor));
  const [selectedVariantAttributeIds, setSelectedVariantAttributeIds] = useState<readonly string[]>(draftSession?.current.resourceAttributeIds ?? []);
  const [titleValue, setTitleValue] = useState(draftSession?.current.title ?? editor?.product.title ?? "");
  const [descriptionValue, setDescriptionValue] = useState(draftSession?.current.description ?? editor?.product.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [media, setMedia] = useState<readonly EditorMediaSelection[]>(draftSession?.current.media ?? []);
  const [categoryIds, setCategoryIds] = useState<readonly string[]>(draftSession?.current.categoryIds ?? editor?.categoryIds ?? []);
  const [collectionIds, setCollectionIds] = useState<readonly string[]>(draftSession?.current.collectionIds ?? editor?.resourceIds.collections ?? []);
  const [tagIds, setTagIds] = useState<readonly string[]>(draftSession?.current.tagIds ?? editor?.resourceIds.tags ?? []);
  const [selectedChannelIds, setSelectedChannelIds] = useState<readonly string[]>(() => draftSession?.current.channelIds ?? initialChannelIds(options, editor));
  const [activeEditPanel, setActiveEditPanel] = useState<"catalog" | "seo" | "channels">("catalog");
  const [railDirty, setRailDirty] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [createdProductId, setCreatedProductId] = useState<string>();
  const [progress, setProgress] = useState(0);
  const lock = useRef(false);
  const simpleVariantRef = useRef<VariantDraft>(variants[0] ?? emptyVariant());
  const editingDirtyRef = useRef(false);
  const createTouchedRef = useRef(false);
  const [createFieldRevision, setCreateFieldRevision] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const railAdvancedRef = useRef<HTMLDetailsElement>(null);
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
      ...(categoryIds.length ? [] : [Object.freeze({ href: "#product-basics", label: "Satışa açmak için kategori seçin." })]),
      ...(variants.length ? [] : [Object.freeze({ href: "#product-commerce", label: "En az bir varyant ekleyin." })]),
      ...(validPrices === variants.length ? [] : [Object.freeze({ href: "#product-commerce", label: kind === "simple" ? "Satış fiyatını tamamlayın." : "Varyant fiyatlarını tamamlayın." })]),
      ...(validPrices < variants.length || validVariants === variants.length ? [] : [Object.freeze({ href: "#product-commerce", label: "Varyant stok ve zorunlu alanlarını kontrol edin." })]),
    ];
    const firstPrice = variants[0] && parseTurkishMoneyToCents(variants[0].price) !== null ? `${variants[0].price} ₺` : "Eksik";
    return Object.freeze({ variantCount: variants.length, validPrices, validVariants, firstPrice, missing: Object.freeze(missing) });
  }, [categoryIds, kind, productType, titleValue, variants]);

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
    if (draftSession === undefined || onDraftSessionChange === undefined || editing || !createTouchedRef.current || formRef.current === null) return;
    const data = new FormData(formRef.current);
    onDraftSessionChange(updateProductDraft(draftSession, {
      kind,
      productType,
      title: titleValue,
      description: descriptionValue,
      variants,
      categoryIds,
      brandId: text(data, "resource-brand"),
      collectionIds,
      tagIds,
      supplierName: text(data, "supplierName"),
      minimumOrderQuantity: text(data, "minimumPurchaseQuantity"),
      maximumOrderQuantity: text(data, "maximumPurchaseQuantity"),
      googleProductCategoryId: text(data, "googleProductCategoryId"),
      seoTitle: text(data, "seoTitle"),
      seoDescription: text(data, "seoDescription"),
      channelIds: selectedChannelIds,
      resourceAttributeIds: Object.freeze([...new Set([...selected(data, "resource-attribute"), ...selectedVariantAttributeIds])]),
      resourceExtraIds: selected(data, "resource-extra"),
      resourceDefinitionIds: selected(data, "resource-definition"),
      media,
    }));
  // Parent session updates are projections of these local fields.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, productType, titleValue, descriptionValue, variants, categoryIds, collectionIds, tagIds, selectedChannelIds, selectedVariantAttributeIds, media, editing, onDraftSessionChange, createFieldRevision]);

  function markEditingDirty() {
    if (editing) {
      editingDirtyRef.current = true;
      if (presentation === "rail") setRailDirty(true);
      onDirtyChange?.(true);
      return;
    }
    createTouchedRef.current = true;
    setCreateFieldRevision((current) => current + 1);
  }

  function updateSeoPreview(form: HTMLFormElement | null) {
    if (!form) return;
    const values = new FormData(form);
    onSeoPreviewChange?.({ title: text(values, "seoTitle"), description: text(values, "seoDescription") });
  }

  function requestCancel() {
    if (editing) {
      const guard = createDirtyNavigationGuard({
        isDirty: () => editingDirtyRef.current,
        confirm: () => window.confirm("Kaydedilmemiş satış ayarı değişiklikleriniz var. Düzenleyiciyi kapatmak istiyor musunuz?"),
      });
      if (!guard.canLeave()) return;
      editingDirtyRef.current = false;
      setRailDirty(false);
      onDirtyChange?.(false);
    }
    onCancel();
  }

  async function reloadConflict() {
    const reloaded = await onConflictReload?.();
    if (reloaded === false) return;
    editingDirtyRef.current = false;
    setRailDirty(false);
    onDirtyChange?.(false);
  }

  function switchKind(next: "simple" | "variant") {
    if (editing || next === kind) return;
    if (next === "simple" && variants.length && !window.confirm("Seçili varyantları kaldırıp basit ürüne dönmek istiyor musunuz?")) return;
    markEditingDirty();
    setKind(next);
    if (next === "variant") {
      simpleVariantRef.current = variants[0] ?? emptyVariant();
      setVariants([]);
    } else {
      setVariants([simpleVariantRef.current]);
      setSelectedVariantAttributeIds([]);
    }
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
    const publish = (event.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement && (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "publish";
    const parsedCreateVariants = editing ? [] : variants.map((variant) => variantIntent(variant, productType));
    if (!editing) {
      setShowValidation(true);
      if (!titleValue.trim() || (publish && categoryIds.length === 0) || parsedCreateVariants.length === 0 || parsedCreateVariants.some((variant) => variant === null)) {
        setError("Zorunlu ürün ve satış alanlarını kontrol edin.");
        if (!titleValue.trim()) titleRef.current?.focus();
        else if (publish && categoryIds.length === 0) document.querySelector<HTMLElement>("#product-basics")?.scrollIntoView({ behavior: "smooth", block: "start" });
        else document.querySelector<HTMLElement>("#product-commerce")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    const minimum = positiveInteger(text(data, "minimumPurchaseQuantity"), 1);
    const maximumRaw = text(data, "maximumPurchaseQuantity");
    const maximum = maximumRaw ? positiveInteger(maximumRaw) : undefined;
    if (minimum === null || maximum === null) {
      if (presentation === "rail" && railAdvancedRef.current) railAdvancedRef.current.open = true;
      setError("Satış sınırı alanlarını kontrol edin.");
      return;
    }
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
    const resourceIds: CatalogOnboardingResourceIds = { ...(brand ? { brand } : {}), collections: resources("collection"), tags: resources("tag"), attributes: Object.freeze([...new Set([...resources("attribute"), ...selectedVariantAttributeIds])]), extras: resources("extra"), definitions: resources("definition") };
    const submittedCategoryIds = selected(data, "categoryIds");
    const channelIds = selected(data, "channelIds");

    lock.current = true; setBusy(true); onBusyChange?.(true); setError(""); setConflict(false);
    try {
      if (editor) {
        const updated = await api.updateMerchandising(editor.product.id, { expectedProfileVersion: editor.profile.version, profile, categoryIds: submittedCategoryIds, resourceIds, channelIds });
        editingDirtyRef.current = false;
        setRailDirty(false);
        onDirtyChange?.(false);
        onUpdated?.(updated);
        return;
      }
      const candidate: CatalogAdvancedCreateIntent = {
        kind: "advanced", productType, title: text(data, "title"), ...(text(data, "description") ? { description: text(data, "description") } : {}), publish,
        variants: parsedCreateVariants as readonly CatalogOnboardingVariantIntent[], categoryIds: submittedCategoryIds, resourceIds, channelIds, profile,
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
    } finally { lock.current = false; setBusy(false); onBusyChange?.(false); }
  }

  const has = (ids: readonly string[], id: string) => ids.includes(id);
  const categoryChoices = categoryRows.map(({ category, label }) => Object.freeze({ id: category.id, label }));
  const collectionChoices = activeResources("collection").map((resource) => Object.freeze({ id: resource.id, label: resource.name }));
  const tagChoices = activeResources("tag").map((resource) => Object.freeze({ id: resource.id, label: resource.name }));

  if (editor === undefined) return <form ref={formRef} className={`${styles.advancedEditor} ${styles.createWorkspace}`} onSubmit={submit} onChange={markEditingDirty} aria-busy={busy} noValidate>
    {error ? <div className={styles.error} role="alert"><span>{error}</span>{conflict ? <button type="button" className={styles.secondary} onClick={reloadConflict}>Sunucudaki sürümü yükle</button> : null}{createdProductId ? <Link className={styles.secondary} href={`/products/${createdProductId}`}>Ürüne git</Link> : null}</div> : null}
    {!categoryHierarchy.valid ? <div className={styles.error} role="alert">Kategori seçenekleri şu anda kullanılamıyor.</div> : null}
    <fieldset className={styles.editorFieldset} disabled={busy}>
    <div className={styles.editorLayout}>
      <div className={styles.sections}>
        <ProductEditorSection id="product-basics" title="Temel bilgiler ve kategori" description="Ürün adı, kategori ve açıklama" open><div className="onboarding-editor-grid"><label className="onboarding-wide onboarding-title-field"><span>Ürün adı *</span><input ref={titleRef} name="title" required maxLength={200} autoFocus value={titleValue} onChange={(event) => setTitleValue(event.target.value)} aria-invalid={showValidation && !titleValue.trim()} />{showValidation && !titleValue.trim() ? <small className={styles.fieldError}>Ürün adı gerekli.</small> : null}</label><ProductClassificationPicker label="Kategoriler (satışa açmak için seçin)" name="categoryIds" options={categoryChoices} selected={categoryIds} onChange={(next) => { markEditingDirty(); setCategoryIds(next); }} searchLabel="Kategori ara" /><label><span>Ürün türü</span><select value={productType} onChange={(event) => setProductType(event.target.value as "physical" | "digital")}><option value="physical">Fiziksel ürün</option><option value="digital">Dijital ürün</option></select></label><ProductDescriptionField className="onboarding-wide" rows={4} previewCollapsed readOnly={busy} defaultValue={descriptionValue} onValueChange={(next) => { setDescriptionValue(next); markEditingDirty(); }} /></div></ProductEditorSection>
        <ProductEditorSection id="product-commerce" title="Fiyat ve varyantlar" description={kind === "simple" ? "Tek fiyat ve stok" : `${variants.length} satış varyantı`} open>
          <div className={styles.productKind} aria-label="Ürün yapısı">
            <button type="button" aria-pressed={kind === "simple"} className={kind === "simple" ? styles.selected : ""} onClick={() => switchKind("simple")}><span className={styles.kindIcon}><Package aria-hidden="true" /></span><span><strong>Basit ürün</strong><small>Tek fiyat ve stok</small></span>{kind === "simple" ? <Check className={styles.kindCheck} aria-hidden="true" /> : null}</button>
            <button type="button" aria-pressed={kind === "variant"} className={kind === "variant" ? styles.selected : ""} onClick={() => switchKind("variant")}><span className={styles.kindIcon}><Boxes aria-hidden="true" /></span><span><strong>Varyantlı ürün</strong><small>Renk, beden veya diğer seçenekler</small></span>{kind === "variant" ? <Check className={styles.kindCheck} aria-hidden="true" /> : null}</button>
          </div>
          {showValidation && summary.validVariants < variants.length ? <p className={styles.inlineValidation}>Fiyat, stok ve zorunlu varyant alanlarını kontrol edin.</p> : null}
          {kind === "variant" ? <AttributeVariantPicker value={variants.filter((variant) => Object.keys(variant.attributes).length > 0)} onChange={(next) => { markEditingDirty(); setVariants(Object.freeze(next)); }} onAttributeIdsChange={setSelectedVariantAttributeIds} initialPrice={simpleVariantRef.current.price} initialStock={simpleVariantRef.current.stockQuantity} disabled={busy} /> : null}
          <ProductVariantBuilder variants={variants} onChange={(next) => { markEditingDirty(); setVariants(next); }} allowMultiple={kind === "variant"} allowManualAdd={kind !== "variant"} simplified showShipping={productType === "physical"} skuPrefix={options.skuPrefix} />
        </ProductEditorSection>
        <ProductEditorSection id="product-media" title="Görseller" description={media.length ? `${media.length} görsel seçildi` : "Ürün görselleri ve açıklamaları"}>
          <div className={styles.advancedMedia}>
            <label className={`${styles.media} ${styles.createMediaPicker}`}><ImagePlus aria-hidden="true" /><span>{media.length ? "Görselleri değiştir" : "+ Görsel ekle"}<small>JPEG, PNG veya WebP · en fazla 16 görsel · dosya başına 5 MB</small></span><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={selectMedia} /></label>
            {media.length ? <div className={styles.createMediaGrid}>{media.map((selected, index) => <article key={`${selected.file.name}-${index}`}><div className={styles.createMediaThumbnail}><img src={selected.preview} alt={`${index + 1}. yüklenecek ürün görseli önizlemesi`} />{index === 0 ? <span>Birincil</span> : null}</div><label><span>Alt metin</span><input value={selected.altText} maxLength={500} onChange={(event) => changeMediaAlt(index, event.target.value)} placeholder="Görseli kısaca açıklayın" /></label></article>)}</div> : null}
            {busy && media.length ? <progress max="100" value={progress}>{progress}%</progress> : null}
          </div>
        </ProductEditorSection>
        <ProductEditorSection id="product-organization" title="Diğer ayarlar" description="Marka, koleksiyon, etiket ve tedarikçi">
          <div className={styles.organizationGrid}>
            <label><span>Marka</span><select name="resource-brand" defaultValue={draftSession?.current.brandId ?? ""}><option value="">Marka seçilmedi</option>{activeResources("brand").map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>
            <ProductClassificationPicker label="Koleksiyonlar" name="resource-collection" options={collectionChoices} selected={collectionIds} onChange={(next) => { markEditingDirty(); setCollectionIds(next); }} searchLabel="Koleksiyon ara" />
            <ProductClassificationPicker label="Etiketler" name="resource-tag" options={tagChoices} selected={tagIds} onChange={(next) => { markEditingDirty(); setTagIds(next); }} searchLabel="Etiket ara" />
            <label><span>Tedarikçi</span><input name="supplierName" maxLength={200} defaultValue={draftSession?.current.supplierName ?? ""} /></label>
          </div>
        </ProductEditorSection>
        <ProductEditorSection id="product-advanced" title="Ek satış ayarları" description="SEO, kanallar ve diğer ayrıntılar">
          <div className={styles.advancedGroups}>
            <details><summary>Kargo ve sipariş sınırları</summary><div className="onboarding-editor-grid"><label><span>Minimum sipariş</span><input name="minimumPurchaseQuantity" inputMode="numeric" defaultValue={draftSession?.current.minimumOrderQuantity || "1"} /></label><label><span>Maksimum sipariş</span><input name="maximumPurchaseQuantity" inputMode="numeric" defaultValue={draftSession?.current.maximumOrderQuantity ?? ""} /></label><label><span>Google ürün kategori kimliği</span><input name="googleProductCategoryId" inputMode="numeric" maxLength={20} defaultValue={draftSession?.current.googleProductCategoryId ?? ""} /></label></div></details>
            <details><summary>SEO</summary><div className="onboarding-editor-grid"><label className="onboarding-wide"><span>SEO başlığı</span><input name="seoTitle" maxLength={200} defaultValue={draftSession?.current.seoTitle ?? ""} /></label><label className="onboarding-wide"><span>SEO açıklaması</span><textarea name="seoDescription" maxLength={500} rows={4} defaultValue={draftSession?.current.seoDescription ?? ""} /></label></div></details>
            <details><summary>Satış kanalları</summary><div className={styles.optionList}>{options.channels.length ? options.channels.map((channel) => <label key={channel.id}><input type="checkbox" name="channelIds" value={channel.id} checked={selectedChannelIds.includes(channel.id)} onChange={(event) => setSelectedChannelIds((current) => event.target.checked ? Object.freeze([...current, channel.id]) : Object.freeze(current.filter((id) => id !== channel.id)))} /><span>{channel.name}<small>{channel.kind === "storefront" ? "Online mağaza" : "Pazar yeri"}</small></span></label>) : <p>Etkin satış kanalı bulunamadı.</p>}</div></details>
            <details><summary>Nitelikler ve ekstralar</summary><div className={styles.optionList}>{(["attribute", "extra", "definition"] as const).flatMap((resourceKind) => activeResources(resourceKind).map((resource) => <label key={resource.id}><input type="checkbox" name={`resource-${resourceKind}`} value={resource.id} defaultChecked={has(draftSession?.current[`resource${resourceKind[0].toUpperCase()}${resourceKind.slice(1)}Ids` as "resourceAttributeIds" | "resourceExtraIds" | "resourceDefinitionIds"] ?? [], resource.id)} /><span>{resource.name}<small>{resourceKind}</small></span></label>))}</div></details>
          </div>
        </ProductEditorSection>
      </div>
      <aside className={styles.stickySummary} aria-label="Ürün hazırlık özeti"><span>ÜRÜN ÖZETİ</span><strong>{kind === "simple" ? "Basit ürün" : "Varyantlı ürün"}</strong><dl><div><dt>Varyant</dt><dd>{summary.variantCount}</dd></div><div><dt>Geçerli fiyat</dt><dd>{kind === "simple" ? summary.firstPrice : `${summary.validPrices}/${summary.variantCount} tamam`}</dd></div><div><dt>Medya</dt><dd>{media.length}</dd></div><div><dt>Satış kanalı</dt><dd>{selectedChannelIds.length}/{options.channels.length} seçili</dd></div></dl>{summary.missing.length ? <div className={styles.summaryMissing}><span>Tamamlanması gerekenler</span><ul>{summary.missing.map((item) => <li key={item.label}><a href={item.href}>{item.label}</a></li>)}</ul></div> : <p className={styles.summaryReady}><Check aria-hidden="true" /> Zorunlu alanlar tamam.</p>}</aside>
    </div>
    </fieldset>
    <footer className={styles.editorActions}><button type="button" className={styles.advanced} onClick={requestCancel} disabled={busy}>Vazgeç</button><button type="submit" name="intent" value="draft" className={styles.secondary} disabled={busy}>Taslak kaydet</button><button type="submit" name="intent" value="publish" className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet ve satışa aç"}</button></footer>
  </form>;

  if (presentation === "rail" && editor) return <form className={`${styles.advancedEditor} ${styles.editSettings} ${styles.railSettings}`} onSubmit={submit} onChange={(event) => {
    if (!(event.target instanceof HTMLElement) || !event.target.closest(`.${styles.classificationSearch}`)) markEditingDirty();
  }} aria-busy={busy} noValidate>
    <div className={styles.railHeading}><h2>Yayın ve sınıflandırma</h2></div>
    {error ? <div className={styles.error} role="alert"><span>{error}</span>{conflict ? <button type="button" className={styles.secondary} onClick={reloadConflict}>Sunucudaki sürümü yükle</button> : null}</div> : null}
    {!categoryHierarchy.valid ? <div className={styles.error} role="alert">Kategori seçenekleri şu anda kullanılamıyor.</div> : null}
    <fieldset className={styles.railFieldset} disabled={busy}>
      <section className={styles.railGroup} aria-labelledby="rail-channels-title">
        <h3 id="rail-channels-title">Satış kanalları</h3>
        <div className={`${styles.editOptionList} ${styles.railChannelList}`}>{options.channels.length ? options.channels.map((channel) => <label key={channel.id}>
          <input type="checkbox" name="channelIds" value={channel.id} defaultChecked={has(editor.channelIds, channel.id)} />
          <span>{channel.name}<small>{channel.kind === "storefront" ? "Online mağaza" : "Pazar yeri"}</small></span>
        </label>) : <p>Etkin satış kanalı bulunamadı.</p>}</div>
      </section>
      <section className={styles.railGroup} aria-labelledby="rail-classification-title">
        <h3 id="rail-classification-title">Sınıflandırma</h3>
        <div className={styles.railFields}>
          <ProductClassificationPicker label="Kategoriler" name="categoryIds" options={categoryChoices} selected={categoryIds} onChange={(next) => { markEditingDirty(); setCategoryIds(next); }} searchLabel="Kategori ara" />
          <label className={styles.editField}><span>Marka</span><select name="resource-brand" defaultValue={editor.resourceIds.brand ?? ""}><option value="">Marka seçilmedi</option>{activeResources("brand").map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>
          <ProductClassificationPicker label="Koleksiyonlar" name="resource-collection" options={collectionChoices} selected={collectionIds} onChange={(next) => { markEditingDirty(); setCollectionIds(next); }} searchLabel="Koleksiyon ara" />
          <ProductClassificationPicker label="Etiketler" name="resource-tag" options={tagChoices} selected={tagIds} onChange={(next) => { markEditingDirty(); setTagIds(next); }} searchLabel="Etiket ara" />
        </div>
      </section>
      <details ref={railAdvancedRef} className={styles.railAdvanced}>
        <summary>SEO ve gelişmiş alanlar</summary>
        <div className={styles.railAdvancedBody}>
          <label className={styles.editField}><span>SEO başlığı</span><input name="seoTitle" maxLength={200} defaultValue={editor.profile.seoTitle ?? ""} onChange={(event) => updateSeoPreview(event.currentTarget.form)} /></label>
          <label className={styles.editField}><span>SEO açıklaması</span><textarea name="seoDescription" maxLength={500} rows={3} defaultValue={editor.profile.seoDescription ?? ""} onChange={(event) => updateSeoPreview(event.currentTarget.form)} /></label>
          <label className={styles.editField}><span>Google ürün kategori kimliği</span><input name="googleProductCategoryId" inputMode="numeric" maxLength={20} defaultValue={editor.profile.googleProductCategoryId ?? ""} /></label>
          <label className={styles.editField}><span>Tedarikçi</span><input name="supplierName" maxLength={200} defaultValue={editor.profile.supplierName ?? ""} /></label>
          <label className={styles.editField}><span>Minimum sipariş</span><input name="minimumPurchaseQuantity" inputMode="numeric" defaultValue={editor.profile.minimumPurchaseQuantity} /></label>
          <label className={styles.editField}><span>Maksimum sipariş</span><input name="maximumPurchaseQuantity" inputMode="numeric" defaultValue={editor.profile.maximumPurchaseQuantity ?? ""} /></label>
          {(["attribute", "extra", "definition"] as const).map((resourceKind) => {
            const resources = activeResources(resourceKind);
            if (!resources.length) return null;
            const label = resourceKind === "attribute" ? "Nitelikler" : resourceKind === "extra" ? "Ekstralar" : "Tanımlar";
            return <div className={styles.railResourceGroup} key={resourceKind}><h4>{label}</h4><div className={`${styles.editOptionList} ${styles.railResourceList}`}>{resources.map((resource) => <label key={resource.id}><input type="checkbox" name={`resource-${resourceKind}`} value={resource.id} defaultChecked={has(editor.resourceIds[`${resourceKind}s` as "attributes" | "extras" | "definitions"] ?? [], resource.id)} /><span>{resource.name}</span></label>)}</div></div>;
          })}
        </div>
      </details>
    </fieldset>
    <footer className={`${styles.editorActions} ${styles.railActionBar}`} hidden={!railDirty}>
      <span>Kaydedilmemiş değişiklikler</span>
      <button type="button" className={styles.secondary} onClick={requestCancel} disabled={busy}>Vazgeç</button>
      <button type="submit" className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
    </footer>
  </form>;

  const editPanels = ["catalog", "seo", "channels"] as const;
  const editPanelNames = { catalog: "Katalog", seo: "SEO", channels: "Kanallar" } as const;

  return <form className={`${styles.advancedEditor} ${styles.editSettings}`} onSubmit={submit} onChange={(event) => {
    if (!(event.target instanceof HTMLElement) || !event.target.closest(`.${styles.classificationSearch}`)) markEditingDirty();
  }} aria-busy={busy} noValidate>
    {error ? <div className={styles.error} role="alert"><span>{error}</span>{conflict ? <button type="button" className={styles.secondary} onClick={reloadConflict}>Sunucudaki sürümü yükle</button> : null}{createdProductId ? <Link className={styles.secondary} href={`/products/${createdProductId}`}>Ürüne git</Link> : null}</div> : null}
    {!categoryHierarchy.valid ? <div className={styles.error} role="alert">Kategori seçenekleri şu anda kullanılamıyor.</div> : null}
    <div className={styles.editTabs} role="tablist" aria-label="Satış ayarı bölümleri" onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = editPanels.indexOf(activeEditPanel);
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? editPanels.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + editPanels.length) % editPanels.length;
      setActiveEditPanel(editPanels[nextIndex]);
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
    }}>
      {editPanels.map((panel) => <button key={panel} type="button" role="tab" id={`sales-tab-${panel}`} aria-controls={`sales-panel-${panel}`} aria-selected={activeEditPanel === panel} tabIndex={activeEditPanel === panel ? 0 : -1} className={activeEditPanel === panel ? styles.editTabActive : ""} onClick={() => setActiveEditPanel(panel)}>{editPanelNames[panel]}</button>)}
    </div>
    <fieldset className={styles.editFieldset} disabled={busy}>
      <section id="sales-panel-catalog" role="tabpanel" aria-labelledby="sales-tab-catalog" tabIndex={0} className={styles.editPanel} hidden={activeEditPanel !== "catalog"}>
        <div className={styles.editGroup}><h3>Kategori ve marka</h3><div className={styles.editFieldGrid}>
          <ProductClassificationPicker label="Kategoriler" name="categoryIds" options={categoryChoices} selected={categoryIds} onChange={(next) => { markEditingDirty(); setCategoryIds(next); }} searchLabel="Kategori ara" />
          <label className={styles.editField}><span>Marka</span><select name="resource-brand" defaultValue={editor.resourceIds.brand ?? ""}><option value="">Marka seçilmedi</option>{activeResources("brand").map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>
        </div></div>
        <div className={styles.editGroup}><h3>Ürün konumu</h3><div className={styles.editFieldGrid}>
          <ProductClassificationPicker label="Koleksiyonlar" name="resource-collection" options={collectionChoices} selected={collectionIds} onChange={(next) => { markEditingDirty(); setCollectionIds(next); }} searchLabel="Koleksiyon ara" />
          <ProductClassificationPicker label="Etiketler" name="resource-tag" options={tagChoices} selected={tagIds} onChange={(next) => { markEditingDirty(); setTagIds(next); }} searchLabel="Etiket ara" />
          <label className={`${styles.editField} ${styles.editFieldWide}`}><span>Tedarikçi</span><input name="supplierName" maxLength={200} defaultValue={editor.profile.supplierName ?? ""} /></label>
        </div></div>
      </section>
      <section id="sales-panel-seo" role="tabpanel" aria-labelledby="sales-tab-seo" tabIndex={0} className={styles.editPanel} hidden={activeEditPanel !== "seo"}>
        <div className={styles.editGroup}><h3>Arama görünümü</h3><div className={styles.editFieldGrid}>
          <label className={`${styles.editField} ${styles.editFieldWide}`}><span>SEO başlığı</span><input name="seoTitle" maxLength={200} defaultValue={editor.profile.seoTitle ?? ""} /></label>
          <label className={`${styles.editField} ${styles.editFieldWide}`}><span>SEO açıklaması</span><textarea name="seoDescription" maxLength={500} rows={4} defaultValue={editor.profile.seoDescription ?? ""} /></label>
          <label className={`${styles.editField} ${styles.editFieldWide}`}><span>Google ürün kategori kimliği</span><input name="googleProductCategoryId" inputMode="numeric" maxLength={20} defaultValue={editor.profile.googleProductCategoryId ?? ""} /></label>
        </div></div>
        <div className={styles.editGroup}><h3>Sipariş sınırları</h3><div className={styles.editFieldGrid}>
          <label className={styles.editField}><span>Minimum sipariş</span><input name="minimumPurchaseQuantity" inputMode="numeric" defaultValue={editor.profile.minimumPurchaseQuantity} /></label>
          <label className={styles.editField}><span>Maksimum sipariş</span><input name="maximumPurchaseQuantity" inputMode="numeric" defaultValue={editor.profile.maximumPurchaseQuantity ?? ""} /></label>
        </div></div>
      </section>
      <section id="sales-panel-channels" role="tabpanel" aria-labelledby="sales-tab-channels" tabIndex={0} className={styles.editPanel} hidden={activeEditPanel !== "channels"}>
        <div className={styles.editGroup}><h3>Satış kanalları</h3><div className={styles.editOptionList}>{options.channels.length ? options.channels.map((channel) => <label key={channel.id}><input type="checkbox" name="channelIds" value={channel.id} defaultChecked={has(editor.channelIds, channel.id)} /><span>{channel.name}<small>{channel.kind === "storefront" ? "Online mağaza" : "Pazar yeri"}</small></span></label>) : <p>Etkin satış kanalı bulunamadı.</p>}</div></div>
        {(["attribute", "extra", "definition"] as const).map((resourceKind) => {
          const resources = activeResources(resourceKind);
          if (!resources.length) return null;
          const label = resourceKind === "attribute" ? "Nitelikler" : resourceKind === "extra" ? "Ekstralar" : "Tanımlar";
          return <div className={styles.editGroup} key={resourceKind}><h3>{label}</h3><div className={styles.editOptionList}>{resources.map((resource) => <label key={resource.id}><input type="checkbox" name={`resource-${resourceKind}`} value={resource.id} defaultChecked={has(editor.resourceIds[`${resourceKind}s` as "attributes" | "extras" | "definitions"] ?? [], resource.id)} /><span>{resource.name}</span></label>)}</div></div>;
        })}
      </section>
    </fieldset>
    <footer className={`${styles.editorActions} ${styles.editActionBar}`}><button type="button" className={styles.secondary} onClick={requestCancel} disabled={busy}>Vazgeç</button><button type="submit" className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : "Satış ayarlarını kaydet"}</button></footer>
  </form>;
}
