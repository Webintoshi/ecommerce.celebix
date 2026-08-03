"use client";

import { useState } from "react";
import type { StorefrontAsset } from "@celebix/saas-contracts";

import styles from "./catalog-admin-console.module.css";

export function BrandLogoField({ assets, selectedId, disabled, brandName, onChange, onUpload }: Readonly<{
  assets: readonly StorefrontAsset[];
  selectedId?: string;
  disabled: boolean;
  brandName: string;
  onChange(value: string | undefined): void;
  onUpload(file: File): Promise<void>;
}>) {
  const [file, setFile] = useState<File>();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const selected = assets.find(({ id }) => id === selectedId);

  async function upload() {
    if (!file || disabled || uploading) return;
    setUploading(true);
    setError("");
    try {
      await onUpload(file);
      setFile(undefined);
    } catch {
      setError("Marka logosu yüklenemedi. Lütfen yeniden deneyin.");
    } finally {
      setUploading(false);
    }
  }

  return <fieldset className={`${styles.wide} ${styles.brandLogoField}`}>
    <legend>Marka logosu</legend>
    <div className={styles.brandLogoLayout}>
      <div className={styles.brandLogoPreview}>
        {selected ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={selected.publicUrl} alt={brandName.trim() || selected.altText} width={selected.width} height={selected.height} /></> : <span>Henüz logo seçilmedi</span>}
      </div>
      <div className={styles.brandLogoControls}>
        <label>Kayıtlı logo<select value={selectedId ?? ""} disabled={disabled || uploading} onChange={(event) => onChange(event.currentTarget.value || undefined)}><option value="">Logo seçilmedi</option>{assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.altText || `Logo ${asset.id.slice(0, 8)}`}</option>)}</select></label>
        <label>Yeni logo<input aria-label="Marka logosu" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || uploading} onChange={(event) => setFile(event.currentTarget.files?.[0])} /></label>
        <div className={styles.actions}>
          <button className={styles.button} type="button" disabled={disabled || uploading || !file} onClick={() => { void upload(); }}>{uploading ? "Yükleniyor…" : "Logoyu yükle"}</button>
          {selected ? <button className={styles.button} type="button" disabled={disabled || uploading} onClick={() => onChange(undefined)}>Logoyu kaldır</button> : null}
        </div>
        <small>JPEG, PNG veya WebP. Logo mağazanızın güvenli medya alanında saklanır.</small>
      </div>
    </div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
  </fieldset>;
}
