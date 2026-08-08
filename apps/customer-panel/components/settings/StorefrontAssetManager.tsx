"use client";

import { parseStorefrontAsset, type MerchantAdminJson, type MerchantAdminRecord, type StorefrontAsset, type StorefrontAssetKind } from "@celebix/saas-contracts";
import { AppWindow, Archive, CheckCircle2, Grid2X2, Image as ImageIcon, ImagePlus, LayoutTemplate, LoaderCircle, Share2, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { merchantAdminApi } from "@/lib/merchant-admin-ui/client";
import {
  storefrontAssetRatioLabel,
  storefrontAssetRatioMatches,
  storefrontAssetRatioOptions,
  type StorefrontAssetRatio,
} from "@/lib/storefront-asset-upload-model";
import styles from "./storefront-asset-manager.module.css";

type AssetKindChoice = Readonly<{
  value: StorefrontAssetKind;
  label: string;
  hint: string;
  icon: LucideIcon;
}>;

const ASSET_KIND_CHOICES: readonly AssetKindChoice[] = Object.freeze([
  Object.freeze({ value: "hero", label: "Ana sayfa bannerı", hint: "Mağazanızın en büyük vitrin görseli", icon: LayoutTemplate }),
  Object.freeze({ value: "category", label: "Kategori görseli", hint: "Kategorileri müşteriye görselle anlatır", icon: Grid2X2 }),
  Object.freeze({ value: "logo", label: "Logo", hint: "Header ve mağaza kimliğinde kullanılır", icon: ImageIcon }),
  Object.freeze({ value: "social", label: "Sosyal paylaşım", hint: "Linkiniz paylaşılınca görünür", icon: Share2 }),
  Object.freeze({ value: "favicon", label: "Site simgesi", hint: "Tarayıcı sekmesindeki küçük simge", icon: AppWindow }),
]);

function id(): string { return crypto.randomUUID(); }
function errorMessage(): string { return "Vitrin görselleri şu anda güncellenemiyor."; }
function selectRecord(records: readonly MerchantAdminRecord[]): MerchantAdminRecord | null { return records.find((record) => record.status === "active") ?? records.find((record) => record.status === "draft") ?? null; }

export function StorefrontAssetManager({ canManage }: Readonly<{ canManage: boolean }>) {
  const [assets, setAssets] = useState<readonly StorefrontAsset[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [kind, setKind] = useState<StorefrontAssetKind>("hero");
  const [ratio, setRatio] = useState<StorefrontAssetRatio>("16:9");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [dimensions, setDimensions] = useState<Readonly<{ width: number; height: number }> | null>(null);
  const [fileError, setFileError] = useState("");
  const uploadRef = useRef<HTMLButtonElement | null>(null);
  const pendingUploadOperation = useRef<string | null>(null);
  const fileSelection = useRef(0);
  const ratioOptions = storefrontAssetRatioOptions(kind);
  const fileMatchesRatio = dimensions ? storefrontAssetRatioMatches(dimensions.width, dimensions.height, ratio) : false;

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
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => () => { fileSelection.current += 1; }, []);

  function chooseKind(nextKind: StorefrontAssetKind) {
    if (busy) return;
    setKind(nextKind);
    setRatio(storefrontAssetRatioOptions(nextKind)[0]!.value);
    pendingUploadOperation.current = null;
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    pendingUploadOperation.current = null;
    const selection = fileSelection.current + 1;
    fileSelection.current = selection;
    const file = event.currentTarget.files?.[0] ?? null;
    setSelectedFile(file); setDimensions(null); setFileError("");
    if (!file) { setPreviewUrl(""); return; }
    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(nextPreviewUrl);
    const image = new window.Image();
    image.onload = () => {
      if (fileSelection.current !== selection) return;
      setDimensions(Object.freeze({ width: image.naturalWidth, height: image.naturalHeight }));
    };
    image.onerror = () => {
      if (fileSelection.current !== selection) return;
      setDimensions(null); setFileError("Bu dosya görsel olarak açılamadı. Başka bir dosya seçin.");
    };
    image.src = nextPreviewUrl;
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy) return;
    if (!selectedFile || !dimensions) { setFileError("Önce bir görsel seçin."); return; }
    if (!storefrontAssetRatioMatches(dimensions.width, dimensions.height, ratio)) {
      setFileError("Bu görsel seçtiğiniz şekle uymuyor. Uygun şekli seçin veya başka bir görsel yükleyin.");
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const operationId = pendingUploadOperation.current ?? id();
    pendingUploadOperation.current = operationId; setBusy(true); setError(""); setMessage(""); setFileError("");
    try {
      const response = await fetch("/api/storefront-assets", { method: "POST", credentials: "same-origin", headers: { "idempotency-key": operationId }, body: data });
      if (!response.ok) throw new Error();
      pendingUploadOperation.current = null; await load(); form.reset(); fileSelection.current += 1; setSelectedFile(null); setPreviewUrl(""); setDimensions(null); setMessage("Görsel güvenle yüklendi.");
    } catch { setError(errorMessage()); } finally { setBusy(false); uploadRef.current?.focus(); }
  }

  async function archive(asset: StorefrontAsset) {
    if (!canManage || busy) return; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/storefront-assets", { method: "DELETE", credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": id() }, body: JSON.stringify({ assetId: asset.id, expectedVersion: asset.version }) });
      if (!response.ok) throw new Error(); await load(); setMessage("Görsel arşivlendi.");
    } catch { setError(errorMessage()); } finally { setBusy(false); uploadRef.current?.focus(); }
  }

  async function useFor(asset: StorefrontAsset, usage: "hero_banner" | "social_preview" | "theme_setting") {
    if (!canManage || busy) return; setBusy(true); setError(""); setMessage("");
    try {
      const current = selectRecord(await merchantAdminApi.records(usage));
      const config = { ...(current?.config ?? {}), [usage === "theme_setting" ? "logoAssetId" : "assetId"]: asset.id } as Record<string, MerchantAdminJson>;
      delete config.imageUrl;
      const defaultName = usage === "hero_banner" ? "Ana vitrin görseli" : usage === "social_preview" ? "Sosyal paylaşım görseli" : "Starter tema";
      await merchantAdminApi.save(usage, { ...(current ? { recordId: current.id, expectedVersion: current.version } : {}), name: current?.name ?? defaultName, config, status: current?.status === "draft" ? "draft" : "active" });
      setMessage(usage === "hero_banner" ? "Hero görseli kaydedildi." : usage === "social_preview" ? "Sosyal paylaşım görseli kaydedildi." : "Logo kaydedildi.");
    } catch { setError(errorMessage()); } finally { setBusy(false); uploadRef.current?.focus(); }
  }

  return <section className={styles.manager} aria-labelledby="storefront-assets-title">
    <div className={styles.heading}><div><p className={styles.eyebrow}>Mağazanızın görselleri</p><h2 id="storefront-assets-title">Vitrin görselleri</h2><p>Nerede kullanacağınızı ve görselin şeklini seçin; uygun değilse yüklemeden önce size söyleyelim.</p></div></div>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {message ? <p role="status" className={styles.success}>{message}</p> : null}
    {canManage ? <form className={styles.upload} onChange={() => { if (!busy) pendingUploadOperation.current = null; }} onSubmit={upload}>
      <input type="hidden" name="kind" value={kind} />
      <fieldset className={styles.step} disabled={busy}>
        <legend><span>1</span><strong>Nerede kullanacaksınız?</strong></legend>
        <div className={styles.kindGrid}>
          {ASSET_KIND_CHOICES.map((choice) => {
            const Icon = choice.icon;
            return <button key={choice.value} className={styles.choice} type="button" aria-pressed={kind === choice.value} onClick={() => chooseKind(choice.value)}>
              <Icon aria-hidden="true" /><span><strong>{choice.label}</strong><small>{choice.hint}</small></span>
            </button>;
          })}
        </div>
      </fieldset>
      <fieldset className={styles.step} disabled={busy}>
        <legend><span>2</span><strong>Görsel şekli</strong></legend>
        <p className={styles.help}>Görseliniz telefonda ve bilgisayarda düzgün görünsün diye en yakın şekli seçin.</p>
        <div className={styles.ratioGrid}>
          {ratioOptions.map((option) => <button key={option.value} className={styles.ratioChoice} type="button" aria-pressed={ratio === option.value} onClick={() => { setRatio(option.value); setFileError(""); pendingUploadOperation.current = null; }}>
            <span className={styles.ratioShape} style={{ aspectRatio: `${option.width} / ${option.height}` }} aria-hidden="true" />
            <span><strong>{option.label}</strong><small>{option.value} · {option.hint}</small></span>
          </button>)}
        </div>
      </fieldset>
      <fieldset className={styles.step} disabled={busy}>
        <legend><span>3</span><strong>Görseli seçin</strong></legend>
        <div className={styles.fileArea}>
          <label className={styles.filePicker}><input name="file" type="file" accept="image/jpeg,image/png,image/webp" required onChange={chooseFile} /><ImagePlus aria-hidden="true" /><span><strong>{selectedFile ? "Başka görsel seç" : "Bilgisayardan görsel seç"}</strong><small>JPG, PNG veya WEBP</small></span></label>
          {previewUrl && selectedFile ? <div className={styles.preview}>
            {/* eslint-disable-next-line @next/next/no-img-element */}<img src={previewUrl} alt="Yükleme önizlemesi" />
            <div><strong>{selectedFile.name}</strong>{dimensions ? <small>{dimensions.width}×{dimensions.height} piksel</small> : <small>Görsel kontrol ediliyor…</small>}
              {dimensions ? <p className={fileMatchesRatio ? styles.fileOk : styles.fileMismatch}>{fileMatchesRatio ? <><CheckCircle2 aria-hidden="true" /> Bu görsel uygun.</> : "Bu görsel seçtiğiniz şekle uymuyor."}</p> : null}
            </div>
          </div> : null}
          <label className={styles.altField}><span>Görselde ne var?</span><small>Örnek: Altın yüzüklerin yer aldığı ana sayfa bannerı</small><input name="altText" maxLength={500} required placeholder="Görseli kısa ve açık anlatın" /></label>
        </div>
        {fileError ? <p role="alert" className={styles.fileError}>{fileError}</p> : null}
        <button ref={uploadRef} className={styles.uploadButton} type="submit" disabled={busy || !selectedFile || !dimensions || !fileMatchesRatio}>{busy ? <LoaderCircle aria-hidden="true" /> : <ImagePlus aria-hidden="true" />} Yükle</button>
      </fieldset>
    </form> : null}
    {loading ? <p className={styles.state}>Yükleniyor…</p> : assets.length === 0 ? <p className={styles.state}>Henüz vitrin görseli yok.</p> : <ul className={styles.grid}>
      {assets.map((asset) => <li key={asset.id} className={styles.card}>
        <div className={styles.assetImageFrame}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={asset.publicUrl} alt={asset.altText} width={asset.width} height={asset.height} style={{ aspectRatio: `${asset.width} / ${asset.height}` }} /></div>
        <div className={styles.assetMeta}><div><strong>{({ logo: "Logo", hero: "Ana sayfa bannerı", category: "Kategori görseli", social: "Sosyal paylaşım", favicon: "Site simgesi" } as Record<StorefrontAssetKind, string>)[asset.kind]}</strong><span className={styles.ratioBadge}>{storefrontAssetRatioLabel(asset.width, asset.height)}</span></div><small>{asset.width}×{asset.height} · {Math.ceil(asset.byteSize / 1024)} KB</small></div>
        {canManage ? <div className={styles.actions}>
          {asset.kind === "hero" ? <button type="button" disabled={busy} onClick={() => void useFor(asset, "hero_banner")}>Hero olarak kullan</button> : null}
          {asset.kind === "logo" ? <button type="button" disabled={busy} onClick={() => void useFor(asset, "theme_setting")}>Logo olarak kullan</button> : null}
          {asset.kind === "social" ? <button type="button" disabled={busy} onClick={() => void useFor(asset, "social_preview")}>Sosyal görsel olarak kullan</button> : null}
          <button type="button" disabled={busy} onClick={() => void archive(asset)}><Archive aria-hidden="true" /> Arşivle</button>
        </div> : null}
      </li>)}
    </ul>}
  </section>;
}
