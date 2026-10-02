"use client";

import { Image as ImageIcon, ImagePlus, LoaderCircle, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { categoryImageFileError } from "../../../lib/catalog-onboarding-ui/category-image";
import styles from "./design-image-field.module.css";

export type DesignImageOption = Readonly<{ key: string; url: string; altText: string; width?: number; height?: number }>;
export type DesignImageFieldProps = Readonly<{
  label: string;
  value: string;
  options: readonly DesignImageOption[];
  disabled: boolean;
  onChange(key: string): void;
  onUpload?(file: File): Promise<DesignImageOption>;
  onBusyChange?(id: string, busy: boolean): void;
  onPendingChange?(id: string, pending: boolean): void;
  emptyLabel?: string;
  frame?: "wide" | "portrait" | "logo" | "square";
  maxBytes?: number;
}>;
type PendingImage = Readonly<{ file: File; previewUrl: string }>;
const MAX_BYTES = 5_242_880;

function uploadError(error: unknown) {
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  if (status === 403) return "Görsel yükleme yetkiniz yok. Seçiminiz korundu.";
  return "Görsel yüklenemedi. Seçiminiz korundu; tekrar deneyin.";
}

function objectUrl(file: File) {
  try { return URL.createObjectURL(file); } catch { return ""; }
}

export function DesignImageField({ label, value, options, disabled, onChange, onUpload, onBusyChange, onPendingChange, emptyLabel = "Görsel yok", frame = "wide", maxBytes = MAX_BYTES }: DesignImageFieldProps) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState<PendingImage>();
  const [created, setCreated] = useState<DesignImageOption>();
  const fileRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLDivElement>(null);
  const libraryTriggerRef = useRef<HTMLButtonElement>(null);
  const libraryFocusRef = useRef<HTMLButtonElement | null>(null);
  const activeRef = useRef(true);
  const processingRef = useRef(false);
  const pendingRef = useRef<PendingImage | undefined>(undefined);
  const requestRef = useRef(0);
  const callbacks = useRef({ disabled, onChange, onUpload, onBusyChange, onPendingChange });
  callbacks.current = { disabled, onChange, onUpload, onBusyChange, onPendingChange };
  const selected = options.find(option => option.key === value) ?? (created?.key === value ? created : undefined);
  const previewUrl = pending?.previewUrl || selected?.url;
  const blocked = disabled || busy;
  const missing = Boolean(value && !selected && !pending);
  const libraryId = `${id}-library`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const statusId = `${id}-status`;
  const limit = Math.min(MAX_BYTES, Math.max(1, maxBytes));
  const limitLabel = (limit / 1_048_576).toLocaleString("tr-TR", { maximumFractionDigits: 2 });

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      requestRef.current += 1;
      if (pendingRef.current?.previewUrl) URL.revokeObjectURL(pendingRef.current.previewUrl);
      if (pendingRef.current) callbacks.current.onPendingChange?.(`${id}-selection`, false);
      pendingRef.current = undefined;
      if (processingRef.current) {
        processingRef.current = false;
        callbacks.current.onBusyChange?.(id, false);
      }
    };
  }, [id]);

  useEffect(() => {
    if (libraryOpen) (libraryRef.current?.querySelector<HTMLButtonElement>("[data-image-option]") ?? libraryRef.current?.querySelector<HTMLButtonElement>("button"))?.focus();
  }, [libraryOpen]);

  function clearPending() {
    if (pendingRef.current?.previewUrl) URL.revokeObjectURL(pendingRef.current.previewUrl);
    if (pendingRef.current && activeRef.current) callbacks.current.onPendingChange?.(`${id}-selection`, false);
    pendingRef.current = undefined;
    if (activeRef.current) setPending(undefined);
  }

  function working(next: boolean) {
    processingRef.current = next;
    if (!activeRef.current) return;
    setBusy(next);
    callbacks.current.onBusyChange?.(id, next);
  }

  function closeLibrary() {
    setLibraryOpen(false);
    (libraryFocusRef.current ?? libraryTriggerRef.current)?.focus();
  }

  async function upload(attempt: PendingImage) {
    const uploadFile = callbacks.current.onUpload;
    if (!activeRef.current || callbacks.current.disabled || processingRef.current || !uploadFile) return;
    const request = ++requestRef.current;
    working(true);
    setError("");
    setStatus("Görsel yükleniyor…");
    setLibraryOpen(false);
    try {
      const result = await uploadFile(attempt.file);
      if (!activeRef.current || requestRef.current !== request) return;
      setCreated(result);
      callbacks.current.onChange(result.key);
      clearPending();
      if (activeRef.current) setStatus("Görsel yüklendi.");
    } catch (caught) {
      if (activeRef.current && requestRef.current === request) {
        setError(uploadError(caught));
        setStatus("");
      }
    } finally {
      if (activeRef.current && requestRef.current === request) working(false);
    }
  }

  function selectFile(file?: File) {
    if (!file || !activeRef.current || callbacks.current.disabled || processingRef.current || !callbacks.current.onUpload) return;
    const fileError = categoryImageFileError(file) ?? (file.size > limit ? `Görsel en fazla ${limitLabel} MB olabilir.` : undefined);
    if (fileError) {
      setError(fileError);
      setStatus("");
      return;
    }
    clearPending();
    const attempt = { file, previewUrl: objectUrl(file) };
    pendingRef.current = attempt;
    setPending(attempt);
    callbacks.current.onPendingChange?.(`${id}-selection`, true);
    setDragOver(false);
    void upload(attempt);
  }

  function choose(option: DesignImageOption) {
    if (callbacks.current.disabled || processingRef.current) return;
    clearPending();
    setError("");
    setStatus("Görsel seçildi.");
    callbacks.current.onChange(option.key);
    closeLibrary();
  }

  function remove() {
    if (callbacks.current.disabled || processingRef.current) return;
    clearPending();
    setCreated(undefined);
    setError("");
    setStatus("Görsel kaldırıldı.");
    callbacks.current.onChange("");
  }

  return <section className={styles.field} aria-labelledby={`${id}-label`} aria-busy={busy}>
    <div className={styles.heading}>
      <strong id={`${id}-label`}>{label}</strong>
      {value || pending ? <button type="button" className={styles.textButton} disabled={blocked} onClick={remove}>Kaldır</button> : null}
    </div>
    <button type="button" className={`${styles.dropzone} ${dragOver ? styles.dragOver : ""}`} data-image-dropzone="" disabled={blocked} aria-describedby={`${helpId} ${statusId}${error ? ` ${errorId}` : ""}`} aria-label={`${label}: ${onUpload ? previewUrl ? "Değiştir" : "Görsel yükle" : "Kütüphaneden seç"}`}
      onClick={event => { if (callbacks.current.disabled || processingRef.current) return; if (callbacks.current.onUpload) fileRef.current?.click(); else { libraryFocusRef.current = event.currentTarget; setLibraryOpen(current => !current); } }}
      onDragOver={event => { if (!callbacks.current.disabled && !processingRef.current && callbacks.current.onUpload && event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={event => { event.preventDefault(); setDragOver(false); selectFile(event.dataTransfer.files[0]); }}>
      <span className={styles.preview} data-frame={frame}>
        {previewUrl ? <img src={previewUrl} alt={pending ? `${label} önizlemesi` : selected?.altText || label} decoding="async" /> : <ImagePlus aria-hidden="true" />}
        {busy ? <span className={styles.progress}><LoaderCircle aria-hidden="true" /></span> : null}
      </span>
      <span className={styles.uploadCopy}>
        <span className={styles.uploadAction}>{busy ? <LoaderCircle aria-hidden="true" /> : onUpload ? <Upload aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}<strong>{busy ? "Yükleniyor…" : onUpload ? previewUrl ? "Değiştir" : "Görsel yükle" : "Kütüphaneden seç"}</strong></span>
        <small>{onUpload ? "Dosya seçin veya buraya sürükleyin" : "Görsel kütüphanesini açın"}</small>
        {!previewUrl && !missing ? <small className={styles.emptyLabel}>{emptyLabel}</small> : null}
      </span>
    </button>
    {onUpload ? <input ref={fileRef} id={`${id}-file`} type="file" accept="image/jpeg,image/png,image/webp" disabled={blocked} className={styles.fileInput} tabIndex={-1} aria-labelledby={`${id}-label`} aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`} aria-invalid={Boolean(error)} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; selectFile(file); }} /> : null}
    <div className={styles.controls}>
      <button ref={libraryTriggerRef} type="button" className={styles.textButton} disabled={blocked} aria-expanded={libraryOpen} aria-controls={libraryId} onClick={event => { libraryFocusRef.current = event.currentTarget; setLibraryOpen(current => !current); }}><ImageIcon aria-hidden="true" />Kütüphaneden seç</button>
      {onUpload ? <small id={helpId}>JPG, PNG, WebP · En fazla {limitLabel} MB</small> : <small id={helpId}>{options.length ? `${options.length} görsel` : "Henüz görsel yok"}</small>}
    </div>
    <p id={statusId} role="status" aria-live="polite" className={missing ? styles.status : styles.srOnly}>{missing ? "Görsel kullanılamıyor. Başka görsel seçin." : status}</p>
    {error ? <div id={errorId} className={styles.error} role="alert"><p>{error}</p>{pending ? <div className={styles.errorActions}>
      <button type="button" className={styles.retryButton} disabled={blocked} onClick={() => { if (pendingRef.current) void upload(pendingRef.current); }}>Tekrar dene</button>
      <button type="button" className={styles.textButton} disabled={blocked} onClick={() => { if (callbacks.current.disabled || processingRef.current) return; clearPending(); setError(""); setStatus(""); }}>Vazgeç</button>
    </div> : null}</div> : null}
    {libraryOpen ? <div ref={libraryRef} id={libraryId} className={styles.library} role="group" aria-label={`${label} görsel kütüphanesi`} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeLibrary(); } }}>
      <div className={styles.heading}><strong>Görsel kütüphanesi</strong><button type="button" className={styles.iconButton} aria-label="Görsel kütüphanesini kapat" onClick={closeLibrary}><X aria-hidden="true" /></button></div>
      {options.length ? <div className={styles.grid}>{options.map(option => <button key={option.key} value={option.key} type="button" data-image-option="" className={styles.choice} disabled={blocked} aria-pressed={value === option.key} aria-label={`${option.altText || "Adsız"} görselini seç`} onClick={() => choose(option)}>
        <span className={styles.thumbnail} data-frame={frame}><img src={option.url} alt="" loading="lazy" decoding="async" width={option.width} height={option.height} /></span>
        <span>{option.altText || "Adsız görsel"}</span>
      </button>)}</div> : <p className={styles.status}>Henüz görsel yok.{onUpload ? " Görsel yükleyerek başlayın." : ""}</p>}
    </div> : null}
  </section>;
}
