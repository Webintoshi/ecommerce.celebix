"use client";

import { parseStorefrontAsset, type StorefrontAsset } from "@celebix/saas-contracts";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./catalog-admin-console.module.css";

type Props = Readonly<{
  value?: string;
  brandName: string;
  canManage: boolean;
  onChange(value: string | undefined): void;
  onBusyChange?(busy: boolean): void;
  onUploadErrorChange?(failed: boolean): void;
}>;

function operationId() { return crypto.randomUUID(); }

export function CatalogBrandLogoPicker({ value, brandName, canManage, onChange, onBusyChange, onUploadErrorChange }: Props) {
  const [assets, setAssets] = useState<readonly StorefrontAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const mounted = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/storefront-assets", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error();
      const body = await response.json() as { assets?: unknown };
      if (!Array.isArray(body.assets) || body.assets.length > 64) throw new Error();
      setAssets(Object.freeze(body.assets.map(parseStorefrontAsset).filter((asset) => asset.kind === "logo" && asset.status === "active")));
    } catch {
      setError("Marka görselleri şu anda yüklenemiyor.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);

  async function upload() {
    if (!canManage || busy) return;
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Önce bir marka logosu seçin."); fileRef.current?.focus(); return; }
    const data = new FormData();
    data.append("file", file);
    data.append("kind", "logo");
    data.append("altText", `${brandName.trim() || "Marka"} logosu`);
    setBusy(true);
    onBusyChange?.(true);
    onUploadErrorChange?.(false);
    setError("");
    try {
      const response = await fetch("/api/storefront-assets", { method: "POST", credentials: "same-origin", headers: { "idempotency-key": operationId() }, body: data });
      if (!response.ok) throw new Error();
      const body = await response.json() as { asset?: unknown };
      const created = parseStorefrontAsset(body.asset);
      if (created.kind !== "logo" || created.status !== "active") throw new Error();
      if (!mounted.current) return;
      onChange(created.id);
      if (fileRef.current) fileRef.current.value = "";
      setSelectedFileName("");
      setAssets((current) => Object.freeze([created, ...current.filter((asset) => asset.id !== created.id)]));
    } catch {
      if (!mounted.current) return;
      onUploadErrorChange?.(true);
      setError("Marka logosu yüklenemedi. JPG, PNG veya WEBP bir görsel deneyin.");
    } finally {
      if (mounted.current) {
        setBusy(false);
        onBusyChange?.(false);
        fileRef.current?.focus();
      }
    }
  }

  const selected = assets.find((asset) => asset.id === value);
  return <section className={styles.brandLogoPanel} aria-labelledby="brand-logo-title">
    <div className={styles.brandLogoPreview}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tenant R2 URLs are runtime data and intentionally cannot be enumerated in next/image config */}
      {selected ? <img src={selected.publicUrl} alt={selected.altText || `${brandName || "Marka"} logosu`} /> : <span aria-hidden="true">{(brandName.trim()[0] || "M").toLocaleUpperCase("tr-TR")}</span>}
    </div>
    <div className={styles.brandLogoControls}>
      <div><h2 id="brand-logo-title">Logo</h2><p>JPG, PNG veya WEBP</p></div>
      {loading ? <p role="status">Marka görselleri yükleniyor…</p> : null}
      {assets.length ? <details className={styles.brandLogoLibrary}><summary>Kayıtlı logolar ({assets.length})</summary><div className={styles.brandLogoChoices} role="group" aria-label="Kayıtlı marka logoları">{assets.map((asset) => <button type="button" key={asset.id} aria-pressed={asset.id === value} disabled={!canManage || busy} onClick={() => onChange(asset.id)}>{/* eslint-disable-next-line @next/next/no-img-element -- tenant R2 URLs are runtime data */}<img src={asset.publicUrl} alt={asset.altText || "Marka logosu"} /></button>)}</div></details> : null}
      {canManage ? <div className={styles.brandLogoUpload}>
        <label>{busy ? <LoaderCircle aria-hidden="true" /> : <ImagePlus aria-hidden="true" />}<span>{busy ? "Yükleniyor…" : value ? "Logoyu değiştir" : "Marka logosu yükle"}</span><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { setSelectedFileName(event.currentTarget.files?.[0]?.name ?? ""); if (event.currentTarget.files?.[0]) void upload(); }} /></label>
        {selectedFileName && !busy ? <><button type="button" onClick={() => { void upload(); }}>Tekrar yükle</button><button type="button" onClick={() => { setSelectedFileName(""); setError(""); if (fileRef.current) fileRef.current.value = ""; onUploadErrorChange?.(false); }}>Dosyayı kaldır</button></> : null}
        {value ? <button type="button" className={styles.brandLogoRemove} disabled={busy} onClick={() => onChange(undefined)}><Trash2 aria-hidden="true" /> Görseli kaldır</button> : null}
      </div> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  </section>;
}
