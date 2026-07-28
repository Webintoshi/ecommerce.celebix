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
import { buildQuickCreateIntent } from "@/lib/catalog-onboarding-ui/forms";
import { ProductMediaApiError, productMediaApi } from "@/lib/catalog-ui/media-client";

import styles from "./product-onboarding.module.css";

type OnboardingApi = Pick<typeof catalogOnboardingClient, "createProduct" | "publishAfterMedia">;
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
  file: File;
  altText: string;
  publish: boolean;
}>;

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
  const [image, setImage] = useState<File>();
  const [preview, setPreview] = useState("");
  const [progress, setProgress] = useState(0);
  const [recovery, setRecovery] = useState<Recovery>();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const submittingRef = useRef(false);

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

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

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
    const file = event.currentTarget.files?.[0];
    setError("");
    setRecovery(undefined);
    setProgress(0);
    if (preview) URL.revokeObjectURL(preview);
    if (file === undefined) { setImage(undefined); setPreview(""); return; }
    if (!ACCEPTED_MEDIA.has(file.type) || file.size < 1 || file.size > 5_242_880) {
      event.currentTarget.value = "";
      setImage(undefined);
      setPreview("");
      setError("PNG, JPEG veya WebP biçiminde ve en fazla 5 MB bir görsel seçin.");
      return;
    }
    setImage(file);
    setPreview(URL.createObjectURL(file));
  }

  async function completeMedia(created: CatalogOnboardingResult, file: File, altText: string, publish: boolean) {
    await mediaClient.upload(created.product.id, { file, altText, onProgress: setProgress });
    if (!publish) return created;
    return api.publishAfterMedia(created.product.id, {
      expectedProductVersion: created.product.version,
      expectedMediaCount: created.mediaCount + 1,
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
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
      if (image !== undefined) {
        try {
          const completed = await completeMedia(created, image, field(data, "imageAltText"), publish);
          onCreated(completed);
        } catch {
          setRecovery(Object.freeze({ created, file: image, altText: field(data, "imageAltText"), publish }));
          setError("Ürün oluşturuldu, görsel yüklenemedi. Ürün taslak olarak korundu.");
        }
      } else if (publish) {
        onCreated(await api.publishAfterMedia(created.product.id, {
          expectedProductVersion: created.product.version,
          expectedMediaCount: created.mediaCount,
        }));
      } else onCreated(created);
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
      onCreated(await completeMedia(recovery.created, recovery.file, recovery.altText, recovery.publish));
      setRecovery(undefined);
    } catch {
      setError("Ürün oluşturuldu, görsel yüklenemedi. Ürün taslak olarak korundu.");
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
      role="dialog"
      aria-modal="true"
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
        <fieldset disabled={submitting || options === null}>
          <label className={styles.wide}><span>Ürün adı <b>*</b></span><input ref={titleRef} name="title" required maxLength={200} autoFocus placeholder="Örn. Seramik kahve kupası" autoComplete="off" /></label>
          <label><span>Satış fiyatı <b>*</b></span><div className={styles.money}><input name="price" required inputMode="decimal" placeholder="0,00" /><span>₺</span></div></label>
          <label><span>Stok adedi</span><input name="stockQuantity" inputMode="numeric" pattern="(?:0|[1-9][0-9]*)" defaultValue="0" /></label>
          <label className={styles.wide}><span>Kategori</span><select name="categoryId" defaultValue=""><option value="">Kategori seçilmedi</option>{options?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className={`${styles.media} ${styles.wide}`}><ImagePlus aria-hidden="true" /><span>{image ? "Başka görsel seç" : "İsteğe bağlı görsel seç"}<small>PNG, JPEG veya WebP · en fazla 5 MB</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage} /></label>
          {preview ? <div className={`${styles.preview} ${styles.wide}`}><img src={preview} alt="Yüklenecek ürün görseli önizlemesi" /><label><span>Görsel alt metni</span><input name="imageAltText" maxLength={500} placeholder="Ürün görselini kısaca anlatın" /></label></div> : null}
          {submitting && image ? <div className={`${styles.progress} ${styles.wide}`} role="status"><span>Görsel yükleniyor</span><progress max="100" value={progress}>{progress}%</progress><b>{progress}%</b></div> : null}
        </fieldset>

        {options === null ? <p className={styles.loading} role="status">Ürün seçenekleri yükleniyor…</p> : null}
        <div className={styles.actions}>
          {recovery ? <><button type="button" className={styles.secondary} onClick={() => void retryMedia()} disabled={submitting}>Görseli yeniden yükle</button><Link className={styles.secondary} href={`/products/${recovery.created.product.id}`}>Ürüne git</Link></> : null}
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
