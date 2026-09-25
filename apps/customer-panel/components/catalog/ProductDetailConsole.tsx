"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { CatalogOnboardingOptions, CatalogProductEditorProjection, PermanentDeletionImpact, ProductVariant } from "@celebix/saas-contracts";
import type { ProductMediaLifecycle } from "../../../../packages/saas-contracts/src/media/index.ts";
import { Archive, ArrowLeft, Eye, Image as ImageIcon, MoreHorizontal, Pencil, Plus, RotateCcw, ScanBarcode, Trash2 } from "lucide-react";

import {
  CatalogApiError,
  catalogApi,
  type ProductDetailResult,
} from "@/lib/catalog-ui/client";
import {
  buildProductUpdatePayload,
  buildVariantCreatePayload,
  buildVariantBatchPayload,
  buildVariantUpdatePayload,
} from "@/lib/catalog-ui/forms";
import { formatTurkishMoney, formatTurkishMoneyInput } from "@/lib/catalog-ui/money";
import { ProductAdvancedEditor } from "@/components/catalog-onboarding/ProductAdvancedEditor";
import { AttributeVariantPicker } from "@/components/catalog-onboarding/AttributeVariantPicker";
import { ProductVariantBuilder, type VariantDraft } from "@/components/catalog-onboarding/ProductVariantBuilder";
import { SkuInput } from "@/components/catalog/SkuInput";
import { BarcodeInput } from "@/components/catalog/BarcodeInput";
import { CatalogOnboardingApiError, catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";
import { createDirtyEditorRegistry, createDirtyNavigationGuard } from "@/lib/catalog-ui/dirty-navigation";
import { ProductDescriptionField, ProductDescriptionPreview } from "./ProductDescriptionField";
import { ProductMediaManager, restoreArchiveFocus } from "./ProductMediaManager";
import { VariantPricingPolicyControl } from "@/components/reference-pricing/VariantPricingPolicyControl";
import { PermanentDeleteDialog } from "@/components/shared/PermanentDeleteDialog";
import { usePanelTopbarChrome } from "@/components/panel/PanelTopbarChrome";
import catalogStyles from "./catalog-operations.module.css";
import styles from "./product-detail-workspace.module.css";

function value(data: FormData, key: string) {
  const candidate = data.get(key);
  return typeof candidate === "string" ? candidate : "";
}

function variantValues(data: FormData) {
  return {
    title: value(data, "title"),
    sku: value(data, "sku"),
    barcode: value(data, "barcode"),
    price: value(data, "price"),
    compareAt: value(data, "compareAt"),
    cost: value(data, "cost"),
    stockTracking: data.get("stockTracking") === "on",
    stockQuantity: value(data, "stockQuantity"),
  };
}

function safeMessage(error: unknown) {
  return error instanceof CatalogApiError || error instanceof CatalogOnboardingApiError ? error.message : "İşlem tamamlanamadı. Lütfen yeniden deneyin.";
}

function currentVariantPrice(variant: ProductVariant): number | null {
  return variant.effectivePriceCents === undefined ? variant.priceCents : variant.effectivePriceCents;
}

function displayVariantPrice(variant: ProductVariant, currency: string): string {
  const current = currentVariantPrice(variant);
  return current === null ? "Fiyat güncelleniyor" : formatTurkishMoney(current, currency);
}

function VariantFields({ variant, skuPrefix, onBarcodeGenerated }: { variant?: ProductVariant; skuPrefix?: string; onBarcodeGenerated?: () => void }) {
  return (
    <div className="form-grid compact-form-grid">
      <label className="field field-wide"><span>Varyant adı <b>*</b></span><input name="title" required maxLength={200} defaultValue={variant?.title ?? ""} /></label>
      <SkuInput key={variant?.id ?? "new"} labelClassName="field" name="sku" skuPrefix={skuPrefix} value={variant?.sku ?? ""} />
      <BarcodeInput labelClassName="field" name="barcode" defaultValue={variant?.barcode ?? ""} onGenerated={onBarcodeGenerated} />
      <label className="field"><span>Satış fiyatı <b>*</b></span><div className="money-input"><input name="price" required inputMode="decimal" defaultValue={variant ? formatTurkishMoneyInput(variant.priceCents) : ""} /><span>₺</span></div></label>
      <label className="field"><span>Karşılaştırma fiyatı</span><div className="money-input"><input name="compareAt" inputMode="decimal" defaultValue={variant?.compareAtCents === undefined ? "" : formatTurkishMoneyInput(variant.compareAtCents)} /><span>₺</span></div></label>
      <label className="field"><span>Maliyet</span><div className="money-input"><input name="cost" inputMode="decimal" defaultValue={variant?.costCents === undefined ? "" : formatTurkishMoneyInput(variant.costCents)} /><span>₺</span></div></label>
      <label className="field"><span>Stok adedi <b>*</b></span><input name="stockQuantity" required inputMode="numeric" pattern="(?:0|[1-9][0-9]*)" defaultValue={String(variant?.stockQuantity ?? 0)} /></label>
      <label className="check-field field-wide"><input name="stockTracking" type="checkbox" defaultChecked={variant?.stockTracking ?? true} /><span><strong>Stok takibi açık</strong><small>Mevcut stok adedini satışlarla birlikte izleyin.</small></span></label>
    </div>
  );
}

export function ProductDetailConsole({
  productId,
  canManage = false,
  canArchive = false,
  canDelete = false,
  canReadPricing = false,
  canManagePricing = false,
}: Readonly<{ productId: string; canManage?: boolean; canArchive?: boolean; canDelete?: boolean; canReadPricing?: boolean; canManagePricing?: boolean }>) {
  const [detail, setDetail] = useState<ProductDetailResult>();
  const [onboarding, setOnboarding] = useState<Readonly<{ options: CatalogOnboardingOptions; editor: CatalogProductEditorProjection }>>();
  const [merchandisingState, setMerchandisingState] = useState<"loading" | "ready" | "error">("loading");
  const [merchandisingError, setMerchandisingError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [productDirty, setProductDirty] = useState(false);
  const [productFormRevision, setProductFormRevision] = useState(0);
  const [salesRevision, setSalesRevision] = useState(0);
  const [salesSaving, setSalesSaving] = useState(false);
  const [seoPreviewDraft, setSeoPreviewDraft] = useState<Readonly<{ title: string; description: string }>>();
  const [activeSection, setActiveSection] = useState("product-general");
  const [creatingVariant, setCreatingVariant] = useState(false);
  const [creatingAttributeVariants, setCreatingAttributeVariants] = useState(false);
  const [attributeVariants, setAttributeVariants] = useState<readonly VariantDraft[]>([]);
  const [editingVariant, setEditingVariant] = useState<string>();
  const [pricingVariantId, setPricingVariantId] = useState<string>();
  const [archiveVariant, setArchiveVariant] = useState<ProductVariant>();
  const [archiveProduct, setArchiveProduct] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<PermanentDeletionImpact>();
  const [activeMedia, setActiveMedia] = useState<readonly ProductMediaLifecycle[]>();
  const deletionIntentRef = useRef<Readonly<{ productId: string; expectedVersion: number; confirmation: string; operationId: string }> | undefined>(undefined);
  const archiveDialogRef = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLDetailsElement>(null);
  const salesSavingRef = useRef(false);
  const mutationLockedRef = useRef(false);
  const archiveCancelButtonRef = useRef<HTMLButtonElement>(null);
  const archiveTriggerRef = useRef<HTMLElement>(null);
  const variantsHeadingRef = useRef<HTMLHeadingElement>(null);
  const wasArchiveDialogOpen = useRef(false);
  const dirtyEditorsRef = useRef(createDirtyEditorRegistry(["product", "variant-create", "variant-batch", "variant-edit", "sales"] as const));

  usePanelTopbarChrome({ title: "", hideHeading: true });
  const receiveActiveMedia = useCallback((items: readonly ProductMediaLifecycle[]) => setActiveMedia(items), []);

  useEffect(() => { setSeoPreviewDraft(undefined); }, [productId]);

  const load = useCallback(async () => {
    setError("");
    try {
      const current = await catalogApi.getProduct(productId);
      setDetail(current);
      return true;
    } catch (failure) {
      setError(safeMessage(failure));
      return false;
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (loading || detail === undefined) return;
    const ids = ["product-general", "product-images", "product-variants", "product-sales"];
    const updateActiveSection = () => {
      let current = ids[0];
      for (const id of ids) {
        if (id === "product-sales" && window.innerWidth > 800) continue;
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= 150) current = id;
      }
      setActiveSection(current);
    };
    updateActiveSection();
    document.addEventListener("scroll", updateActiveSection, true);
    window.addEventListener("resize", updateActiveSection);
    return () => {
      document.removeEventListener("scroll", updateActiveSection, true);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, [loading, detail]);

  const reloadMerchandising = useCallback(async (close = false) => {
    setMerchandisingState("loading");
    setMerchandisingError("");
    try {
      const [options, editor] = await Promise.all([
        catalogOnboardingClient.getOptions(),
        catalogOnboardingClient.getProductEditor(productId),
      ]);
      setOnboarding(Object.freeze({ options, editor }));
      setMerchandisingState("ready");
      if (close) {
        dirtyEditorsRef.current.clear("sales");
        setSalesRevision((current) => current + 1);
        setSeoPreviewDraft(undefined);
        setNotice("Satış ayarları güncellendi.");
      }
      return true;
    } catch (failure) {
      setMerchandisingState("error");
      setMerchandisingError(safeMessage(failure));
      return false;
    }
  }, [productId]);

  useEffect(() => { void reloadMerchandising(); }, [reloadMerchandising]);

  useEffect(() => {
    const guard = createDirtyNavigationGuard({
      isDirty: () => dirtyEditorsRef.current.anyDirty(),
      confirm: () => window.confirm("Kaydedilmemiş ürün değişiklikleriniz var. Bu düzenleyiciyi kapatmak istiyor musunuz?"),
    });
    return guard.bindBeforeUnload(window);
  }, []);

  useEffect(() => {
    const guard = createDirtyNavigationGuard({
      isDirty: () => dirtyEditorsRef.current.anyDirty(),
      confirm: () => window.confirm("Kaydedilmemiş ürün değişiklikleriniz var. Sayfadan ayrılmak istiyor musunuz?"),
    });
    return guard.bindApplicationNavigation(document, () => window.location.href);
  }, []);

  function markDetailDirty(editor: "product" | "variant-create" | "variant-batch" | "variant-edit") {
    dirtyEditorsRef.current.mark(editor);
    if (editor === "product") setProductDirty(true);
  }

  function resetProductDraft() {
    dirtyEditorsRef.current.clear("product");
    setProductDirty(false);
    setProductFormRevision((current) => current + 1);
  }

  function canDiscardDetailChanges(editor?: "product" | "variant-create" | "variant-batch" | "variant-edit" | "sales") {
    const guard = createDirtyNavigationGuard({
      isDirty: () => editor === undefined ? dirtyEditorsRef.current.anyDirty() : dirtyEditorsRef.current.isDirty(editor),
      confirm: () => window.confirm("Kaydedilmemiş ürün değişiklikleriniz var. Bu düzenleyiciyi kapatmak istiyor musunuz?"),
    });
    if (!guard.canLeave()) return false;
    if (editor === undefined) dirtyEditorsRef.current.clearAll();
    else dirtyEditorsRef.current.clear(editor);
    return true;
  }

  function canDiscardVariantChanges() {
    return canDiscardDetailChanges("variant-create")
      && canDiscardDetailChanges("variant-batch")
      && canDiscardDetailChanges("variant-edit");
  }

  function closeDetailEditors() {
    setCreatingVariant(false);
    setCreatingAttributeVariants(false);
    setAttributeVariants([]);
    setEditingVariant(undefined);
    setPricingVariantId(undefined);
  }

  function openExclusiveEditor(editor: "variant-create" | "variant-edit", variantId?: string) {
    if (!canDiscardVariantChanges()) return;
    setCreatingVariant(false);
    setCreatingAttributeVariants(false);
    setAttributeVariants([]);
    setEditingVariant(undefined);
    setPricingVariantId(undefined);
    if (editor === "variant-create") setCreatingVariant(true);
    else setEditingVariant(variantId);
  }

  const archiveDialogOpen = archiveVariant !== undefined || archiveProduct;

  useEffect(() => {
    if (archiveDialogOpen) {
      wasArchiveDialogOpen.current = true;
      archiveCancelButtonRef.current?.focus();
      return;
    }
    if (!wasArchiveDialogOpen.current) return;
    wasArchiveDialogOpen.current = false;
    restoreArchiveFocus(archiveTriggerRef.current, variantsHeadingRef.current);
  }, [archiveDialogOpen]);


  useEffect(() => {
    function closeMenu(event: PointerEvent | globalThis.KeyboardEvent) {
      if (event.type === "keydown" && (event as globalThis.KeyboardEvent).key !== "Escape") return;
      if (event.type === "pointerdown" && actionMenuRef.current?.contains(event.target as Node)) return;
      const summary = actionMenuRef.current?.querySelector<HTMLElement>("summary");
      const restoreFocus = Boolean(actionMenuRef.current?.open && (event.type === "keydown" || actionMenuRef.current.contains(document.activeElement)));
      actionMenuRef.current?.removeAttribute("open");
      if (restoreFocus) summary?.focus();
    }
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeMenu);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeMenu);
    };
  }, []);

  function closeArchiveDialog() {
    if (busy !== "") return;
    setArchiveVariant(undefined);
    setArchiveProduct(false);
  }

  function handleArchiveDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      closeArchiveDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(archiveDialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    if (focusable.length === 0) {
      event.preventDefault();
      archiveDialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || !archiveDialogRef.current?.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !archiveDialogRef.current?.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  async function mutation(name: string, action: () => Promise<void>) {
    if (mutationLockedRef.current) return;
    mutationLockedRef.current = true;
    setBusy(name);
    setError("");
    setNotice("");
    try { await action(); }
    catch (failure) {
      if (failure instanceof CatalogApiError && failure.code === "version_conflict") {
        setConflict(true);
        setError("Bu ürün sunucuda değişti. Yerel alanlarınız korunuyor; sunucu sürümünü yalnız siz seçerseniz yükleyeceğiz.");
      } else setError(safeMessage(failure));
    } finally {
      mutationLockedRef.current = false;
      setBusy("");
    }
  }

  async function loadServerSnapshot() {
    const replaced = await load();
    if (!replaced) return;
    dirtyEditorsRef.current.clearAll();
    setProductDirty(false);
    setProductFormRevision((current) => current + 1);
    setSalesRevision((current) => current + 1);
    setSeoPreviewDraft(undefined);
    setConflict(false);
    setError("");
    setEditingVariant(undefined);
    setArchiveVariant(undefined);
    setArchiveProduct(false);
    setNotice("Sunucudaki güncel sürüm yüklendi.");
  }

  async function updateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (detail === undefined || !canManage || detail.product.status === "archived") return;
    const data = new FormData(event.currentTarget);
    const parsed = buildProductUpdatePayload({
      title: value(data, "title"), slug: detail.product.slug, description: value(data, "description"),
      status: detail.product.status, currency: value(data, "currency"),
    }, detail.product.version);
    if (!parsed.ok) { setError(parsed.message); return; }
    await mutation("product", async () => {
      const result = await catalogApi.updateProduct(productId, parsed.value);
      setDetail((current) => current && Object.freeze({ ...current, product: result.product }));
      dirtyEditorsRef.current.clear("product");
      setProductDirty(false);
      setProductFormRevision((current) => current + 1);
      setNotice("Ürün bilgileri güncellendi.");
    });
  }

  async function setProductStatus(status: "active" | "draft") {
    if (detail === undefined || !canManage || detail.product.status === "archived" || detail.product.status === status || salesSavingRef.current) return;
    if (!canDiscardDetailChanges()) return;
    resetProductDraft();
    setSalesRevision((current) => current + 1);
    setSeoPreviewDraft(undefined);
    closeDetailEditors();
    await mutation("product-status", async () => {
      const result = await catalogApi.setProductStatus(productId, detail.product.version, status);
      setDetail((current) => current && Object.freeze({ ...current, product: result.product }));
      setNotice(status === "active" ? "Ürün satışa açıldı." : "Ürün satıştan kaldırıldı.");
    });
  }

  async function createVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || detail === undefined || detail.product.status === "archived") return;
    if (merchandisingState !== "ready" || !onboarding) { setError("SKU ayarı yüklenemedi. Satış ayarlarını yeniden yükleyin."); return; }
    const parsed = buildVariantCreatePayload(variantValues(new FormData(event.currentTarget)));
    if (!parsed.ok) { setError(parsed.message); return; }
    await mutation("new-variant", async () => {
      const result = await catalogApi.createVariant(productId, parsed.value);
      setDetail((current) => current && Object.freeze({ ...current, variants: Object.freeze([...current.variants, result.variant]) }));
      dirtyEditorsRef.current.clear("variant-create");
      setCreatingVariant(false);
      setNotice("Yeni varyant oluşturuldu.");
    });
  }

  async function createAttributeVariants(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || detail === undefined || detail.product.status === "archived") return;
    if (merchandisingState !== "ready" || !onboarding) { setError("SKU ayarı yüklenemedi. Satış ayarlarını yeniden yükleyin."); return; }
    if (detail.variants.filter((variant) => variant.status !== "archived").length + attributeVariants.length > 100) {
      setError("Bir üründe en fazla 100 varyant olabilir."); return;
    }
    const parsed = buildVariantBatchPayload(attributeVariants);
    if (!parsed.ok) { setError(parsed.message); return; }
    await mutation("new-attribute-variants", async () => {
      await catalogApi.createVariantBatch(productId, parsed.value);
      const refreshed = await load();
      setAttributeVariants([]);
      dirtyEditorsRef.current.clear("variant-batch");
      setCreatingAttributeVariants(false);
      if (refreshed) setNotice("Seçilen varyantlar oluşturuldu.");
    });
  }

  async function updateVariant(event: FormEvent<HTMLFormElement>, variant: ProductVariant) {
    event.preventDefault();
    if (!canManage || detail?.product.status === "archived") return;
    if (merchandisingState !== "ready" || !onboarding) { setError("SKU ayarı yüklenemedi. Satış ayarlarını yeniden yükleyin."); return; }
    const parsed = buildVariantUpdatePayload(
      variantValues(new FormData(event.currentTarget)),
      variant.version,
      variant.attributes,
    );
    if (!parsed.ok) { setError(parsed.message); return; }
    await mutation(`variant-${variant.id}`, async () => {
      const result = await catalogApi.updateVariant(productId, variant.id, parsed.value);
      setDetail((current) => current && Object.freeze({
        ...current,
        variants: Object.freeze(current.variants.map((item) => item.id === variant.id ? result.variant : item)),
      }));
      dirtyEditorsRef.current.clear("variant-edit");
      setEditingVariant(undefined);
      setNotice("Varyant güncellendi.");
    });
  }

  async function confirmVariantArchive() {
    if (archiveVariant === undefined || !canArchive || detail?.product.status === "archived") return;
    if (!canDiscardVariantChanges()) return;
    closeDetailEditors();
    await mutation(`archive-${archiveVariant.id}`, async () => {
      await catalogApi.archiveVariant(productId, archiveVariant.id, archiveVariant.version);
      setDetail((current) => current && Object.freeze({
        ...current,
        variants: Object.freeze(current.variants.filter((item) => item.id !== archiveVariant.id)),
      }));
      setArchiveVariant(undefined);
      setNotice("Varyant arşivlendi ve aktif listeden kaldırıldı.");
    });
  }

  async function confirmProductArchive() {
    if (detail === undefined || !canArchive || detail.product.status === "archived" || salesSavingRef.current) return;
    if (!canDiscardDetailChanges()) return;
    resetProductDraft();
    setSalesRevision((current) => current + 1);
    setSeoPreviewDraft(undefined);
    closeDetailEditors();
    await mutation("archive-product", async () => {
      await catalogApi.archiveProduct(productId, detail.product.version);
      location.assign("/products");
    });
  }

  async function restoreProduct() {
    if (detail === undefined || !canArchive || detail.product.status !== "archived") return;
    await mutation("restore-product", async () => {
      await catalogApi.restoreProduct(productId, detail.product.version);
      await load();
      setNotice("Ürün taslak olarak geri yüklendi. Yayınlamak için manuel olarak aktifleştirin.");
    });
  }

  async function openDeleteDialog() {
    if (detail === undefined || !canDelete || busy !== "" || salesSavingRef.current) return;
    setDeleteDialogOpen(true);
    setDeletionImpact(undefined);
    setError("");
    setBusy("deletion-impact");
    try {
      const impact = await catalogApi.getProductDeletionImpact(productId);
      if (impact.resourceKind !== "product" || impact.resourceId !== productId) throw new Error("invalid deletion impact");
      setDeletionImpact(impact);
      deletionIntentRef.current = undefined;
    } catch (failure) {
      setDeleteDialogOpen(false);
      setError(safeMessage(failure));
      actionMenuRef.current?.querySelector<HTMLElement>("summary")?.focus();
    } finally { setBusy(""); }
  }

  function deleteProduct(confirmation: string) {
    if (!canDelete || !deletionImpact || busy !== "") return;
    if (!canDiscardDetailChanges()) return;
    resetProductDraft();
    setSalesRevision((current) => current + 1);
    setSeoPreviewDraft(undefined);
    closeDetailEditors();
    const current = deletionIntentRef.current;
    const operationId = current?.productId === productId
      && current.expectedVersion === deletionImpact.expectedVersion
      && current.confirmation === confirmation
      ? current.operationId : crypto.randomUUID();
    deletionIntentRef.current = Object.freeze({
      productId, expectedVersion: deletionImpact.expectedVersion, confirmation, operationId,
    });
    void mutation("delete-product", async () => {
      const result = await catalogApi.deleteProduct(productId, {
        operationId, expectedVersion: deletionImpact.expectedVersion, confirmation,
      });
      if (!result.deleted || result.resourceId !== productId || result.auditId !== operationId) throw new Error("invalid deletion result");
      location.assign("/products");
    });
  }

  async function openStorefrontPreview() {
    const target=window.open("about:blank","_blank");if(target)target.opener=null;
    setBusy("preview");setError("");
    try{const response=await fetch(`/api/catalog/products/${productId}/preview`,{method:"POST",credentials:"same-origin"}),body=await response.json();if(!response.ok||typeof body.url!=="string")throw new Error();if(target)target.location.href=body.url;else window.location.assign(body.url);}
    catch{target?.close();setError("Mağaza önizlemesi oluşturulamadı. Ürünü ve mağaza alan adını kontrol edip yeniden deneyin.");}
    finally{setBusy("");}
  }

  if (loading) return <div className="catalog-loading page-loading" role="status"><span className="spinner" aria-hidden="true" /> Ürün ayrıntıları yükleniyor…</div>;
  if (detail === undefined) return <section className={`catalog-page ${catalogStyles.catalogRoot}`}><div className="feedback feedback-error" role="alert"><div><strong>Ürün açılamadı</strong><p>{error || "Ürün bulunamadı."}</p></div><button className="button button-secondary" type="button" onClick={() => { setLoading(true); void load(); }}>Tekrar dene</button></div></section>;

  const { product, variants } = detail;
  const archived = product.status === "archived";
  const statusLabel = product.status === "active" ? "Satışta" : archived ? "Arşivlenmiş" : "Taslak";
  const priceValues = variants.flatMap((variant) => {
    const current = currentVariantPrice(variant);
    return current === null ? [] : [current];
  });
  const trackedVariants = variants.filter((variant) => variant.stockTracking);
  const salePrice = priceValues.length === 0 ? variants.length ? "Fiyat güncelleniyor" : "—" : formatTurkishMoney(Math.min(...priceValues), product.currency);
  const stockValue = variants.length === 0
    ? "—"
    : trackedVariants.length === 0
      ? "Takip dışı"
      : String(trackedVariants.reduce((total, variant) => total + variant.stockQuantity, 0)) + " adet";
  const primarySku = variants.find((variant) => variant.sku)?.sku;
  const cover = activeMedia?.find((item) => item.publicUrl);
  const productType = onboarding?.editor.profile.productType === "digital" ? "Dijital ürün" : "Fiziksel ürün";
  const updatedAt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(product.updatedAt));
  const readOnlySalesSettings = onboarding ? (
    <section className={styles.asidePanel} aria-labelledby="read-only-sales-settings-title">
      <div className={styles.sideHeader}><h2 id="read-only-sales-settings-title">Satış ve SEO</h2></div>
      {!canManage && !archived ? <div className="feedback feedback-warning" role="status"><div><strong>Yalnızca görüntüleme</strong><p>Bu ayarları düzenlemek için yetki gerekir.</p></div></div> : null}
      <dl className={styles.asideFacts} aria-label="Satış ayarları">
        <div><dt>Ürün türü</dt><dd>{onboarding.editor.profile.productType === "physical" ? "Fiziksel" : "Dijital"}</dd></div>
        <div><dt>Satış kanalları</dt><dd>{onboarding.options.channels.filter(({ id }) => onboarding.editor.channelIds.includes(id)).map(({ name }) => name).join(", ") || "—"}</dd></div>
        <div><dt>Kategoriler</dt><dd>{onboarding.options.categories.filter(({ id }) => onboarding.editor.categoryIds.includes(id)).map(({ name }) => name).join(", ") || "—"}</dd></div>
        <div><dt>Marka</dt><dd>{onboarding.options.resources.find(({ id }) => id === onboarding.editor.resourceIds.brand)?.name ?? "—"}</dd></div>
        <div><dt>Koleksiyonlar</dt><dd>{onboarding.options.resources.filter(({ id }) => onboarding.editor.resourceIds.collections.includes(id)).map(({ name }) => name).join(", ") || "—"}</dd></div>
        <div><dt>Etiketler</dt><dd>{onboarding.options.resources.filter(({ id }) => onboarding.editor.resourceIds.tags.includes(id)).map(({ name }) => name).join(", ") || "—"}</dd></div>
        <div><dt>Minimum sipariş</dt><dd>{onboarding.editor.profile.minimumPurchaseQuantity}</dd></div>
        <div><dt>Maksimum sipariş</dt><dd>{onboarding.editor.profile.maximumPurchaseQuantity ?? "—"}</dd></div>
        <div><dt>Tedarikçi</dt><dd>{onboarding.editor.profile.supplierName ?? "—"}</dd></div>
        <div><dt>Google kategorisi</dt><dd>{onboarding.editor.profile.googleProductCategoryId ?? "—"}</dd></div>
        <div><dt>SEO başlığı</dt><dd>{onboarding.editor.profile.seoTitle ?? "—"}</dd></div>
        <div><dt>SEO açıklaması</dt><dd>{onboarding.editor.profile.seoDescription ?? "—"}</dd></div>
        <div><dt>Profil sürümü</dt><dd>v{onboarding.editor.profile.version}</dd></div>
        <div><dt>Son güncelleme</dt><dd><time dateTime={product.updatedAt}>{updatedAt}</time></dd></div>
      </dl>
    </section>
  ) : null;

  return (
    <section data-presentation="hemenaku-product-detail" className={"catalog-page product-detail-workspace " + catalogStyles.catalogRoot + " " + styles.root} aria-labelledby="product-title">
      <h1 id="product-title" className="sr-only">{product.title} ürününü düzenle</h1>
      <div className={styles.toolbar}>
        <div className={styles.path}>
          <Link className={styles.backLink} href="/products"><ArrowLeft aria-hidden="true" /> Ürünler</Link>
          <span aria-hidden="true">/</span>
          <span>{primarySku ?? product.id.slice(0, 8)}</span>
          <span className={styles.status + (product.status === "active" ? " " + styles.statusActive : "")}>{statusLabel}</span>
        </div>
        <div className={styles.heroActions}>
          {!archived ? <button className={styles.outlineButton} type="button" onClick={() => void openStorefrontPreview()} disabled={busy !== ""}><Eye aria-hidden="true" /> {busy === "preview" ? "Hazırlanıyor…" : "Mağazada gör"}</button> : null}
          {!archived ? <Link className={styles.outlineButton} href={"/products/barcode-labels?productId=" + product.id}><ScanBarcode aria-hidden="true" /> Barkod etiketi</Link> : null}
          {archived && canArchive ? <button className={styles.outlineButton} type="button" onClick={() => void restoreProduct()} disabled={busy !== ""}><RotateCcw aria-hidden="true" /> {busy === "restore-product" ? "Geri yükleniyor…" : "Geri yükle"}</button> : null}
          {(canManage || canArchive || canDelete) ? <details className={styles.more} ref={actionMenuRef}><summary aria-label="Diğer ürün işlemleri" title="Diğer ürün işlemleri"><MoreHorizontal aria-hidden="true" /></summary><div className={styles.moreMenu}>
            {!archived && canManage ? <button type="button" onClick={() => { actionMenuRef.current?.removeAttribute("open"); actionMenuRef.current?.querySelector<HTMLElement>("summary")?.focus(); void setProductStatus(product.status === "active" ? "draft" : "active"); }} disabled={busy !== "" || salesSaving}>{product.status === "active" ? "Satıştan kaldır" : "Satışa aç"}</button> : null}
            {!archived && canArchive ? <button type="button" onClick={() => { archiveTriggerRef.current = actionMenuRef.current?.querySelector("summary") ?? null; actionMenuRef.current?.removeAttribute("open"); setArchiveProduct(true); }} disabled={busy !== "" || salesSaving}><Archive aria-hidden="true" /> Arşivle</button> : null}
            {canDelete ? <button className={styles.dangerAction} type="button" onClick={() => { actionMenuRef.current?.removeAttribute("open"); void openDeleteDialog(); }} disabled={busy !== "" || salesSaving}><Trash2 aria-hidden="true" /> Kalıcı sil</button> : null}
          </div></details> : null}
        </div>
      </div>

      <nav className={styles.sectionNav} aria-label="Ürün bölümleri">
        <a href="#product-general" aria-current={activeSection === "product-general" ? "location" : undefined} onClick={() => setActiveSection("product-general")}>Bilgiler</a>
        <a href="#product-images" aria-current={activeSection === "product-images" ? "location" : undefined} onClick={() => setActiveSection("product-images")}>Görseller {activeMedia !== undefined ? <span>{activeMedia.length}</span> : null}</a>
        <a href="#product-variants" aria-current={activeSection === "product-variants" ? "location" : undefined} onClick={() => setActiveSection("product-variants")}>Varyantlar <span>{variants.length}</span></a>
        <a href="#product-sales" aria-current={activeSection === "product-sales" ? "location" : undefined} onClick={() => setActiveSection("product-sales")}>Satış ve SEO</a>
      </nav>

      {archived ? <div className="feedback feedback-warning" role="status"><div><strong>Ürün arşivlenmiş</strong><p>Mağazada görünmüyor. Sipariş geçmişi ve medya korunuyor.</p></div></div> : null}
      {error ? <div className="feedback feedback-error" role="alert"><div><strong>İşlem tamamlanamadı</strong><p>{error}</p></div>{conflict ? <button className="button button-secondary" type="button" onClick={() => void loadServerSnapshot()}>Sunucudaki sürümü yükle</button> : null}</div> : null}
      {merchandisingState === "error" ? <div className="feedback feedback-error" role="alert"><div><strong>Satış ayarları yüklenemedi</strong><p>{merchandisingError}</p></div><button className="button button-secondary" type="button" onClick={() => void reloadMerchandising()}>Tekrar dene</button></div> : null}
      {notice ? <div className="feedback feedback-success" role="status"><div><p>{notice}</p></div></div> : null}

      <div className={styles.workspace}>
        <div className={styles.mainColumn}>
          <section id="product-general" className={styles.general} aria-labelledby="product-fields-title">
            <div className={styles.sectionHeader}><h2 id="product-fields-title">Ürün bilgileri</h2><span>{productType} · {product.currency} · v{product.version}</span></div>
            <div className={styles.productCore}>
              <div className={styles.heroImage}>
                {cover?.publicUrl ? <img src={cover.publicUrl} alt={cover.altText || product.title} /> : <ImageIcon aria-label="Kapak görseli yok" />}
                <a className={styles.photoAction} href="#product-images"><Pencil aria-hidden="true" /> Görselleri düzenle</a>
              </div>
              <div className={styles.productMain}>
                {canManage && !archived ? (
                  <form className={styles.generalForm} onSubmit={updateProduct} onChange={() => markDetailDirty("product")} key={productFormRevision}>
                    <fieldset disabled={busy !== ""}>
                      <label className="field field-wide"><span>Ürün adı <b>*</b></span><input name="title" required maxLength={200} defaultValue={product.title} /></label>
                      <input type="hidden" name="currency" value={product.currency} readOnly />
                      <ProductDescriptionField className="field field-wide" rows={4} defaultValue={product.description ?? ""} readOnly={busy !== ""} onValueChange={() => markDetailDirty("product")} />
                    </fieldset>
                    <div className={styles.summaryStrip}>
                      <div><small>Başlangıç fiyatı</small><strong>{salePrice}</strong></div>
                      <div><small>Toplam stok</small><strong>{stockValue}</strong></div>
                    </div>
                    {productDirty ? <div className={styles.formActions}><span>Kaydedilmemiş ürün bilgileri</span><button className="button button-secondary" type="button" onClick={() => { if (canDiscardDetailChanges("product")) resetProductDraft(); }}>Vazgeç</button><button className="button button-primary" type="submit" disabled={busy !== ""}>{busy === "product" ? "Kaydediliyor…" : "Bilgileri kaydet"}</button></div> : null}
                  </form>
                ) : (
                  <div>
                    <strong className={styles.readOnlyTitle}>{product.title}</strong>
                    <ProductDescriptionPreview source={product.description} emptyMessage="Bu ürün için açıklama eklenmemiş." />
                    <div className={styles.summaryStrip}>
                      <div><small>Başlangıç fiyatı</small><strong>{salePrice}</strong></div>
                      <div><small>Toplam stok</small><strong>{stockValue}</strong></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <ProductMediaManager productId={productId} canManage={canManage && !archived} canArchive={canArchive} onActiveMediaChange={receiveActiveMedia} />

          <section id="product-variants" className={styles.variants} aria-labelledby="variants-title">
            <div className={styles.sectionHeader}>
              <h2 ref={variantsHeadingRef} tabIndex={-1} id="variants-title">Varyantlar <span className={styles.count}>{variants.length}</span></h2>
              {canManage && !archived ? <div className={styles.variantActions}>
                <button className="button button-secondary" type="button" onClick={() => { if (!canDiscardVariantChanges()) return; const opening = !creatingAttributeVariants; closeDetailEditors(); setCreatingAttributeVariants(opening); }} disabled={busy !== "" || merchandisingState !== "ready" || !onboarding}>Niteliklerden ekle</button>
                <button className="button button-secondary" type="button" onClick={() => openExclusiveEditor("variant-create")} disabled={creatingVariant || merchandisingState !== "ready" || !onboarding}><Plus aria-hidden="true" /> Varyant ekle</button>
              </div> : null}
            </div>

            {creatingVariant && canManage && !archived ? (
              <form className="catalog-form inset-form" onSubmit={createVariant} onChange={() => markDetailDirty("variant-create")}>
                <fieldset disabled={busy !== "" || merchandisingState !== "ready"}><legend>Yeni varyant</legend><VariantFields skuPrefix={onboarding?.options.skuPrefix} onBarcodeGenerated={() => markDetailDirty("variant-create")} /></fieldset>
                <div className="form-actions"><button className="button button-secondary" type="button" onClick={() => { if (canDiscardDetailChanges("variant-create")) setCreatingVariant(false); }}>Vazgeç</button><button className="button button-primary" type="submit" disabled={busy !== "" || merchandisingState !== "ready"}>{busy === "new-variant" ? "Oluşturuluyor…" : "Varyantı oluştur"}</button></div>
              </form>
            ) : null}

            {creatingAttributeVariants && canManage && !archived ? <form className="catalog-form inset-form" onSubmit={(event) => void createAttributeVariants(event)}>
              <AttributeVariantPicker value={attributeVariants} onChange={(next) => { markDetailDirty("variant-batch"); setAttributeVariants(next); }} existing={variants} disabled={busy !== "" || merchandisingState !== "ready"} />
              {attributeVariants.length ? <ProductVariantBuilder variants={attributeVariants} onChange={(next) => { markDetailDirty("variant-batch"); setAttributeVariants(next); }} allowMultiple allowManualAdd={false} skuPrefix={onboarding?.options.skuPrefix} /> : null}
              <div className="form-actions"><button className="button button-secondary" type="button" onClick={() => { if (!canDiscardDetailChanges("variant-batch")) return; setCreatingAttributeVariants(false); setAttributeVariants([]); }}>Vazgeç</button><button className="button button-primary" type="submit" disabled={busy !== "" || merchandisingState !== "ready" || !attributeVariants.length}>{busy === "new-attribute-variants" ? "Kaydediliyor…" : String(attributeVariants.length) + " varyantı oluştur"}</button></div>
            </form> : null}

            <div className={styles.variantRows} role="list" aria-label="Aktif varyantlar">
              {variants.length === 0 ? <div className="empty-variants"><strong>Aktif varyant yok</strong><p>Ürünü satışa hazırlamak için bir varyant ekleyin.</p></div> : variants.map((variant) => (
                <article className={styles.variantRow} role="listitem" key={variant.id}>
                  <div className={styles.variantIdentity}><span className="variant-mark" aria-hidden="true">V</span><div><strong>{variant.title}</strong><small>v{variant.version}</small></div></div>
                  {editingVariant === variant.id && canManage && !archived ? (
                    <form className="catalog-form inset-form" onSubmit={(event) => void updateVariant(event, variant)} onChange={() => markDetailDirty("variant-edit")} key={variant.version}>
                      <fieldset disabled={busy !== "" || merchandisingState !== "ready"}><VariantFields variant={variant} skuPrefix={onboarding?.options.skuPrefix} onBarcodeGenerated={() => markDetailDirty("variant-edit")} /></fieldset>
                      <div className="form-actions"><button className="button button-secondary" type="button" onClick={() => { if (canDiscardDetailChanges("variant-edit")) setEditingVariant(undefined); }}>Vazgeç</button><button className="button button-primary" type="submit" disabled={busy !== "" || merchandisingState !== "ready"}>{busy === "variant-" + variant.id ? "Kaydediliyor…" : "Varyantı kaydet"}</button></div>
                    </form>
                  ) : (
                    <>
                      <div className={styles.variantValues}>
                        <span><small>Fiyat</small><strong>{displayVariantPrice(variant, product.currency)}</strong></span>
                        <span><small>Karşılaştırma</small><strong>{variant.compareAtCents === undefined || currentVariantPrice(variant) === null || variant.compareAtCents <= currentVariantPrice(variant)! ? "—" : formatTurkishMoney(variant.compareAtCents, product.currency)}</strong></span>
                        <span><small>Stok</small><strong>{variant.stockTracking ? String(variant.stockQuantity) + " adet" : "Takip dışı"}</strong></span>
                      </div>
                      <div className={styles.variantCodes}><span>{variant.sku ? "SKU " + variant.sku : "SKU eklenmemiş"}</span><small><ScanBarcode aria-hidden="true" /> {variant.barcode || "Barkod eklenmemiş"}</small></div>
                      <div className={styles.variantActions}>
                        {canManage && !archived ? <button className={styles.smallAction} type="button" onClick={() => openExclusiveEditor("variant-edit", variant.id)} disabled={merchandisingState !== "ready" || !onboarding} aria-label={variant.title + " varyantını düzenle"}><Pencil aria-hidden="true" /></button> : null}
                        {canReadPricing && !archived ? <button className={styles.smallAction} type="button" aria-expanded={pricingVariantId === variant.id} onClick={() => { if (!canDiscardVariantChanges()) return; closeDetailEditors(); setPricingVariantId(variant.id); }}>Fiyat yöntemi</button> : null}
                        {canArchive && !archived ? <button className="text-danger-button" type="button" onClick={(event) => { archiveTriggerRef.current = event.currentTarget; setArchiveVariant(variant); }}>Arşivle</button> : null}
                      </div>
                    </>
                  )}
                  {pricingVariantId === variant.id && canReadPricing && !archived ? <VariantPricingPolicyControl variantId={variant.id} variantVersion={variant.version} fixedPriceCents={variant.priceCents} canManage={canManagePricing} onSaved={() => void load()} onClose={() => setPricingVariantId(undefined)} /> : null}
                </article>
              ))}
            </div>
          </section>
          {merchandisingState === "ready" && onboarding ? (
            <section className={styles.seoPreview} aria-label="Arama sonucu önizlemesi">
              <div className={styles.seoSnippet}>
                <span>ARAMA SONUCU ÖNİZLEMESİ</span>
                <strong>{(seoPreviewDraft?.title ?? onboarding.editor.profile.seoTitle)?.trim() || product.title}</strong>
                <p>{(seoPreviewDraft?.description ?? onboarding.editor.profile.seoDescription)?.trim() || "SEO açıklaması eklenmedi."}</p>
              </div>
            </section>
          ) : null}
        </div>
        <aside id="product-sales" className={styles.sideColumn} aria-label="Satış ve SEO">
          {merchandisingState === "loading" ? <div className={styles.asidePanel} role="status">Satış ayarları yükleniyor…</div> : null}
          {merchandisingState === "ready" && onboarding && canManage && !archived ? (
            <section className={styles.asidePanel} aria-label="Satış ve SEO">
              <ProductAdvancedEditor
                key={String(onboarding.editor.profile.version) + ":" + String(salesRevision)}
                presentation="rail"
                options={onboarding.options}
                editor={onboarding.editor}
                onCancel={() => { dirtyEditorsRef.current.clear("sales"); setSalesRevision((current) => current + 1); setSeoPreviewDraft(undefined); }}
                onUpdated={() => void reloadMerchandising(true)}
                onConflictReload={async () => { const refreshed = await reloadMerchandising(); if (refreshed) { dirtyEditorsRef.current.clear("sales"); setSalesRevision((current) => current + 1); setSeoPreviewDraft(undefined); } return refreshed; }}
                onDirtyChange={(dirty) => { if (dirty) dirtyEditorsRef.current.mark("sales"); else dirtyEditorsRef.current.clear("sales"); }}
                onBusyChange={(saving) => { salesSavingRef.current = saving; setSalesSaving(saving); }}
                onSeoPreviewChange={setSeoPreviewDraft}
              />
              <dl className={styles.asideFacts}><div><dt>Son güncelleme</dt><dd><time dateTime={product.updatedAt}>{updatedAt}</time></dd></div></dl>
            </section>
          ) : null}
          {merchandisingState === "ready" && (!canManage || archived) ? readOnlySalesSettings : null}
        </aside>
      </div>

      {archiveDialogOpen && canArchive && !archived ? (
        <div className="archive-dialog-layer">
          <div ref={archiveDialogRef} className="archive-dialog" role="alertdialog" aria-modal="true" aria-labelledby={archiveVariant ? "archive-variant-title" : "archive-product-title"} aria-describedby={archiveVariant ? "archive-variant-description" : "archive-product-description"} tabIndex={-1} onKeyDown={handleArchiveDialogKeyDown}>
            {archiveVariant ? <div><strong id="archive-variant-title">Varyantı arşivlemeyi onayla</strong><p id="archive-variant-description"><b>{archiveVariant.title}</b> aktif varyantlardan kaldırılacak.</p></div> : <div><strong id="archive-product-title">Ürünü arşivlemeyi onayla</strong><p id="archive-product-description"><b>{product.title}</b><br />Bu ürün mağazada görünmez olacaktır.<br /><br />Sipariş geçmişi korunacaktır.<br /><br />Bu işlem daha sonra geri alınabilir.</p></div>}
            <div className="confirmation-actions"><button ref={archiveCancelButtonRef} className="button button-secondary" type="button" onClick={closeArchiveDialog} disabled={busy !== ""}>Vazgeç</button>{archiveVariant ? <button className="button button-danger" type="button" onClick={() => void confirmVariantArchive()} disabled={busy !== ""}>{busy === `archive-${archiveVariant.id}` ? "Arşivleniyor…" : "Varyantı arşivle"}</button> : <button className="button button-danger" type="button" onClick={() => void confirmProductArchive()} disabled={busy !== ""}>{busy === "archive-product" ? "Arşivleniyor…" : "Ürünü arşivle"}</button>}</div>
          </div>
        </div>
      ) : null}
      {deleteDialogOpen && canDelete ? <PermanentDeleteDialog
        impact={deletionImpact}
        resourceLabel="Ürün"
        busy={busy === "delete-product"}
        onCancel={() => { if (busy !== "delete-product") { setDeleteDialogOpen(false); setDeletionImpact(undefined); actionMenuRef.current?.querySelector<HTMLElement>("summary")?.focus(); } }}
        onConfirm={deleteProduct}
      /> : null}
    </section>
  );
}
