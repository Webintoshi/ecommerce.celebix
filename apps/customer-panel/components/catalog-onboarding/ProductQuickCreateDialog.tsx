"use client";

import Link from "next/link";
import { ImagePlus, PackagePlus, X } from "lucide-react";
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
import { buildQuickCreateIntent } from "@/lib/catalog-onboarding-ui/forms";
import { completeProductMedia, type ProductMediaSelection } from "@/lib/catalog-onboarding-ui/media-completion";
import { ProductMediaApiError, productMediaApi } from "@/lib/catalog-ui/media-client";

import styles from "./product-onboarding.module.css";

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
}: ProductQuickCreateDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [images, setImages] = useState<readonly SelectedImage[]>([]);
  const [progress, setProgress] = useState(0);
  const [recovery, setRecovery] = useState<Recovery>();
  const [createdProductId, setCreatedProductId] = useState<string>();
  const [categoryId, setCategoryId] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const submittingRef = useRef(false);
  const previewUrlsRef = useRef<readonly string[]>([]);
  const categoryHierarchy = buildCatalogCategoryHierarchy(options?.categories ?? []);
  const categoryRows = categoryHierarchy.valid ? categoryHierarchy.rows : [];

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleRef.current?.focus();
    return () => { if (returnFocusRef.current?.isConnected) returnFocusRef.current?.focus(); };
  }, [open]);

  useEffect(() => {
    if (!submitting) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [submitting]);

  useEffect(() => () => { for (const preview of previewUrlsRef.current) URL.revokeObjectURL(preview); }, []);

  function requestClose() {
    if (submittingRef.current && !window.confirm("Ürün kaydı sürüyor. Yine de kapatmak istiyor musunuz?")) return;
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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
    setError("");
    setRecovery(undefined);
    setProgress(0);
    if (files.length > 16 || files.some((file) => !ACCEPTED_MEDIA.has(file.type) || file.size < 1 || file.size > 5_242_880)) {
      event.currentTarget.value = "";
      setError("En fazla 16 adet PNG, JPEG veya WebP görsel seçin; her dosya en fazla 5 MB olabilir.");
      return;
    }
    for (const preview of previewUrlsRef.current) URL.revokeObjectURL(preview);
    const next = Object.freeze(files.map((file) => Object.freeze({ file, altText: "", preview: URL.createObjectURL(file) })));
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
      setRecovery(Object.freeze({ created: outcome.result, files, publish }));
      setError("Ürün oluşturuldu, bazı görseller yüklenemedi. Taslak güvenli şekilde saklandı. İkinci yazma yapılmadı; isterseniz görselleri yeniden yükleyebilir veya ürüne gidebilirsiniz.");
      return;
    }
    setCreatedProductId(outcome.result.product.id);
    setError("Ürün taslağı oluşturuldu ancak satışa açıldığı doğrulanamadı. İkinci yazma yapılmadı; ürünü açıp durumu kontrol edin.");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!categoryHierarchy.valid) { setError("Kategori seçenekleri şu anda kullanılamıyor."); return; }
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const publish = submitter instanceof HTMLButtonElement && submitter.value === "publish";
    const parsed = buildQuickCreateIntent({
      title: field(data, "title"),
      price: field(data, "price"),
      publish,
      stockQuantity: field(data, "stockQuantity"),
      categoryId: field(data, "categoryId"),
    });
    if (!parsed.ok) { setError(parsed.error); return; }

    submittingRef.current = true;
    setSubmitting(true);
    setRecovery(undefined);
    setError("");
    setProgress(0);
    try {
      const created = await api.createProduct(parsed.value);
      setCreatedProductId(created.product.id);
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
      className={`${styles.dialog} ${mode === "page" ? styles.page : ""}`}
      role={mode === "dialog" ? "dialog" : "region"}
      aria-modal={mode === "dialog" ? "true" : undefined}
      aria-labelledby="quick-product-title"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <header className={styles.header}>
        <span className={styles.icon}><PackagePlus aria-hidden="true" /></span>
        <div><span className={styles.eyebrow}>HIZLI ÜRÜN</span><h2 id="quick-product-title">Yeni ürün ekle</h2><p>Ürün adı ve fiyatıyla yaklaşık 60 saniyede başlayın.</p></div>
        {mode === "dialog" ? <button className={styles.iconButton} type="button" onClick={requestClose} aria-label="Ürün ekleme penceresini kapat"><X aria-hidden="true" /></button> : null}
      </header>

      <form className={styles.form} onSubmit={submit} noValidate>
        {error ? <div className={styles.error} role="alert"><strong>{recovery ? "Taslak güvende" : "Formu kontrol edin"}</strong><span>{error}</span></div> : null}
        {!categoryHierarchy.valid ? <div className={styles.error} role="alert">Kategori seçenekleri şu anda kullanılamıyor.</div> : null}
        <fieldset disabled={submitting || options === null}>
          <label className={styles.wide}><span>Ürün adı <b>*</b></span><input ref={titleRef} name="title" required maxLength={200} autoFocus placeholder="Örn. Seramik kahve kupası" autoComplete="off" /></label>
          <label><span>Satış fiyatı <b>*</b></span><div className={styles.money}><input name="price" required inputMode="decimal" placeholder="0,00" /><span>₺</span></div></label>
          <label><span>Stok adedi</span><input name="stockQuantity" inputMode="numeric" pattern="(?:0|[1-9][0-9]*)" defaultValue="0" /></label>
          <label className={styles.wide}>
            <span>Kategori (satışa açmak için zorunlu)</span>
            <select name="categoryId" required value={categoryId} onChange={(event) => setCategoryId(event.currentTarget.value)} disabled={!categoryRows.length}>
              <option value="">Kategori seçin</option>{categoryRows.map(({ category, label }) => <option key={category.id} value={category.id}>{label}</option>)}
            </select>
            <small className={styles.fieldHint}>Kategori seçmeden satışa açılmaz; ürün vitrinde doğru koleksiyona bağlanır.</small>
          </label>
          {categoryRows.length ? (
            <div className={`${styles.categoryChips} ${styles.wide}`} role="group" aria-label="Hızlı kategori seçimi">
              {categoryRows.slice(0, 8).map(({ category, label }) => (
                <button
                  key={category.id}
                  type="button"
                  className={`${styles.categoryChip} ${categoryId === category.id ? styles.categoryChipActive : ""}`}
                  aria-pressed={categoryId === category.id}
                  onClick={() => setCategoryId(category.id)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          <label className={`${styles.media} ${styles.wide}`}><ImagePlus aria-hidden="true" /><span>{images.length ? `${images.length} görsel seçildi` : "İsteğe bağlı görseller seç"}<small>PNG, JPEG veya WebP · en fazla 16 dosya · dosya başına 5 MB</small></span><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={selectImage} /></label>
          {images.length ? <div className={`${styles.previewList} ${styles.wide}`}>{images.map((image, index) => <div className={styles.preview} key={`${image.file.name}-${index}`}><img src={image.preview} alt={`${index + 1}. yüklenecek ürün görseli önizlemesi`} /><label><span>{index + 1}. görsel alt metni</span><input maxLength={500} value={image.altText} onChange={(event) => changeAltText(index, event.target.value)} placeholder="Ürün görselini kısaca anlatın" /></label></div>)}</div> : null}
          {submitting && images.length ? <div className={`${styles.progress} ${styles.wide}`} role="status"><span>Görseller yükleniyor</span><progress max="100" value={progress}>{progress}%</progress><b>{progress}%</b></div> : null}
        </fieldset>

        {options === null ? <p className={styles.loading} role="status">Ürün seçenekleri yükleniyor…</p> : null}
        <div className={styles.actions}>
          {recovery ? <button type="button" className={styles.secondary} onClick={() => void retryMedia()} disabled={submitting}>Görselleri yeniden yükle</button> : null}
          {createdProductId ? <Link className={styles.secondary} href={`/products/${createdProductId}`}>Ürüne git</Link> : null}
          <button type="button" className={styles.advanced} onClick={onAdvanced} disabled={submitting}>Gelişmiş ürün eklemeye geç</button>
          <button type="submit" name="intent" value="draft" className={styles.secondary} disabled={submitting || options === null}>Taslak kaydet</button>
          <button type="submit" name="intent" value="publish" className={styles.primary} disabled={submitting || options === null}>{submitting ? "Kaydediliyor…" : "Kaydet ve satışa aç"}</button>
        </div>
      </form>
    </div>
  );

  if (mode === "page") return <section className={styles.pageShell}>{content}</section>;
  return <div className={styles.backdrop} onMouseDown={(event: MouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) requestClose(); }}>{content}</div>;
}
