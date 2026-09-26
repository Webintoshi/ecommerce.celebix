"use client";

import Link from "next/link";
import { ImagePlus, Package, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { CatalogOnboardingOptions, CatalogOnboardingResult } from "@celebix/saas-contracts";

import {
  CatalogOnboardingApiError,
  catalogOnboardingClient,
} from "@/lib/catalog-onboarding-ui/client";
import { buildCatalogCategoryHierarchy } from "@/lib/catalog-onboarding-ui/category-tree";
import { buildQuickCreateIntent, parseTurkishMoneyToCents } from "@/lib/catalog-onboarding-ui/forms";
import { SkuInput } from "@/components/catalog/SkuInput";
import { BarcodeInput } from "@/components/catalog/BarcodeInput";
import { ProductMeasurementFields } from "@/components/catalog/ProductMeasurementFields";
import type { ProductMeasurementDraft } from "@/lib/catalog-ui/product-measurements";
import { completeProductMedia, type ProductMediaSelection } from "@/lib/catalog-onboarding-ui/media-completion";
import { ProductMediaApiError, productMediaApi } from "@/lib/catalog-ui/media-client";
import {
  mergeQuickProductDraft,
  quickDraftRequiresDetailedSave,
  type ProductDraftSession,
} from "@/lib/catalog-ui/product-draft-session";

import styles from "./product-onboarding.module.css";
import workspace from "./product-create-quick.module.css";

type OnboardingApi = Pick<typeof catalogOnboardingClient, "createProduct" | "publishAfterMedia" | "getProductEditor">;
type MediaApi = Pick<typeof productMediaApi, "upload">;

export type ProductQuickCreateDialogProps = Readonly<{
  open: boolean;
  options: CatalogOnboardingOptions | null;
  onClose(): void;
  onCreated(result: CatalogOnboardingResult): void;
  onAdvanced(): void;
  mode?: "dialog" | "page";
  api?: OnboardingApi;
  mediaClient?: MediaApi;
  draftSession?: ProductDraftSession;
  returnFocusTarget?: HTMLElement | null;
  onDraftSessionChange?(session: ProductDraftSession): void;
  onBusyChange?(busy: boolean): void;
  onCreatedProductChange?(productId: string): void;
}>;

type Recovery = Readonly<{
  created: CatalogOnboardingResult;
  files: readonly ProductMediaSelection[];
  publish: boolean;
}>;

type SelectedImage = Readonly<{ file: File; altText: string; preview: string }>;

const ACCEPTED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp"]);

function field(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

function safeMessage(error: unknown): string {
  return error instanceof CatalogOnboardingApiError || error instanceof ProductMediaApiError
    ? error.message
    : "Ürün oluşturulamadı. Lütfen yeniden deneyin.";
}

export function ProductQuickCreateDialog({
  open,
  options,
  onClose,
  onCreated,
  onAdvanced,
  mode = "dialog",
  api = catalogOnboardingClient,
  mediaClient = productMediaApi,
  draftSession,
  returnFocusTarget,
  onDraftSessionChange,
  onBusyChange,
  onCreatedProductChange,
}: ProductQuickCreateDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [images, setImages] = useState<readonly SelectedImage[]>(draftSession?.current.media ?? []);
  const [progress, setProgress] = useState(0);
  const [recovery, setRecovery] = useState<Recovery>();
  const [createdProductId, setCreatedProductId] = useState<string>();
  const [categoryId, setCategoryId] = useState(draftSession?.current.categoryIds[0] ?? "");
  const [title, setTitle] = useState(draftSession?.current.title ?? "");
  const [price, setPrice] = useState(draftSession?.current.variants[0]?.price ?? "");
  const [sku, setSku] = useState(draftSession?.current.variants[0]?.sku ?? "");
  const [barcode, setBarcode] = useState(draftSession?.current.variants[0]?.barcode ?? "");
  const [measurements, setMeasurements] = useState<ProductMeasurementDraft>(draftSession?.current.variants[0]?.measurements ?? {});
  const [showMeasurementValidation, setShowMeasurementValidation] = useState(false);
  const [barcodeBusy, setBarcodeBusy] = useState(false);
  const [stockQuantity, setStockQuantity] = useState(draftSession?.current.variants[0]?.stockQuantity ?? "0");
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const barcodeIdentityRef = useRef({});
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const submittingRef = useRef(false);
  const createdProductIdRef = useRef<string | undefined>(undefined);
  const previewUrlsRef = useRef<readonly string[]>([]);
  const categoryHierarchy = buildCatalogCategoryHierarchy(options?.categories ?? []);
  const categoryRows = categoryHierarchy.valid ? categoryHierarchy.rows : [];
  const hasVariantDraft = draftSession !== undefined && (draftSession.current.kind === "variant" || draftSession.current.variants.length > 1 || draftSession.current.variants.some((variant) => Object.keys(variant.attributes).length > 0));
  const requiresDetailed = draftSession !== undefined && quickDraftRequiresDetailedSave(draftSession.current, options?.channels.filter((channel) => channel.kind === "storefront").map(({ id }) => id));

  useEffect(() => { onBusyChange?.(submitting || barcodeBusy); }, [submitting, barcodeBusy, onBusyChange]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = returnFocusTarget ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    titleRef.current?.focus();
    return () => { if (returnFocusRef.current?.isConnected) returnFocusRef.current?.focus(); };
  }, [open, returnFocusTarget]);

  useEffect(() => {
    if (!submitting) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [submitting]);

  useEffect(() => () => {
    if (onDraftSessionChange === undefined) for (const preview of previewUrlsRef.current) URL.revokeObjectURL(preview);
  }, [onDraftSessionChange]);

  useEffect(() => {
    if (draftSession === undefined || onDraftSessionChange === undefined) return;
    onDraftSessionChange(mergeQuickProductDraft(draftSession, { title, price, sku, barcode, measurements, stockQuantity, categoryId, media: images }));
  // The parent replaces draftSession after each projection; local fields are the source for this handoff.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, price, sku, barcode, measurements, stockQuantity, categoryId, images, onDraftSessionChange]);

  function requestClose() {
    if (submittingRef.current && !window.confirm("Ürün kaydı sürüyor. Yine de kapatmak istiyor musunuz?")) return;
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (mode === "page") return;
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    if (focusable.length === 0) { event.preventDefault(); dialogRef.current?.focus(); return; }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  }

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length === 0 || createdProductIdRef.current) return;
    setError("");
    setRecovery(undefined);
    setProgress(0);
    if (images.length + files.length > 16 || files.some((file) => !ACCEPTED_MEDIA.has(file.type) || file.size < 1 || file.size > 5_242_880)) {
      setError("En fazla 16 adet PNG, JPEG veya WebP görsel seçin; her dosya en fazla 5 MB olabilir.");
      return;
    }
    const next = Object.freeze([...images, ...files.map((file) => Object.freeze({ file, altText: "", preview: URL.createObjectURL(file) }))]);
    previewUrlsRef.current = Object.freeze(next.map(({ preview }) => preview));
    setImages(next);
  }

  function changeAltText(index: number, altText: string) {
    setImages((current) => Object.freeze(current.map((image, position) => position === index ? Object.freeze({ ...image, altText }) : image)));
  }

  async function completeMedia(created: CatalogOnboardingResult, files: readonly ProductMediaSelection[], publish: boolean) {
    return completeProductMedia({
      result: created, files, publish,
      upload: (productId, input) => mediaClient.upload(productId, input),
      complete: (productId, input) => api.publishAfterMedia(productId, input),
      recover: (productId) => api.getProductEditor(productId),
      onProgress: ({ index, count, value }) => setProgress(Math.round(((index + value / 100) / Math.max(1, count)) * 100)),
    });
  }

  function finish(outcome: Awaited<ReturnType<typeof completeMedia>>, publish: boolean, files: readonly ProductMediaSelection[]) {
    if (outcome.kind === "published" || outcome.kind === "draft") { onCreated(outcome.result); return; }
    if (outcome.kind === "published_recovered") {
      const projection = outcome.projection;
      onCreated(Object.freeze({ ...projection, variants: Object.freeze(projection.variants.map(({ variant }) => variant)), replayed: false }));
      return;
    }
    if (outcome.kind === "draft_media_failed") {
      setCreatedProductId(outcome.result.product.id);
      setRecovery(Object.freeze({
        created: Object.freeze({ ...outcome.result, mediaCount: outcome.result.mediaCount + outcome.uploadedCount }),
        files: Object.freeze(files.slice(outcome.uploadedCount)),
        publish,
      }));
      setError("Ürün taslağı kaydedildi. Yüklenemeyen görselleri yeniden dene veya ürünü aç.");
      return;
    }
    setCreatedProductId(outcome.result.product.id);
    setError("Taslak kaydedildi. Satış durumunu ürünü açarak kontrol et.");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || barcodeBusy || createdProductIdRef.current) return;
    if (requiresDetailed) { setError("Ayrıntıların korunuyor. Kaydı detaylı formdan tamamla."); return; }
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!categoryHierarchy.valid) { setError("Kategori seçenekleri şu anda kullanılamıyor."); return; }
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const publish = submitter instanceof HTMLButtonElement && submitter.value === "publish";
    setShowMeasurementValidation(true);
    const parsed = buildQuickCreateIntent({
      title: field(data, "title"),
      sku,
      barcode,
      measurements,
      channelIds: options?.channels.filter((channel) => channel.kind === "storefront").map(({ id }) => id) ?? [],
      price: field(data, "price"),
      publish,
      stockQuantity: field(data, "stockQuantity"),
      categoryId: field(data, "categoryId"),
    });
    if (!parsed.ok) {
      setError(parsed.error);
      if (!title.trim()) titleRef.current?.focus();
      else if (parseTurkishMoneyToCents(price) === null) priceRef.current?.focus();
      else if (publish && !categoryId) categoryRef.current?.focus();
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setRecovery(undefined);
    setError("");
    setProgress(0);
    try {
      const created = await api.createProduct(parsed.value);
      createdProductIdRef.current = created.product.id;
      setCreatedProductId(created.product.id);
      onCreatedProductChange?.(created.product.id);
      const files = Object.freeze(images.map(({ file, altText }) => Object.freeze({ file, altText: altText.trim() })));
      finish(await completeMedia(created, files, publish), publish, files);
    } catch (failure) {
      setError(safeMessage(failure));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function retryMedia() {
    if (recovery === undefined || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    setProgress(0);
    try {
      const selected = recovery;
      setRecovery(undefined);
      finish(await completeMedia(selected.created, selected.files, selected.publish), selected.publish, selected.files);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (!open) return null;
  const content = (
    <div
      ref={dialogRef}
      className={`${styles.dialog} ${mode === "page" ? styles.page : ""} ${workspace.workspace}`}
      role={mode === "dialog" ? "dialog" : "region"}
      aria-modal={mode === "dialog" ? "true" : undefined}
      aria-labelledby="quick-product-title"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <h2 id="quick-product-title" className={workspace.srOnly}>Hızlı ürün ekle</h2>
      {mode === "dialog" ? <button className={`${styles.iconButton} ${workspace.close}`} type="button" onClick={requestClose} aria-label="Ürün ekleme penceresini kapat"><X aria-hidden="true" /></button> : null}

      <form className={styles.form} onSubmit={submit} noValidate>
        {error ? <div className={styles.error} role="alert"><strong>{recovery ? "Taslak güvende" : "Formu kontrol edin"}</strong><span>{error}</span></div> : null}
        {!categoryHierarchy.valid ? <div className={styles.error} role="alert">Kategori seçenekleri şu anda kullanılamıyor.</div> : null}
        <fieldset disabled={submitting || options === null || Boolean(createdProductId)} className={workspace.layout}>
          <div className={workspace.mediaColumn}>
            <div className={workspace.cover}>{images[0] ? <img src={images[0].preview} alt={images[0].altText || "Ürün görseli"} /> : <Package aria-hidden="true" />}</div>
            <span>Görseller · {images.length}</span>
            <button type="button" className={workspace.mediaButton} onClick={() => imageInputRef.current?.click()}><ImagePlus aria-hidden="true" />Görsel ekle</button>
            <input ref={imageInputRef} type="file" tabIndex={-1} className={workspace.srOnly} multiple accept="image/jpeg,image/png,image/webp" onChange={selectImage} aria-label="Ürün görselleri seç" />
            <small>JPG, PNG, WebP · 5 MB · en fazla 16</small>
            {images.length > 1 ? <div className={workspace.thumbnails}>{images.slice(1).map((image, index) => <img key={`${image.file.name}-${index}`} src={image.preview} alt={image.altText || `${index + 2}. ürün görseli`} />)}</div> : null}
          </div>
          <div className={workspace.fields}>
          <label className={styles.wide}><span>Ürün adı <b>*</b></span><input ref={titleRef} name="title" required maxLength={200} autoFocus placeholder="Ürün adı" autoComplete="off" value={title} onChange={(event) => setTitle(event.currentTarget.value)} /></label>
          {hasVariantDraft ? <div className={workspace.variantSummary}><strong>{draftSession?.current.variants.length ?? 0} varyant</strong><button type="button" onClick={onAdvanced}>Varyantları düzenle</button></div> : <>
          <label><span>Satış fiyatı <b>*</b></span><div className={styles.money}><input ref={priceRef} name="price" required inputMode="decimal" placeholder="0,00" value={price} onChange={(event) => setPrice(event.currentTarget.value)} /><span>₺</span></div></label>
          <label><span>Stok adedi</span><input name="stockQuantity" inputMode="numeric" pattern="(?:0|[1-9][0-9]*)" value={stockQuantity} onChange={(event) => setStockQuantity(event.currentTarget.value)} /></label>
          <div className={workspace.identifiers}><SkuInput skuPrefix={options?.skuPrefix} value={sku} onChange={setSku} /><BarcodeInput value={barcode} onChange={setBarcode} reservationIdentity={barcodeIdentityRef.current} actionLabel="Oluştur" onBusyChange={setBarcodeBusy} /></div>
          <ProductMeasurementFields value={measurements} onChange={setMeasurements} showValidation={showMeasurementValidation} />
          </>}
          <label className={styles.wide}>
            <span>Kategori</span>
            <select ref={categoryRef} name="categoryId" required value={categoryId} onChange={(event) => setCategoryId(event.currentTarget.value)} disabled={!categoryRows.length || (draftSession?.current.categoryIds.length ?? 0) > 1} aria-describedby="quick-category-hint">
              <option value="">Kategori seçin</option>{categoryRows.map(({ category, label }) => <option key={category.id} value={category.id}>{label}</option>)}
            </select>
            <small id="quick-category-hint" className={styles.fieldHint}>Satışa açmak için gerekli</small>
          </label>
          {images.length ? <div className={`${styles.previewList} ${styles.wide}`}>{images.map((image, index) => <div className={styles.preview} key={`${image.file.name}-${index}`}><img src={image.preview} alt={`${index + 1}. yüklenecek ürün görseli önizlemesi`} /><label><span>{index + 1}. görsel alt metni</span><input maxLength={500} value={image.altText} onChange={(event) => changeAltText(index, event.target.value)} placeholder="Ürün görselini kısaca anlatın" /></label></div>)}</div> : null}
          {submitting && images.length ? <div className={`${styles.progress} ${styles.wide}`} role="status"><span>Görseller yükleniyor</span><progress max="100" value={progress}>{progress}%</progress><b>{progress}%</b></div> : null}
          </div>
        </fieldset>

        {options === null ? <p className={styles.loading} role="status">Ürün seçenekleri yükleniyor…</p> : null}
        {requiresDetailed ? <div className={workspace.detailedNotice} role="status"><span>Ayrıntıların korunuyor. Kaydı detaylı formdan tamamla.</span><button type="button" onClick={onAdvanced} disabled={submitting || barcodeBusy}>Detaylı forma dön</button></div> : null}
        {!requiresDetailed && (!title.trim() || parseTurkishMoneyToCents(price) === null || !categoryId) ? <p className={workspace.readiness}>Satışa açmak için: {[!title.trim() ? "Ürün adı" : "", parseTurkishMoneyToCents(price) === null ? "Fiyat" : "", !categoryId ? "Kategori" : ""].filter(Boolean).join(" · ")}</p> : null}
        <div className={styles.actions}>
          {recovery ? <button type="button" className={styles.secondary} onClick={() => void retryMedia()} disabled={submitting}>Görselleri yeniden yükle</button> : null}
          {createdProductId ? <Link className={styles.secondary} href={`/products/${createdProductId}`}>Ürüne git</Link> : null}
          {mode === "dialog" ? <button type="button" className={styles.advanced} onClick={onAdvanced} disabled={submitting || barcodeBusy}>Gelişmiş ürün eklemeye geç</button> : <button type="button" className={workspace.cancel} onClick={requestClose} disabled={submitting || barcodeBusy}>Vazgeç</button>}
          <button type="submit" name="intent" value="draft" className={styles.secondary} disabled={submitting || barcodeBusy || options === null || requiresDetailed || Boolean(createdProductId)}>Taslak kaydet</button>
          <button type="submit" name="intent" value="publish" className={styles.primary} disabled={submitting || barcodeBusy || options === null || requiresDetailed || Boolean(createdProductId)}>{submitting ? "Kaydediliyor…" : "Kaydet ve satışa aç"}</button>
        </div>
      </form>
    </div>
  );

  if (mode === "page") return <section className={styles.pageShell}>{content}</section>;
  return <div className={styles.backdrop} onMouseDown={(event: MouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) requestClose(); }}>{content}</div>;
}
