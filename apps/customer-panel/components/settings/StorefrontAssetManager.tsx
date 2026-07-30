"use client";

import { parseStorefrontAsset, type MerchantAdminJson, type MerchantAdminRecord, type StorefrontAsset, type StorefrontAssetKind } from "@celebix/saas-contracts";
import { Archive, ImagePlus, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { merchantAdminApi } from "@/lib/merchant-admin-ui/client";
import styles from "./storefront-asset-manager.module.css";

function id(): string { return crypto.randomUUID(); }
function errorMessage(): string { return "Vitrin görselleri şu anda güncellenemiyor."; }
function selectRecord(records: readonly MerchantAdminRecord[]): MerchantAdminRecord | null { return records.find((record) => record.status === "active") ?? records.find((record) => record.status === "draft") ?? null; }

export function StorefrontAssetManager({ canManage }: Readonly<{ canManage: boolean }>) {
  const [assets, setAssets] = useState<readonly StorefrontAsset[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const uploadRef = useRef<HTMLButtonElement | null>(null);
  const pendingUploadOperation = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/storefront-assets", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error();
      const body = await response.json() as { assets?: unknown };
      if (!Array.isArray(body.assets) || body.assets.length > 64) throw new Error();
      setAssets(Object.freeze(body.assets.map(parseStorefrontAsset)));
    } catch { setError(errorMessage()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canManage || busy) return;
    const form = event.currentTarget, data = new FormData(form), operationId = pendingUploadOperation.current ?? id(); pendingUploadOperation.current = operationId; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/storefront-assets", { method: "POST", credentials: "same-origin", headers: { "idempotency-key": operationId }, body: data });
      if (!response.ok) throw new Error(); pendingUploadOperation.current = null; await load(); form.reset(); setMessage("Görsel güvenle yüklendi.");
    } catch { setError(errorMessage()); } finally { setBusy(false); uploadRef.current?.focus(); }
  }

  async function archive(asset: StorefrontAsset) {
    if (!canManage || busy) return; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/storefront-assets", { method: "DELETE", credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": id() }, body: JSON.stringify({ assetId: asset.id, expectedVersion: asset.version }) });
      if (!response.ok) throw new Error(); await load(); setMessage("Görsel arşivlendi.");
    } catch { setError(errorMessage()); } finally { setBusy(false); uploadRef.current?.focus(); }
  }

  async function useFor(asset: StorefrontAsset, usage: "hero_banner" | "social_preview") {
    if (!canManage || busy) return; setBusy(true); setError(""); setMessage("");
    try {
      const current = selectRecord(await merchantAdminApi.records(usage));
      const config = { ...(current?.config ?? {}), assetId: asset.id } as Record<string, MerchantAdminJson>;
      delete config.imageUrl;
      await merchantAdminApi.save(usage, { ...(current ? { recordId: current.id, expectedVersion: current.version } : {}), name: current?.name ?? (usage === "hero_banner" ? "Ana vitrin görseli" : "Sosyal paylaşım görseli"), config, status: current?.status === "draft" ? "draft" : "active" });
      setMessage(usage === "hero_banner" ? "Hero görseli kaydedildi." : "Sosyal paylaşım görseli kaydedildi.");
    } catch { setError(errorMessage()); } finally { setBusy(false); uploadRef.current?.focus(); }
  }

  return <section className={styles.manager} aria-labelledby="storefront-assets-title">
    <div className={styles.heading}><div><p className={styles.eyebrow}>R2 · mağaza-bazlı</p><h2 id="storefront-assets-title">Vitrin görselleri</h2><p>Logo, hero, sosyal paylaşım ve favicon görsellerini yalnız bu mağazaya ait güvenli alanda yönetin.</p></div></div>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {message ? <p role="status" className={styles.success}>{message}</p> : null}
    {canManage ? <form className={styles.upload} onChange={() => { if (!busy) pendingUploadOperation.current = null; }} onSubmit={upload}>
      <label>Tür<select name="kind" defaultValue="hero" disabled={busy}><option value="hero">Hero</option><option value="logo">Logo</option><option value="social">Sosyal</option><option value="favicon">Favicon</option></select></label>
      <label>Alternatif metin<input name="altText" maxLength={500} required /></label>
      <label>Görsel<input name="file" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
      <button ref={uploadRef} type="submit" disabled={busy}>{busy ? <LoaderCircle aria-hidden="true" /> : <ImagePlus aria-hidden="true" />} Yükle</button>
    </form> : null}
    {loading ? <p className={styles.state}>Yükleniyor…</p> : assets.length === 0 ? <p className={styles.state}>Henüz vitrin görseli yok.</p> : <ul className={styles.grid}>
      {assets.map((asset) => <li key={asset.id} className={styles.card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}<img src={asset.publicUrl} alt={asset.altText} width={asset.width} height={asset.height} />
        <div><strong>{({ logo: "Logo", hero: "Hero", social: "Sosyal", favicon: "Favicon" } as Record<StorefrontAssetKind, string>)[asset.kind]}</strong><small>{asset.width}×{asset.height} · {Math.ceil(asset.byteSize / 1024)} KB</small></div>
        {canManage ? <div className={styles.actions}>
          {asset.kind === "hero" ? <button type="button" disabled={busy} onClick={() => void useFor(asset, "hero_banner")}>Hero olarak kullan</button> : null}
          {asset.kind === "social" ? <button type="button" disabled={busy} onClick={() => void useFor(asset, "social_preview")}>Sosyal görsel olarak kullan</button> : null}
          <button type="button" disabled={busy} onClick={() => void archive(asset)}><Archive aria-hidden="true" /> Arşivle</button>
        </div> : null}
      </li>)}
    </ul>}
  </section>;
}
