"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { CatalogOnboardingOptions, CatalogProductEditorProjection, Product, ProductVariant } from "@celebix/saas-contracts";
import { Archive, ArrowLeft, Eye, Pencil, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";

import {
  CatalogApiError,
  catalogApi,
  type ProductDetailResult,
} from "@/lib/catalog-ui/client";
import {
  buildProductUpdatePayload,
  buildVariantCreatePayload,
  buildVariantUpdatePayload,
} from "@/lib/catalog-ui/forms";
import { formatTurkishMoney, formatTurkishMoneyInput } from "@/lib/catalog-ui/money";
import { ProductAdvancedEditor } from "@/components/catalog-onboarding/ProductAdvancedEditor";
import { CatalogOnboardingApiError, catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";
import { createDirtyEditorRegistry, createDirtyNavigationGuard } from "@/lib/catalog-ui/dirty-navigation";
import { ProductDescriptionField, ProductDescriptionPreview } from "./ProductDescriptionField";
import { ProductMediaManager, restoreArchiveFocus } from "./ProductMediaManager";

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

function VariantFields({ variant }: { variant?: ProductVariant }) {
  return (
    <div className="form-grid compact-form-grid">
      <label className="field field-wide"><span>Varyant adı <b>*</b></span><input name="title" required maxLength={200} defaultValue={variant?.title ?? ""} /></label>
      <label className="field"><span>SKU</span><input name="sku" maxLength={64} pattern="[A-Z0-9][A-Z0-9._-]{0,63}" defaultValue={variant?.sku ?? ""} /></label>
      <label className="field"><span>Barkod</span><input name="barcode" maxLength={128} defaultValue={variant?.barcode ?? ""} /></label>
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
}: Readonly<{ productId: string; canManage?: boolean; canArchive?: boolean }>) {
  const [detail, setDetail] = useState<ProductDetailResult>();
  const [onboarding, setOnboarding] = useState<Readonly<{ options: CatalogOnboardingOptions; editor: CatalogProductEditorProjection }>>();
  const [merchandisingState, setMerchandisingState] = useState<"loading" | "ready" | "error">("loading");
  const [merchandisingError, setMerchandisingError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [editingProduct, setEditingProduct] = useState(false);
  const [editingMerchandising, setEditingMerchandising] = useState(false);
  const [creatingVariant, setCreatingVariant] = useState(false);
  const [editingVariant, setEditingVariant] = useState<string>();
  const [archiveVariant, setArchiveVariant] = useState<ProductVariant>();
  const [archiveProduct, setArchiveProduct] = useState(false);
  const archiveDialogRef = useRef<HTMLDivElement>(null);
  const archiveCancelButtonRef = useRef<HTMLButtonElement>(null);
  const archiveTriggerRef = useRef<HTMLButtonElement>(null);
  const variantsHeadingRef = useRef<HTMLHeadingElement>(null);
  const wasArchiveDialogOpen = useRef(false);
  const dirtyEditorsRef = useRef(createDirtyEditorRegistry(["product", "variant-create", "variant-edit", "sales"] as const));

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
        setEditingMerchandising(false);
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

  function markDetailDirty(editor: "product" | "variant-create" | "variant-edit") {
    dirtyEditorsRef.current.mark(editor);
  }

  function canDiscardDetailChanges(editor?: "product" | "variant-create" | "variant-edit" | "sales") {
    const guard = createDirtyNavigationGuard({
      isDirty: () => editor === undefined ? dirtyEditorsRef.current.anyDirty() : dirtyEditorsRef.current.isDirty(editor),
      confirm: () => window.confirm("Kaydedilmemiş ürün değişiklikleriniz var. Bu düzenleyiciyi kapatmak istiyor musunuz?"),
    });
    if (!guard.canLeave()) return false;
    if (editor === undefined) dirtyEditorsRef.current.clearAll();
    else dirtyEditorsRef.current.clear(editor);
    return true;
  }

  function closeDetailEditors() {
    setEditingProduct(false);
    setEditingMerchandising(false);
    setCreatingVariant(false);
    setEditingVariant(undefined);
  }

  function openExclusiveEditor(editor: "product" | "variant-create" | "variant-edit" | "sales", variantId?: string) {
    if (!canDiscardDetailChanges()) return;
    closeDetailEditors();
    if (editor === "product") setEditingProduct(true);
    else if (editor === "variant-create") setCreatingVariant(true);
    else if (editor === "sales") setEditingMerchandising(true);
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
    setBusy(name);
    setError("");
    setNotice("");
    try { await action(); }
    catch (failure) {
      if (failure instanceof CatalogApiError && failure.code === "version_conflict") {
        setConflict(true);
        setError("Bu ürün sunucuda değişti. Yerel alanlarınız korunuyor; sunucu sürümünü yalnız siz seçerseniz yükleyeceğiz.");
      } else setError(safeMessage(failure));
    } finally { setBusy(""); }
  }

  async function loadServerSnapshot() {
    const replaced = await load();
    if (!replaced) return;
    dirtyEditorsRef.current.clearAll();
    setConflict(false);
    setError("");
    setEditingProduct(false);
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
      status: value(data, "status"), currency: value(data, "currency"),
    }, detail.product.version);
    if (!parsed.ok) { setError(parsed.message); return; }
    await mutation("product", async () => {
      const result = await catalogApi.updateProduct(productId, parsed.value);
      setDetail((current) => current && Object.freeze({ ...current, product: result.product }));
      dirtyEditorsRef.current.clear("product");
      setEditingProduct(false);
      setNotice("Ürün bilgileri güncellendi.");
    });
  }

  async function createVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || detail?.product.status === "archived") return;
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

  async function updateVariant(event: FormEvent<HTMLFormElement>, variant: ProductVariant) {
    event.preventDefault();
    if (!canManage || detail?.product.status === "archived") return;
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
    if (detail === undefined || !canArchive || detail.product.status === "archived") return;
    if (!canDiscardDetailChanges()) return;
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

  async function openStorefrontPreview() {
    const target=window.open("about:blank","_blank");if(target)target.opener=null;
    setBusy("preview");setError("");
    try{const response=await fetch(`/api/catalog/products/${productId}/preview`,{method:"POST",credentials:"same-origin"}),body=await response.json();if(!response.ok||typeof body.url!=="string")throw new Error();if(target)target.location.href=body.url;else window.location.assign(body.url);}
    catch{target?.close();setError("Mağaza önizlemesi oluşturulamadı. Ürünü ve mağaza alan adını kontrol edip yeniden deneyin.");}
    finally{setBusy("");}
  }

  if (loading) return <div className="catalog-loading page-loading" role="status"><span className="spinner" aria-hidden="true" /> Ürün ayrıntıları yükleniyor…</div>;
  if (detail === undefined) return <section className="catalog-page"><div className="feedback feedback-error" role="alert"><div><strong>Ürün açılamadı</strong><p>{error || "Ürün bulunamadı."}</p></div><button className="button button-secondary" type="button" onClick={() => { setLoading(true); void load(); }}>Tekrar dene</button></div></section>;

  const { product, variants } = detail;
  const archived = product.status === "archived";
  const statusLabel = product.status === "active" ? "Aktif" : archived ? "Arşivlenmiş" : "Taslak";
  const priceValues = variants.map((variant) => variant.priceCents);
  const compareAtValues = variants.flatMap((variant) => variant.compareAtCents === undefined ? [] : [variant.compareAtCents]);
  const trackedVariants = variants.filter((variant) => variant.stockTracking);
  const salePrice = priceValues.length === 0 ? "—" : formatTurkishMoney(Math.min(...priceValues), product.currency);
  const compareAtPrice = compareAtValues.length === 0 ? "—" : formatTurkishMoney(Math.min(...compareAtValues), product.currency);
  const stockValue = variants.length === 0
    ? "—"
    : trackedVariants.length === 0
      ? "Takip dışı"
      : `${trackedVariants.reduce((total, variant) => total + variant.stockQuantity, 0)} adet`;
  const primarySku = variants.find((variant) => variant.sku)?.sku;
  const updatedAt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(product.updatedAt));
  const readOnlySalesSettings = onboarding && !canManage ? (
    <section className="product-detail-section" aria-labelledby="read-only-sales-settings-title">
      <div className="product-detail-section-header"><div><span className="eyebrow">SATIŞ AYARLARI</span><h2 id="read-only-sales-settings-title">Satış ayarları</h2></div></div>
      <div className="feedback feedback-warning" role="status"><div><strong>Bu hesap yalnızca görüntüleme yetkisine sahiptir</strong><p>Ayarları inceleyebilirsiniz; değişiklik yapmak için owner, admin veya editor rolü gerekir.</p></div></div>
      <dl className="product-detail-facts" aria-label="Salt okunur satış ayarları">
        <div><dt>Ürün türü</dt><dd>{onboarding.editor.profile.productType === "physical" ? "Fiziksel" : "Dijital"}</dd></div>
        <div><dt>Minimum sipariş</dt><dd>{onboarding.editor.profile.minimumPurchaseQuantity}</dd></div>
        <div><dt>Maksimum sipariş</dt><dd>{onboarding.editor.profile.maximumPurchaseQuantity ?? "—"}</dd></div>
        <div><dt>Tedarikçi</dt><dd>{onboarding.editor.profile.supplierName ?? "—"}</dd></div>
        <div><dt>Google kategorisi</dt><dd>{onboarding.editor.profile.googleProductCategoryId ?? "—"}</dd></div>
        <div><dt>SEO başlığı</dt><dd>{onboarding.editor.profile.seoTitle ?? "—"}</dd></div>
        <div><dt>SEO açıklaması</dt><dd>{onboarding.editor.profile.seoDescription ?? "—"}</dd></div>
        <div><dt>Satış kanalları</dt><dd>{onboarding.options.channels.filter(({ id }) => onboarding.editor.channelIds.includes(id)).map(({ name }) => name).join(", ") || "—"}</dd></div>
        <div><dt>Kategoriler</dt><dd>{onboarding.options.categories.filter(({ id }) => onboarding.editor.categoryIds.includes(id)).map(({ name }) => name).join(", ") || "—"}</dd></div>
        <div><dt>Marka</dt><dd>{onboarding.options.resources.find(({ id }) => id === onboarding.editor.resourceIds.brand)?.name ?? "—"}</dd></div>
        <div><dt>Koleksiyonlar</dt><dd>{onboarding.options.resources.filter(({ id }) => onboarding.editor.resourceIds.collections.includes(id)).map(({ name }) => name).join(", ") || "—"}</dd></div>
        <div><dt>Etiketler</dt><dd>{onboarding.options.resources.filter(({ id }) => onboarding.editor.resourceIds.tags.includes(id)).map(({ name }) => name).join(", ") || "—"}</dd></div>
        <div><dt>Profil sürümü</dt><dd>v{onboarding.editor.profile.version}</dd></div>
      </dl>
    </section>
  ) : null;
  return (
    <section data-presentation="hemenaku-product-detail" className="catalog-page product-detail-workspace" aria-labelledby="product-title">
      <header className="detail-heading-row hemenaku-detail-hero product-detail-header">
        <div className="catalog-heading product-detail-heading">
          <Link className="back-link product-detail-back" href="/products"><ArrowLeft aria-hidden="true" /> Ürünlere dön</Link>
          <div className="heading-meta product-detail-heading-meta"><span className={`status-pill status-${product.status}`}>{statusLabel}</span><span className="version-badge">v{product.version}</span></div>
          <h1 id="product-title">{product.title}</h1>
          <p>{primarySku ? `SKU ${primarySku}` : "SKU eklenmemiş"}<span aria-hidden="true"> · </span>{product.currency}</p>
        </div>
        <div className="heading-actions product-detail-actions">
          {!archived ? <button className="button button-secondary" type="button" onClick={() => void openStorefrontPreview()} disabled={busy!==""}><Eye aria-hidden="true"/> {busy==="preview"?"Önizleme hazırlanıyor…":"Mağazada önizle"}</button>:null}
          {archived && canArchive ? <button className="button button-primary" type="button" onClick={() => void restoreProduct()} disabled={busy !== ""}><RotateCcw aria-hidden="true" /> {busy === "restore-product" ? "Geri yükleniyor…" : "Geri Yükle"}</button> : null}
          {!archived && canManage ? <button className="button button-secondary" type="button" onClick={() => { if (editingProduct) { if (canDiscardDetailChanges("product")) setEditingProduct(false); } else openExclusiveEditor("product"); }}><Pencil aria-hidden="true" /> Ürünü düzenle</button> : null}
          {!archived ? <button className="button button-secondary" type="button" onClick={() => { if (merchandisingState === "error") void reloadMerchandising(); else if (merchandisingState === "ready") { if (canManage) openExclusiveEditor("sales"); else setEditingMerchandising(true); } }} disabled={merchandisingState === "loading"}><SlidersHorizontal aria-hidden="true" /> {merchandisingState === "loading" ? "Yükleniyor…" : "Satış ayarları"}</button> : null}
          {!archived && canArchive ? <button className="button button-quiet-danger" type="button" onClick={(event) => { if (!canDiscardDetailChanges()) return; closeDetailEditors(); archiveTriggerRef.current = event.currentTarget; setArchiveProduct(true); }}><Archive aria-hidden="true" /> Arşivle</button> : null}
        </div>
      </header>

      {archived ? <div className="feedback feedback-warning product-archive-banner" role="status"><div><strong>Ürün arşivlenmiş</strong><p>Bu ürün mağazada ve yayın akışında görünmez. Sipariş geçmişi, medya ve analiz verileri korunur.</p></div></div> : null}

      <dl className="product-detail-facts" aria-label="Ürün hızlı özeti">
        <div><dt>Satış fiyatı</dt><dd>{salePrice}</dd></div>
        <div><dt>Karşılaştırma</dt><dd>{compareAtPrice}</dd></div>
        <div><dt>Takipli stok</dt><dd>{stockValue}</dd></div>
        <div><dt>Varyant</dt><dd>{variants.length}</dd></div>
        <div className="product-detail-fact-updated"><dt>Son güncelleme</dt><dd><time dateTime={product.updatedAt}>{updatedAt}</time></dd></div>
        <div><dt>Durum</dt><dd><span className={`status-pill status-${product.status}`}>{statusLabel}</span></dd></div>
      </dl>

      {error ? <div className="feedback feedback-error" role="alert"><div><strong>İşlem tamamlanamadı</strong><p>{error}</p></div>{conflict ? <button className="button button-secondary" type="button" onClick={() => void loadServerSnapshot()}>Sunucudaki sürümü yükle</button> : null}</div> : null}
      {merchandisingState === "error" ? <div className="feedback feedback-error" role="alert"><div><strong>Yüklenemedi — Tekrar dene</strong><p>Satış ayarları yüklenemedi. {merchandisingError}</p></div><button className="button button-secondary" type="button" onClick={() => void reloadMerchandising()}>Tekrar dene</button></div> : null}
      {notice ? <div className="feedback feedback-success" role="status"><div><strong>Bilgi</strong><p>{notice}</p></div></div> : null}

      <section className="product-detail-section product-detail-description" aria-labelledby="product-fields-title">
        <div className="product-detail-section-header">
          <div><span className="eyebrow">ÜRÜN BİLGİLERİ</span><h2 id="product-fields-title">{editingProduct ? "Ürün bilgilerini düzenle" : "Açıklama"}</h2></div>
        </div>
        {editingProduct && canManage && !archived ? (
          <form className="catalog-form inset-form product-detail-edit-form" onSubmit={updateProduct} onChange={() => markDetailDirty("product")} key={product.version}>
          <fieldset disabled={busy !== ""}>
            <legend><span>01</span><span><strong>Ürün Bilgileri</strong><small>Güncel sürüm: v{product.version}</small></span></legend>
            <div className="form-grid">
              <label className="field field-wide"><span>Ürün adı <b>*</b></span><input name="title" required maxLength={200} defaultValue={product.title} /></label>
              <label className="field"><span>Durum <b>*</b></span><select name="status" defaultValue={product.status}><option value="draft">Taslak</option><option value="active">Aktif</option></select></label>
              <label className="field"><span>Para birimi</span><select name="currency" defaultValue={product.currency}><option value="TRY">TRY — Türk lirası</option></select></label>
              <ProductDescriptionField className="field field-wide" rows={4} defaultValue={product.description ?? ""} onValueChange={() => markDetailDirty("product")} />
            </div>
          </fieldset>
          <div className="form-actions"><button className="button button-secondary" type="button" onClick={() => { if (canDiscardDetailChanges("product")) setEditingProduct(false); }}>Vazgeç</button><button className="button button-primary" type="submit" disabled={busy !== ""}>{busy === "product" ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button></div>
          </form>
        ) : (
          <div className="product-detail-description-content"><ProductDescriptionPreview source={product.description} emptyMessage="Bu ürün için açıklama eklenmemiş." /></div>
        )}
      </section>

      {editingMerchandising && onboarding && !archived ? canManage ? <section aria-label="Ürün satış ayarları"><ProductAdvancedEditor
          key={onboarding.editor.profile.version}
          options={onboarding.options}
          editor={onboarding.editor}
          onCancel={() => { dirtyEditorsRef.current.clear("sales"); setEditingMerchandising(false); }}
          onUpdated={() => void reloadMerchandising(true)}
          onConflictReload={() => reloadMerchandising()}
          onDirtyChange={(dirty) => { if (dirty) dirtyEditorsRef.current.mark("sales"); else dirtyEditorsRef.current.clear("sales"); }}
        /></section> : readOnlySalesSettings : null}

      <ProductMediaManager productId={productId} canManage={canManage && !archived} canArchive={canArchive} />

      <section className="variant-list product-detail-section product-detail-variants" aria-labelledby="variants-title">
      <div className="section-heading-row product-detail-section-header">
        <div><span className="eyebrow">SATIŞ SEÇENEKLERİ</span><h2 ref={variantsHeadingRef} tabIndex={-1} id="variants-title">Varyantlar</h2><p>SKU, fiyat ve stok bilgilerini ayrı ayrı yönetin.</p></div>
        {canManage && !archived ? <button className="button button-primary product-detail-primary-action" type="button" onClick={() => openExclusiveEditor("variant-create")} disabled={creatingVariant}><Plus aria-hidden="true" /> Yeni varyant</button> : null}
      </div>

      {creatingVariant && canManage && !archived ? (
        <form className="catalog-form inset-form" onSubmit={createVariant} onChange={() => markDetailDirty("variant-create")}>
          <fieldset disabled={busy !== ""}><legend><span>＋</span><span><strong>Yeni varyant</strong><small>Ürüne yeni bir satış seçeneği ekleyin</small></span></legend><VariantFields /></fieldset>
          <div className="form-actions"><button className="button button-secondary" type="button" onClick={() => { if (canDiscardDetailChanges("variant-create")) setCreatingVariant(false); }}>Vazgeç</button><button className="button button-primary" type="submit" disabled={busy !== ""}>{busy === "new-variant" ? "Oluşturuluyor…" : "Varyantı oluştur"}</button></div>
        </form>
      ) : null}

      <div className="variant-list product-detail-variant-rows">
        {variants.length === 0 ? <div className="empty-variants"><strong>Aktif varyant yok</strong><p>Ürünü satışa hazırlamak için bir varyant ekleyin.</p></div> : variants.map((variant) => (
          <article className="variant-card product-detail-variant-row" key={variant.id}>
            <div className="variant-card-heading">
              <div><span className="variant-mark" aria-hidden="true">V</span><span><strong>{variant.title}</strong><small>{variant.sku ? `SKU ${variant.sku}` : "SKU eklenmemiş"}{variant.barcode ? ` · ${variant.barcode}` : ""}</small></span></div>
              <span className="version-badge">v{variant.version}</span>
            </div>
            {editingVariant === variant.id && canManage && !archived ? (
              <form onSubmit={(event) => void updateVariant(event, variant)} onChange={() => markDetailDirty("variant-edit")} key={variant.version}>
                <fieldset disabled={busy !== ""}><VariantFields variant={variant} /></fieldset>
                <div className="form-actions"><button className="button button-secondary" type="button" onClick={() => { if (canDiscardDetailChanges("variant-edit")) setEditingVariant(undefined); }}>Vazgeç</button><button className="button button-primary" type="submit" disabled={busy !== ""}>{busy === `variant-${variant.id}` ? "Kaydediliyor…" : "Varyantı kaydet"}</button></div>
              </form>
            ) : (
              <>
                <div className="variant-metrics">
                  <span><small>Satış fiyatı</small><strong>{formatTurkishMoney(variant.priceCents, product.currency)}</strong></span>
                  <span><small>Karşılaştırma</small><strong>{variant.compareAtCents === undefined ? "—" : formatTurkishMoney(variant.compareAtCents, product.currency)}</strong></span>
                  <span><small>Stok</small><strong>{variant.stockTracking ? `${variant.stockQuantity} adet` : "Takip dışı"}</strong></span>
                </div>
                <div className="variant-actions">{canManage && !archived ? <button className="button button-secondary" type="button" onClick={() => openExclusiveEditor("variant-edit", variant.id)}>Düzenle</button> : null}{canArchive && !archived ? <button className="text-danger-button" type="button" onClick={(event) => { if (!canDiscardDetailChanges()) return; closeDetailEditors(); archiveTriggerRef.current = event.currentTarget; setArchiveVariant(variant); }}>Arşivle</button> : null}</div>
              </>
            )}
          </article>
        ))}
      </div>
      </section>

      {archiveDialogOpen && canArchive && !archived ? (
        <div className="archive-dialog-layer">
          <div ref={archiveDialogRef} className="archive-dialog" role="alertdialog" aria-modal="true" aria-labelledby={archiveVariant ? "archive-variant-title" : "archive-product-title"} aria-describedby={archiveVariant ? "archive-variant-description" : "archive-product-description"} tabIndex={-1} onKeyDown={handleArchiveDialogKeyDown}>
            {archiveVariant ? <div><strong id="archive-variant-title">Varyantı arşivlemeyi onayla</strong><p id="archive-variant-description"><b>{archiveVariant.title}</b> aktif varyantlardan kaldırılacak.</p></div> : <div><strong id="archive-product-title">Ürünü arşivlemeyi onayla</strong><p id="archive-product-description"><b>{product.title}</b><br />Bu ürün mağazada görünmez olacaktır.<br /><br />Sipariş geçmişi korunacaktır.<br /><br />Bu işlem daha sonra geri alınabilir.</p></div>}
            <div className="confirmation-actions"><button ref={archiveCancelButtonRef} className="button button-secondary" type="button" onClick={closeArchiveDialog} disabled={busy !== ""}>Vazgeç</button>{archiveVariant ? <button className="button button-danger" type="button" onClick={() => void confirmVariantArchive()} disabled={busy !== ""}>{busy === `archive-${archiveVariant.id}` ? "Arşivleniyor…" : "Varyantı arşivle"}</button> : <button className="button button-danger" type="button" onClick={() => void confirmProductArchive()} disabled={busy !== ""}>{busy === "archive-product" ? "Arşivleniyor…" : "Ürünü arşivle"}</button>}</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
