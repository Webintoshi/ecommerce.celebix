"use client";

import { parseStorefrontAsset, type StorefrontAsset } from "@celebix/saas-contracts";
import { Image as ImageIcon, ImagePlus, LoaderCircle, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { categoryImageFileError, categoryImageFrame } from "@/lib/catalog-onboarding-ui/category-image";
import styles from "./category-management.module.css";

type Selection = Readonly<{ assetId?: string; altText: string }>;
type UploadAttempt = Readonly<{ operationId: string; file: File; previewUrl: string; altText: string }>;

async function prepare(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("image_decode_failed"));
      image.src = url;
    });
    const frame = categoryImageFrame(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = frame.width; canvas.height = frame.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("image_canvas_unavailable");
    context.drawImage(image, frame.sourceX, frame.sourceY, frame.sourceWidth, frame.sourceHeight, 0, 0, frame.width, frame.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error("image_encode_failed")), "image/webp", 0.9));
    const extension = blob.type === "image/webp" ? "webp" : "png";
    const result = new File([blob], `category.${extension}`, { type: blob.type });
    if (categoryImageFileError(result)) throw new Error("image_too_large");
    return result;
  } finally { URL.revokeObjectURL(url); }
}

function failureMessage(status?: number) {
  if (status === 403) return "Görsel yükleme yetkiniz yok.";
  if (status === 409) return "Görsel kaydedilemedi. Görsel kütüphanesini kontrol edin.";
  return "Görsel yüklenemedi. Seçiminiz korundu; tekrar deneyin.";
}

export function CategoryMediaField({
  assetId, imageUrl, altText, assets, disabled = false, onChange, onAssetUploaded, onBusyChange, onPendingChange,
}: Readonly<{
  assetId?: string;
  imageUrl?: string;
  altText: string;
  assets: readonly StorefrontAsset[];
  disabled?: boolean;
  onChange: (value: Selection) => void;
  onAssetUploaded: (asset: StorefrontAsset) => void;
  onBusyChange: (busy: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
}>) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState<UploadAttempt>();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLDivElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const activeRef = useRef(true);
  const previewRef = useRef("");
  const attemptRef = useRef<UploadAttempt | undefined>(undefined);
  const requestRef = useRef<AbortController | undefined>(undefined);
  const processingRef = useRef(false);
  const callbacks = useRef({ onChange, onAssetUploaded, onBusyChange, onPendingChange });
  callbacks.current = { onChange, onAssetUploaded, onBusyChange, onPendingChange };
  const available = assets.filter(asset => asset.kind === "category" && asset.status === "active");
  const selected = available.find(asset => asset.id === assetId);
  const preview = attempt?.previewUrl || selected?.publicUrl || imageUrl;
  const blocked = disabled || busy;

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      requestRef.current?.abort();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      callbacks.current.onBusyChange(false);
      callbacks.current.onPendingChange?.(false);
    };
  }, []);
  useEffect(() => { if (libraryOpen) libraryRef.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [libraryOpen]);

  function setWorking(value: boolean) {
    processingRef.current = value;
    setBusy(value);
    callbacks.current.onBusyChange(value);
  }
  function clearAttempt() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = ""; attemptRef.current = undefined; setAttempt(undefined);
    callbacks.current.onPendingChange?.(false);
  }
  async function upload(next: UploadAttempt) {
    setError("");
    const controller = new AbortController(); requestRef.current = controller;
    try {
      const body = new FormData();body.set("file", next.file);body.set("kind", "category");body.set("altText", next.altText);
      const response = await fetch("/api/storefront-assets", { method: "POST", credentials: "same-origin", headers: { "idempotency-key": next.operationId }, body, signal: controller.signal });
      if (!response.ok) throw Object.assign(new Error("upload_failed"), { status: response.status });
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("asset" in result)) throw new Error("upload_result_invalid");
      const asset = parseStorefrontAsset(result.asset);
      if (asset.id !== next.operationId || asset.kind !== "category" || asset.status !== "active") throw new Error("upload_result_invalid");
      if (!activeRef.current) return;
      callbacks.current.onAssetUploaded(asset);
      callbacks.current.onChange({ assetId: asset.id, altText: altText.trim() });
      clearAttempt(); setLibraryOpen(false);
    } catch (failure) {
      if (activeRef.current) setError(failureMessage(typeof failure === "object" && failure !== null && "status" in failure ? Number(failure.status) : undefined));
    } finally {
      if (activeRef.current) setWorking(false);
      requestRef.current = undefined;
    }
  }
  async function selectFile(file?: File) {
    if (!file || disabled || processingRef.current) return;
    const fileError = categoryImageFileError(file);
    if (fileError) { setError(fileError); return; }
    clearAttempt();callbacks.current.onPendingChange?.(true);setWorking(true);setError("");setLibraryOpen(false);
    try {
      const framed = await prepare(file);
      if (!activeRef.current) return;
      const next = { operationId: crypto.randomUUID(), file: framed, previewUrl: URL.createObjectURL(framed), altText: altText.trim() };
      previewRef.current = next.previewUrl; attemptRef.current = next;setAttempt(next);
      await upload(next);
    } catch {
      if (activeRef.current) { callbacks.current.onPendingChange?.(false);setError("Görsel hazırlanamadı. En fazla 8192 × 8192 boyutunda geçerli bir görsel seçin.");setWorking(false); }
    } finally { if (inputRef.current) inputRef.current.value = ""; }
  }
  function choose(asset: StorefrontAsset) {
    clearAttempt();setError("");callbacks.current.onChange({ assetId: asset.id, altText: asset.altText });setLibraryOpen(false);chooseRef.current?.focus();
  }
  function remove() {
    clearAttempt();setError("");callbacks.current.onChange({ altText: "" });chooseRef.current?.focus();
  }

  return <section className={styles.mediaSection} aria-label="Kategori görseli" aria-busy={busy}>
    <div className={styles.sectionLine}><strong>Görsel</strong>{assetId || attempt ? <button type="button" className={styles.cancelButton} onClick={remove} disabled={blocked}>Kaldır</button> : null}</div>
    <div className={styles.mediaRow}>
      <button type="button" className={`${styles.mediaPreview} ${dragOver ? styles.imageDropActive : ""}`} onClick={() => inputRef.current?.click()} disabled={blocked} aria-label={preview ? "Kategori görselini değiştir" : "Kategori görseli yükle"}
        onDragOver={event => { if (!blocked && event.dataTransfer.types.includes("Files")) { event.preventDefault();setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)} onDrop={event => { event.preventDefault();setDragOver(false);if (!blocked) void selectFile(event.dataTransfer.files[0]); }}>
        {preview ? <img src={preview} alt={altText || "Kategori görseli"} decoding="async" /> : <ImagePlus aria-hidden="true" />}
        {busy ? <span className={styles.mediaProgress} role="status"><LoaderCircle aria-hidden="true" /><span className="sr-only">Görsel yükleniyor</span></span> : null}
      </button>
      <div className={styles.mediaControls}>
        <button ref={chooseRef} type="button" className={styles.secondaryButton} onClick={() => inputRef.current?.click()} disabled={blocked}><Upload aria-hidden="true" />{preview ? "Değiştir" : "Görsel yükle"}</button>
        <button type="button" className={styles.cancelButton} onClick={() => setLibraryOpen(current => !current)} disabled={blocked} aria-expanded={libraryOpen} aria-controls="category-media-library"><ImageIcon aria-hidden="true" />Kütüphaneden seç</button>
        <small>JPG, PNG, WebP · 5 MB<br />Dikey çerçeve · 3:4</small>
      </div>
    </div>
    <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} className="sr-only" aria-label="Kategori görseli dosyası" disabled={blocked} onChange={event => void selectFile(event.currentTarget.files?.[0])} />
    {error ? <div className={styles.mediaError} role="alert"><p>{error}</p>{attempt ? <button type="button" className={styles.cancelButton} disabled={blocked} onClick={() => { if (attemptRef.current) { setWorking(true);void upload(attemptRef.current); } }}>Tekrar dene</button> : null}</div> : null}
    {assetId && !selected && !imageUrl && !attempt ? <p className={styles.fieldHelp}>Görsel kullanılamıyor. Başka görsel seçin.</p> : null}
    {libraryOpen ? <div id="category-media-library" ref={libraryRef} className={styles.mediaLibrary} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault();event.stopPropagation();setLibraryOpen(false);chooseRef.current?.focus(); } }}>
      <div className={styles.sectionLine}><strong>Görsel kütüphanesi</strong><button type="button" className={styles.iconButton} aria-label="Görsel kütüphanesini kapat" onClick={() => { setLibraryOpen(false);chooseRef.current?.focus(); }}><X aria-hidden="true" /></button></div>
      {available.length ? <div className={styles.assetGrid}>{available.map(asset => <button type="button" className={styles.assetChoice} key={asset.id} aria-label={`${asset.altText || "Kategori"} görselini seç`} aria-pressed={assetId === asset.id} disabled={blocked} onClick={() => choose(asset)}><img src={asset.publicUrl} alt={asset.altText} width={asset.width} height={asset.height} loading="lazy" decoding="async" /><small>{asset.altText || "Kategori görseli"}</small></button>)}</div> : <p className={styles.fieldHelp}>Henüz kategori görseli yok.</p>}
    </div> : null}
    {assetId ? <label className={`${styles.field} ${styles.altField}`}><span>Alt metin</span><input value={altText} maxLength={500} disabled={blocked} placeholder="Görseli kısaca tanımla" onChange={event => callbacks.current.onChange({ assetId, altText: event.currentTarget.value })} /></label> : null}
  </section>;
}
