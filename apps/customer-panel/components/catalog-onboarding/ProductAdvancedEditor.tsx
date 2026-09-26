"use client";

import Link from "next/link";
import { ChevronDown, ImagePlus, Plus, Store, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
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
import { variantAttributeKey } from "@/lib/catalog-onboarding-ui/attribute-variants";
import { ProductDescriptionField } from "@/components/catalog/ProductDescriptionField";
import { ProductClassificationPicker } from "./ProductClassificationPicker";
import { AttributeVariantPicker } from "./AttributeVariantPicker";
import { emptyVariant, ProductVariantBuilder, type VariantDraft } from "./ProductVariantBuilder";
import styles from "./product-onboarding.module.css";
import createStyles from "./create-advanced.module.css";

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
  const [selectedChannelIds, setSelectedChannelIds] = useState<readonly string[]>(() => draftSession?.current.channelSelectionTouched || draftSession?.current.channelIds.length ? draftSession.current.channelIds : initialChannelIds(options, editor));
  const [channelSelectionTouched, setChannelSelectionTouched] = useState(draftSession?.current.channelSelectionTouched ?? false);
  const [activeEditPanel, setActiveEditPanel] = useState<"catalog" | "seo" | "channels">("catalog");
  const [railDirty, setRailDirty] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [createdProductId, setCreatedProductId] = useState<string>();
  const [progress, setProgress] = useState(0);
  const [variantBuilderOpen, setVariantBuilderOpen] = useState(false);
  const [pendingVariants, setPendingVariants] = useState<readonly VariantDraft[]>([]);
  const [pendingAttributeIds, setPendingAttributeIds] = useState<readonly string[]>([]);
  const [attributeSaving, setAttributeSaving] = useState(false);
  const [pendingBarcodeCount, setPendingBarcodeCount] = useState(0);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const lock = useRef(false);
  const simpleVariantRef = useRef<VariantDraft>(draftSession?.current.standardVariant ?? (kind === "simple" ? variants[0] : undefined) ?? emptyVariant());
  const pendingVariantSnapshotRef = useRef(new Map<string, VariantDraft>());
  const pendingBarcodeCountRef = useRef(0);
  const attributeSavingRef = useRef(false);
  const variantAddRef = useRef<HTMLButtonElement>(null);
  const variantBuilderRef = useRef<HTMLDivElement>(null);
  const returnVariantFocusRef = useRef(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const salesLimitsRef = useRef<HTMLDetailsElement>(null);
  const categoryRailRef = useRef<HTMLElement>(null);
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
  const createPending = pendingBarcodeCount > 0 || attributeSaving;
  const createBlocked = busy || createPending;
  const validVariantCount = variants.filter((variant) => variantIntent(variant, productType) !== null).length;

  useEffect(() => { if (!editing) onBusyChange?.(busy || createPending); }, [busy, createPending, editing, onBusyChange]);
  useEffect(() => {
    if (variantBuilderOpen) variantBuilderRef.current?.focus();
    else if (returnVariantFocusRef.current) { returnVariantFocusRef.current = false; variantAddRef.current?.focus(); }
  }, [variantBuilderOpen]);

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
      standardVariant: kind === "variant" ? simpleVariantRef.current : undefined,
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
      channelSelectionTouched,
      resourceAttributeIds: Object.freeze([...new Set([...selected(data, "resource-attribute"), ...selectedVariantAttributeIds])]),
      resourceExtraIds: selected(data, "resource-extra"),
      resourceDefinitionIds: selected(data, "resource-definition"),
      media,
    }));
  // Parent session updates are projections of these local fields.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, productType, titleValue, descriptionValue, variants, categoryIds, collectionIds, tagIds, selectedChannelIds, channelSelectionTouched, selectedVariantAttributeIds, media, editing, onDraftSessionChange, createFieldRevision]);

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
    if (!editing && (lock.current || pendingBarcodeCountRef.current > 0 || attributeSavingRef.current)) return;
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

  function changeCreateVariants(next: readonly VariantDraft[]) {
    markEditingDirty();
    if (!next.length) {
      setKind("simple");
      setVariants([simpleVariantRef.current]);
      setSelectedVariantAttributeIds([]);
    } else setVariants(next);
  }

  function openVariantBuilder() {
    const current = kind === "variant" ? variants : [];
    pendingVariantSnapshotRef.current = new Map(current.map((variant) => [variantAttributeKey(variant.attributes), variant]));
    setPendingVariants(current);
    setPendingAttributeIds(selectedVariantAttributeIds);
    setVariantBuilderOpen(true);
  }

  function changePendingVariants(next: readonly VariantDraft[]) {
    const previousKeys = new Set(pendingVariants.map((variant) => variantAttributeKey(variant.attributes)));
    for (const variant of pendingVariants) pendingVariantSnapshotRef.current.set(variantAttributeKey(variant.attributes), variant);
    setPendingVariants(Object.freeze(next.map((variant) => {
      const key = variantAttributeKey(variant.attributes);
      return !previousKeys.has(key) ? pendingVariantSnapshotRef.current.get(key) ?? variant : variant;
    })));
  }

  function closeVariantBuilder() {
    if (attributeSavingRef.current) return;
    returnVariantFocusRef.current = true;
    setVariantBuilderOpen(false);
  }

  function applyPendingVariants() {
    if (!pendingVariants.length || attributeSavingRef.current) return;
    const nextKeys = new Set(pendingVariants.map((variant) => variantAttributeKey(variant.attributes)));
    const removedCount = kind === "variant" ? variants.filter((variant) => !nextKeys.has(variantAttributeKey(variant.attributes))).length : 0;
    if (removedCount && !window.confirm(`${removedCount} varyant ve girilmiş satış bilgileri kaldırılacak. Devam edilsin mi?`)) return;
    if (kind === "simple") simpleVariantRef.current = variants[0] ?? emptyVariant();
    const standard = simpleVariantRef.current;
    const currentKeys = new Set(kind === "variant" ? variants.map((variant) => variantAttributeKey(variant.attributes)) : []);
    const nextVariants = Object.freeze(pendingVariants.map((variant) => currentKeys.has(variantAttributeKey(variant.attributes)) ? variant : Object.freeze({
      ...variant,
      compareAt: standard.compareAt,
      cost: standard.cost,
      shippingDesi: standard.shippingDesi,
      hsCode: standard.hsCode,
      continueSellingWhenOutOfStock: standard.continueSellingWhenOutOfStock,
      // SKU and barcode identify one sale option; each new combination starts blank.
    })));
    markEditingDirty();
    setKind("variant");
    setVariants(nextVariants);
    setSelectedVariantAttributeIds(pendingAttributeIds);
    closeVariantBuilder();
  }

  function trackBarcodeBusy(pending: boolean) {
    pendingBarcodeCountRef.current = Math.max(0, pendingBarcodeCountRef.current + (pending ? 1 : -1));
    setPendingBarcodeCount(pendingBarcodeCountRef.current);
  }

  function trackAttributeBusy(pending: boolean) {
    attributeSavingRef.current = pending;
    setAttributeSaving(pending);
  }

  function selectMedia(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    if (media.length + files.length > 16 || files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > 5_242_880)) {
      event.currentTarget.value = "";
      setError("En fazla 16 adet PNG, JPEG veya WebP görsel seçin; her dosya en fazla 5 MB olabilir.");
      return;
    }
    event.currentTarget.value = "";
    if (!files.length) return;
    markEditingDirty();
    setError("");
    const next = Object.freeze([...media, ...files.map((file) => Object.freeze({ file, altText: "", preview: URL.createObjectURL(file) }))]);
    mediaPreviewUrlsRef.current = Object.freeze(next.map(({ preview }) => preview));
    setMedia(next);
  }

  function changeMediaAlt(index: number, altText: string) {
    markEditingDirty();
    setMedia((current) => Object.freeze(current.map((selected, position) => position === index ? Object.freeze({ ...selected, altText }) : selected)));
  }

  function removeMedia(index: number) {
    const removed = media[index];
    if (!removed) return;
    if (onDraftSessionChange === undefined) URL.revokeObjectURL(removed.preview);
    const next = Object.freeze(media.filter((_, position) => position !== index));
    mediaPreviewUrlsRef.current = next.map(({ preview }) => preview);
    markEditingDirty();
    setMedia(next);
    setActiveMediaIndex(Math.max(0, Math.min(index, next.length - 1)));
  }

  function setCover(index: number) {
    const selected = media[index];
    if (!selected || index === 0) return;
    markEditingDirty();
    setMedia(Object.freeze([selected, ...media.filter((_, position) => position !== index)]));
    setActiveMediaIndex(0);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || (!editing && (pendingBarcodeCountRef.current > 0 || attributeSavingRef.current))) return;
    if (!editing && variantBuilderOpen) { setError("Varyant seçimlerini ekleyin veya kapatın."); return; }
    if (!categoryHierarchy.valid) { setError("Kategori seçenekleri şu anda kullanılamıyor."); return; }
    const data = new FormData(event.currentTarget);
    const publish = (event.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement && (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "publish";
    const parsedCreateVariants = editing ? [] : variants.map((variant) => variantIntent(variant, productType));
    if (!editing) {
      setShowValidation(true);
      if (!titleValue.trim() || (publish && categoryIds.length === 0) || parsedCreateVariants.length === 0 || parsedCreateVariants.some((variant) => variant === null)) {
        setError("Zorunlu ürün ve satış alanlarını kontrol edin.");
        if (!titleValue.trim()) titleRef.current?.focus();
        else if (publish && categoryIds.length === 0) { categoryRailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); categoryRailRef.current?.querySelector<HTMLElement>("summary")?.focus(); }
        else document.querySelector<HTMLElement>("#product-commerce")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    const minimum = positiveInteger(text(data, "minimumPurchaseQuantity"), 1);
    const maximumRaw = text(data, "maximumPurchaseQuantity");
    const maximum = maximumRaw ? positiveInteger(maximumRaw) : undefined;
    if (minimum === null || maximum === null) {
      if (presentation === "rail" && railAdvancedRef.current) railAdvancedRef.current.open = true;
      if (!editing && salesLimitsRef.current) { salesLimitsRef.current.open = true; salesLimitsRef.current.querySelector<HTMLInputElement>("input")?.focus(); }
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

  if (editor === undefined) return <form ref={formRef} className={createStyles.root} onSubmit={submit} onChange={(event) => {
    if (!(event.target instanceof HTMLElement) || !event.target.closest(`.${styles.classificationSearch}`)) markEditingDirty();
  }} aria-busy={createBlocked} noValidate>
    {error ? <div className={createStyles.error} role="alert"><span>{error}</span>{createdProductId ? <Link className={createStyles.secondary} href={`/products/${createdProductId}`}>Ürüne git</Link> : null}</div> : null}
    {!categoryHierarchy.valid ? <div className={createStyles.error} role="alert">Kategori seçenekleri şu anda kullanılamıyor.</div> : null}
    <fieldset className={createStyles.editorFieldset} disabled={busy}>
      <div className={createStyles.editorLayout}>
        <div className={createStyles.mainColumn}>
          <section id="product-basics" className={createStyles.intro} aria-label="Ürün bilgileri">
            <div className={createStyles.mediaColumn}>
              <input ref={mediaInputRef} className={createStyles.fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="Ürün görsellerini seç" onChange={selectMedia} />
              <button className={createStyles.cover} type="button" onClick={() => mediaInputRef.current?.click()} aria-label={media.length ? "Ürün görseli ekle" : "Ürün görsellerini seç"} disabled={media.length >= 16}>
                {media[activeMediaIndex] ? <><img src={media[activeMediaIndex].preview} alt={media[activeMediaIndex].altText || `${activeMediaIndex + 1}. ürün görseli`} /><span className={createStyles.coverTag}>{activeMediaIndex === 0 ? "Kapak" : `${activeMediaIndex + 1}. görsel`}</span></> : <span className={createStyles.emptyPhoto}><ImagePlus aria-hidden="true" /><span>Görsel ekle</span></span>}
              </button>
              <div className={createStyles.mediaFoot}><span>{media.length}/16 görsel</span>{media.length ? <button className={createStyles.iconButton} type="button" onClick={() => removeMedia(activeMediaIndex)} aria-label="Seçili görseli kaldır"><Trash2 aria-hidden="true" /></button> : null}</div>
              {media.length > 1 ? <div className={createStyles.thumbnails} aria-label="Seçili görseller">{media.map((selected, index) => <button key={selected.preview} type="button" aria-label={`${index + 1}. görseli seç`} aria-pressed={activeMediaIndex === index} onClick={() => setActiveMediaIndex(index)}><img src={selected.preview} alt="" /></button>)}</div> : null}
              <button className={createStyles.upload} type="button" onClick={() => mediaInputRef.current?.click()} disabled={media.length >= 16}><Plus aria-hidden="true" />Görsel ekle</button>
              <small className={createStyles.mediaHint}>JPG, PNG, WebP · en fazla 5 MB</small>
              {media[activeMediaIndex] ? <details className={createStyles.mediaDetails}><summary>Görsel bilgileri<ChevronDown aria-hidden="true" /></summary><div className={createStyles.detailsBody}><label className={createStyles.field}><span>Alt metin</span><input value={media[activeMediaIndex].altText} maxLength={500} onChange={(event) => changeMediaAlt(activeMediaIndex, event.target.value)} /></label>{activeMediaIndex > 0 ? <button className={createStyles.inlineAction} type="button" onClick={() => setCover(activeMediaIndex)}>Kapak yap</button> : null}</div></details> : null}
              {busy && media.length ? <progress className={createStyles.progress} max="100" value={progress} aria-label="Görsel yükleme ilerlemesi">{progress}%</progress> : null}
            </div>
            <div className={createStyles.coreFields}>
              <label className={createStyles.field}><span>Ürün adı <span aria-hidden="true">*</span></span><input className={createStyles.titleInput} ref={titleRef} name="title" required maxLength={200} autoFocus value={titleValue} onChange={(event) => setTitleValue(event.target.value)} aria-invalid={showValidation && !titleValue.trim()} />{showValidation && !titleValue.trim() ? <small className={createStyles.fieldError}>Ürün adı gerekli.</small> : null}</label>
              {kind === "simple" ? <fieldset id="product-commerce" className={createStyles.variantFieldset} disabled={variantBuilderOpen}><ProductVariantBuilder presentation="create" showValidation={showValidation} variants={variants} onChange={changeCreateVariants} allowMultiple={false} showShipping={productType === "physical"} skuPrefix={options.skuPrefix} onBarcodeBusyChange={trackBarcodeBusy} /></fieldset> : <div className={createStyles.variantSummary}><strong>{variants.length} varyant</strong><span>Fiyat, stok, SKU ve barkod aşağıda.</span><a href="#product-commerce">Varyantlara git</a></div>}
              <label className={createStyles.field}><span>Ürün türü</span><select value={productType} onChange={(event) => setProductType(event.target.value as "physical" | "digital")}><option value="physical">Fiziksel ürün</option><option value="digital">Dijital ürün</option></select></label>
            </div>
          </section>
          {showValidation && validVariantCount < variants.length ? <p className={createStyles.fieldError} role="alert">Fiyat, stok ve zorunlu varyant alanlarını kontrol edin.</p> : null}
          <section className={createStyles.section} aria-label="Ürün açıklaması"><ProductDescriptionField compact className={createStyles.description} rows={4} readOnly={busy} defaultValue={descriptionValue} onValueChange={(next) => { setDescriptionValue(next); markEditingDirty(); }} /></section>
          <section id={kind === "variant" ? "product-commerce" : "product-variants"} className={createStyles.section} aria-labelledby="create-variants-title">
            <div className={createStyles.sectionHeader}><h2 id="create-variants-title">Varyantlar{kind === "variant" ? <span className={createStyles.count}>{variants.length}</span> : null}</h2><button ref={variantAddRef} type="button" className={createStyles.inlineAction} disabled={createBlocked || variantBuilderOpen} onClick={openVariantBuilder} aria-expanded={variantBuilderOpen} aria-controls="create-variant-builder"><Plus aria-hidden="true" />Varyant ekle</button></div>
            {kind === "variant" ? <fieldset className={createStyles.variantFieldset} disabled={variantBuilderOpen}><ProductVariantBuilder presentation="create" showValidation={showValidation} variants={variants} onChange={changeCreateVariants} allowMultiple allowManualAdd={false} showShipping={productType === "physical"} skuPrefix={options.skuPrefix} onBarcodeBusyChange={trackBarcodeBusy} disableStructureChanges={createPending} /></fieldset> : !variantBuilderOpen ? <p className={createStyles.quiet}>Renk, beden veya diğer seçenekler.</p> : null}
            {variantBuilderOpen ? <div ref={variantBuilderRef} id="create-variant-builder" className={createStyles.builder} tabIndex={-1} role="group" aria-label="Varyant seçimi" onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented && !attributeSavingRef.current) { event.preventDefault(); closeVariantBuilder(); } }}>
              <AttributeVariantPicker presentation="create" value={pendingVariants} onChange={changePendingVariants} onAttributeIdsChange={setPendingAttributeIds} initialPrice={kind === "simple" ? variants[0]?.price : simpleVariantRef.current.price} initialStock={kind === "simple" ? variants[0]?.stockQuantity : simpleVariantRef.current.stockQuantity} disabled={busy} onBusyChange={trackAttributeBusy} />
              <div className={createStyles.builderActions}><button type="button" className={createStyles.secondary} onClick={closeVariantBuilder} disabled={attributeSaving}>Vazgeç</button><button type="button" className={createStyles.secondary} onClick={applyPendingVariants} disabled={attributeSaving || !pendingVariants.length}>Seçilenleri ekle{pendingVariants.length ? ` (${pendingVariants.length})` : ""}</button></div>
            </div> : null}
          </section>
          <div className={createStyles.additionalSettings}>
            <details className={createStyles.details}><summary><span>SEO</span><ChevronDown aria-hidden="true" /></summary><div className={createStyles.detailsBody}><div className={createStyles.fieldGrid}><label className={`${createStyles.field} ${createStyles.wide}`}><span>SEO başlığı</span><input name="seoTitle" maxLength={200} defaultValue={draftSession?.current.seoTitle ?? ""} /></label><label className={`${createStyles.field} ${createStyles.wide}`}><span>SEO açıklaması</span><textarea name="seoDescription" maxLength={500} rows={3} defaultValue={draftSession?.current.seoDescription ?? ""} /></label></div></div></details>
            <details ref={salesLimitsRef} className={createStyles.details}><summary><span>Sipariş sınırları ve Google kategori</span><ChevronDown aria-hidden="true" /></summary><div className={createStyles.detailsBody}><div className={createStyles.fieldGrid}><label className={createStyles.field}><span>Minimum sipariş</span><input name="minimumPurchaseQuantity" inputMode="numeric" defaultValue={draftSession?.current.minimumOrderQuantity || "1"} /></label><label className={createStyles.field}><span>Maksimum sipariş</span><input name="maximumPurchaseQuantity" inputMode="numeric" defaultValue={draftSession?.current.maximumOrderQuantity ?? ""} /></label><label className={`${createStyles.field} ${createStyles.wide}`}><span>Google ürün kategori kimliği</span><input name="googleProductCategoryId" inputMode="numeric" maxLength={20} defaultValue={draftSession?.current.googleProductCategoryId ?? ""} /></label></div></div></details>
            <details className={createStyles.details}><summary><span>Nitelikler ve ekstralar</span><ChevronDown aria-hidden="true" /></summary><div className={createStyles.detailsBody}>{(["attribute", "extra", "definition"] as const).map((resourceKind) => <div key={resourceKind} className={createStyles.resourceGroup}><h3>{resourceKind === "attribute" ? "Nitelikler" : resourceKind === "extra" ? "Ekstralar" : "Tanımlar"}</h3><div className={createStyles.optionList}>{activeResources(resourceKind).map((resource) => <label key={resource.id} className={createStyles.check}><input type="checkbox" name={`resource-${resourceKind}`} value={resource.id} defaultChecked={has(draftSession?.current[`resource${resourceKind[0].toUpperCase()}${resourceKind.slice(1)}Ids` as "resourceAttributeIds" | "resourceExtraIds" | "resourceDefinitionIds"] ?? [], resource.id)} /><span>{resource.name}</span></label>)}{!activeResources(resourceKind).length ? <p className={createStyles.quiet}>Seçenek bulunmuyor.</p> : null}</div></div>)}</div></details>
          </div>
        </div>
        <aside className={createStyles.rail} aria-label="Sınıflandırma ve satış kanalları">
          <section ref={categoryRailRef} className={createStyles.railBlock}><h2>Kategoriler</h2><ProductClassificationPicker label="Kategoriler" name="categoryIds" options={categoryChoices} selected={categoryIds} onChange={(next) => { markEditingDirty(); setCategoryIds(next); }} searchLabel="Kategori ara" />{showValidation && !categoryIds.length ? <small className={createStyles.fieldError}>Satışa açmak için kategori seçin.</small> : null}</section>
          <section className={createStyles.railBlock}><h2>Sınıflandırma</h2><div className={createStyles.railFields}><label className={createStyles.field}><span>Marka</span><select name="resource-brand" defaultValue={draftSession?.current.brandId ?? ""}><option value="">Seçilmedi</option>{activeResources("brand").map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label><ProductClassificationPicker label="Koleksiyonlar" name="resource-collection" options={collectionChoices} selected={collectionIds} onChange={(next) => { markEditingDirty(); setCollectionIds(next); }} searchLabel="Koleksiyon ara" /><ProductClassificationPicker label="Etiketler" name="resource-tag" options={tagChoices} selected={tagIds} onChange={(next) => { markEditingDirty(); setTagIds(next); }} searchLabel="Etiket ara" /><label className={createStyles.field}><span>Tedarikçi</span><input name="supplierName" maxLength={200} defaultValue={draftSession?.current.supplierName ?? ""} /></label></div></section>
          <section className={createStyles.railBlock}><h2>Satış kanalları</h2><div className={createStyles.channelList}>{options.channels.length ? options.channels.map((channel) => <label key={channel.id} className={createStyles.channel}><Store aria-hidden="true" /><span>{channel.name}</span><input type="checkbox" name="channelIds" value={channel.id} checked={selectedChannelIds.includes(channel.id)} onChange={(event) => { setChannelSelectionTouched(true); setSelectedChannelIds((current) => event.target.checked ? Object.freeze([...current, channel.id]) : Object.freeze(current.filter((id) => id !== channel.id))); }} /></label>) : <p className={createStyles.quiet}>Etkin satış kanalı bulunamadı.</p>}</div></section>
        </aside>
      </div>
    </fieldset>
    <footer className={createStyles.actions}><button type="button" className={createStyles.cancel} onClick={requestCancel} disabled={createBlocked}>Vazgeç</button><div>{createPending ? <span className={createStyles.pendingStatus} role="status">{pendingBarcodeCount ? "Barkod oluşturuluyor…" : "Nitelik kaydediliyor…"}</span> : null}<button type="submit" name="intent" value="draft" className={createStyles.secondary} disabled={createBlocked || variantBuilderOpen}>Taslak kaydet</button><button type="submit" name="intent" value="publish" className={createStyles.primary} disabled={createBlocked || variantBuilderOpen}>{busy ? "Kaydediliyor…" : "Kaydet ve satışa aç"}</button></div></footer>
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
