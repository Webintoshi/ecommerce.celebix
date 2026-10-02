"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { CatalogAdminImportJob } from "@celebix/saas-contracts";
import { Download, FileSpreadsheet, Link2, PackageCheck, RotateCcw } from "lucide-react";
import { PanelEmptyState, PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { CatalogAdminApiError, catalogAdminApi } from "@/lib/catalog-admin-ui/client";
import { compileWooCommerceMigration, type WooCommerceMigrationManifest } from "@/lib/catalog-import/woocommerce-migration";
import { compileQukasoftMigration, type QukasoftMigrationManifest } from "@/lib/catalog-import/qukasoft-migration";
import { WooCommerceMigrationApiError, qukasoftMigrationApi, wooCommerceMigrationApi } from "@/lib/catalog-migration-http/client";
import { runWooCommerceMigration, type WooCommerceMigrationProgress } from "@/lib/catalog-migration-http/workflow";
import {
  CATALOG_IMPORT_PROVIDERS,
  buildCatalogImportTemplate,
  parseCatalogImportSource,
  type CatalogImportFormat,
  type CatalogImportParseResult,
  type CatalogImportProvider,
} from "@/lib/catalog-import/providers";
import styles from "./catalog-admin-console.module.css";

const MAX_SOURCE_BYTES = 524_288;
const MAX_WOOCOMMERCE_SOURCE_BYTES = 4 * 1024 * 1024;
const CONTROL = /[\u0000-\u001f\u007f]/;
type Busy = "idle" | "preview" | "import";
type Preview = CatalogImportParseResult & Readonly<{ format: CatalogImportFormat; fileName: string }>;
type MigrationSummary = Readonly<{ productCount: number; variantCount: number; mediaCount: number; warningCount: number; warnings: readonly string[] }>;
type MigrationManifest = WooCommerceMigrationManifest | QukasoftMigrationManifest;

function fileFormat(file: File): CatalogImportFormat | null {
  const extension = file.name.toLowerCase().split(".").at(-1);
  return extension === "csv" || extension === "json" || extension === "xml" ? extension : null;
}

function safeFileName(value: string): string | null {
  return value.length >= 1 && value.length <= 200 && value === value.trim() && !CONTROL.test(value) ? value : null;
}

function message(caught: unknown, fallback: string): string {
  return caught instanceof CatalogAdminApiError || caught instanceof WooCommerceMigrationApiError ? caught.message : fallback;
}

export function CatalogBulkImportConsole({ canImport }: { canImport: boolean }) {
  const [items, setItems] = useState<readonly CatalogAdminImportJob[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [provider, setProvider] = useState<CatalogImportProvider>("generic");
  const [sourceMode, setSourceMode] = useState<"file" | "feed">("file");
  const [feedUrl, setFeedUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [operationId, setOperationId] = useState("");
  const [busy, setBusy] = useState<Busy>("idle");
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [migrationSummary, setMigrationSummary] = useState<MigrationSummary | null>(null);
  const [migrationProgress, setMigrationProgress] = useState<WooCommerceMigrationProgress | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const migrationManifestRef = useRef<MigrationManifest | null>(null);
  const previewRequestRef = useRef(0);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try { setItems(await catalogAdminApi.imports()); }
    catch (caught) { setError(message(caught, "Yükleme geçmişi alınamadı.")); }
    finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  function clearPreview() {
    previewRequestRef.current += 1;
    setPreview(null);
    setOperationId("");
    setCompleted(false);
    setNotice("");
    setError("");
    setMigrationSummary(null);
    setMigrationProgress(null);
    migrationManifestRef.current = null;
  }

  function selectProvider(next: CatalogImportProvider) {
    setProvider(next);
    if (next === "qukasoft") setSourceMode("file");
    clearPreview();
    if (fileRef.current) fileRef.current.value = "";
  }

  function acceptPreview(result: CatalogImportParseResult, format: CatalogImportFormat, fileName: string) {
    setPreview(Object.freeze({ ...result, format, fileName }));
    setOperationId(crypto.randomUUID());
    setCompleted(false);
    setNotice(`${result.products.length} ürün ve ${result.products.reduce((total, product) => total + product.variants.length, 0)} varyant doğrulandı.`);
    setError("");
  }

  async function previewFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy !== "idle") return;
    const file = fileRef.current?.files?.[0];
    const format = file ? fileFormat(file) : null;
    const fileName = file ? safeFileName(file.name) : null;
    const maximum = provider === "woocommerce" || provider === "qukasoft" ? MAX_WOOCOMMERCE_SOURCE_BYTES : MAX_SOURCE_BYTES;
    if (!file || !format || !fileName || file.size < 1 || file.size > maximum || (provider === "woocommerce" && format !== "csv") || (provider === "qukasoft" && format !== "xml")) {
      setError(provider === "qukasoft" ? "En fazla 4 MiB olan Qukasoft XML ürün dışa aktarımını seçin." : provider === "woocommerce" ? "En fazla 4 MiB olan resmi WooCommerce CSV dışa aktarımını seçin." : "En fazla 512 KiB olan geçerli bir CSV, JSON veya XML dosyası seçin.");
      return;
    }
    const requestId = ++previewRequestRef.current;
    setBusy("preview"); setError(""); setNotice("");
    try {
      const source = await file.text();
      if (previewRequestRef.current !== requestId) return;
      if (provider === "woocommerce" || provider === "qukasoft") {
        const manifest = provider === "qukasoft" ? await compileQukasoftMigration(source) : await compileWooCommerceMigration(source);
        if (previewRequestRef.current !== requestId) return;
        migrationManifestRef.current = manifest;
        const warningCount = Object.values(manifest.warningCounts).reduce((total, value) => total + value, 0);
        const variantCount = manifest.products.reduce((total, product) => total + product.variants.length, 0);
        const counts = manifest.warningCounts;
        const warnings: string[] = [];
        if (counts.missingPriceDrafted) warnings.push(`${counts.missingPriceDrafted} ürün fiyatı eksik olduğu için taslak aktarılacak.`);
        if (counts.missingImage) warnings.push(`${counts.missingImage} üründe görsel bulunmuyor.`);
        if (counts.availabilityStockMapped) warnings.push(`${counts.availabilityStockMapped} ürünün stok adedi bulunmadığı için stok durumu adede dönüştürüldü.`);
        if (counts.duplicateImagesRemoved) warnings.push(`${counts.duplicateImagesRemoved} tekrarlanan görsel tek kez aktarılacak.`);
        if (counts.descriptionSanitized) warnings.push(`${counts.descriptionSanitized} açıklama güvenli metne dönüştürüldü.`);
        if ("incompleteVariants" in counts) {
          if (counts.incompleteVariants) warnings.push(`${counts.incompleteVariants} varyantın satış bilgileri eksik; kaynak bilgileri korunacak, satışa açılmayacak.`);
          if (counts.duplicateVariants) warnings.push(`${counts.duplicateVariants} tekrarlanan varyant tek kez aktarılacak.`);
          if (counts.ambiguousWeight) warnings.push(`${counts.ambiguousWeight} üründe ağırlık belirsiz; ağırlık alanı boş bırakılacak.`);
          if (counts.conflictingAttributes) warnings.push(`${counts.conflictingAttributes} özellik için birden fazla kaynak değer korunacak.`);
        }
        setMigrationSummary(Object.freeze({ productCount: manifest.products.length, variantCount, mediaCount: manifest.mediaCount, warningCount, warnings: Object.freeze(warnings) }));
        acceptPreview(Object.freeze({ products: Object.freeze(manifest.products.slice(0, 25).map((product) => Object.freeze({ title: product.title, slug: product.slug, ...(product.description ? { description: product.description } : {}), status: product.status, variants: product.variants }))), warnings: Object.freeze([]), skippedRows: 0, totalRows: manifest.products.length }), format, fileName);
        setNotice(`${manifest.products.length} ürün, ${variantCount} varyant ve ${manifest.mediaCount} görsel doğrulandı. İlk 25 ürün önizleniyor.`);
      } else {
        const result = parseCatalogImportSource(source, { provider, format });
        acceptPreview(result, format, fileName);
      }
    }
    catch { if (previewRequestRef.current === requestId) setError("Dosya seçilen platformun ürün biçimine uymuyor."); }
    finally { setBusy("idle"); }
  }

  async function previewFeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy !== "idle") return;
    const requestId = ++previewRequestRef.current;
    setBusy("preview"); setError(""); setNotice("");
    try {
      const result = await catalogAdminApi.previewFeed({ provider, url: feedUrl });
      if (previewRequestRef.current !== requestId) return;
      acceptPreview(result, result.format, `feed-${provider}.${result.format}`);
    } catch (caught) { if (previewRequestRef.current === requestId) setError(message(caught, "Feed güvenle alınamadı veya ürün biçimi geçersiz.")); }
    finally { setBusy("idle"); }
  }

  async function importProducts() {
    if (!preview || !operationId || busy !== "idle") return;
    setBusy("import"); setError(""); setNotice("");
    try {
      const manifest = migrationManifestRef.current;
      if (manifest) {
        const result = await runWooCommerceMigration(manifest, provider === "qukasoft" ? qukasoftMigrationApi : wooCommerceMigrationApi, () => crypto.randomUUID(), setMigrationProgress);
        migrationManifestRef.current = null;
        setCompleted(true);
        setNotice(result.failedMedia === 0
          ? `${result.importedProducts} ürün ve ${result.committedMedia} görsel mağazanıza aktarıldı.`
          : `${result.importedProducts} ürün aktarıldı; ${result.committedMedia} görsel tamamlandı. ${result.failedMedia} görseli yeniden denemek için aynı dosyayı seçin.`);
      } else {
        await catalogAdminApi.importProducts({ fileName: preview.fileName, products: preview.products }, operationId);
        setCompleted(true);
        setNotice(`${preview.products.length} ürün kalıcı kataloğa aktarıldı.`);
        await loadHistory();
      }
    } catch (caught) {
      const requiresReselection = Boolean(migrationManifestRef.current);
      if (requiresReselection) {
        migrationManifestRef.current = null;
        setPreview(null);
        setMigrationSummary(null);
      }
      setError(message(caught, requiresReselection
        ? "Aktarım güvenle durdu. Devam etmek için aynı ürün dosyasını yeniden seçin."
        : "Aktarım uygulanmadı. Önizlemeniz korundu; yeniden deneyebilirsiniz."));
    }
    finally { setBusy("idle"); }
  }

  function downloadTemplate() {
    const content = buildCatalogImportTemplate(provider);
    const href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = href; anchor.download = `${provider}-urun-sablonu.csv`; anchor.click();
    URL.revokeObjectURL(href);
  }

  const step = completed ? 4 : preview ? 3 : 2;
  const variantCount = migrationSummary?.variantCount ?? preview?.products.reduce((total, product) => total + product.variants.length, 0) ?? 0;
  const productCount = migrationSummary?.productCount ?? preview?.products.length ?? 0;

  return <PanelPageShell>
    <PanelPageHeader title="Toplu Ürün Aktarımı" description="Platformunuzun ürün dosyasını veya HTTPS feed adresini ekleyin." />
    <h1 className={styles.srOnly}>Toplu Ürün Aktarımı</h1>
    <section className={`${styles.importWorkspace} ${styles.workspace}`}>
      <ol className={styles.steps} aria-label="Aktarım adımları">
        {["Platform seçimi", "Kaynak seçimi", "Önizleme", "Aktarım"].map((label, index) => <li className={index + 1 <= step ? styles.stepActive : undefined} key={label} aria-current={index + 1 === step ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}
      </ol>

      {!canImport ? <p className={styles.error} role="alert">Bu mağazada toplu ürün aktarımı için yetkiniz yok.</p> : <>
        <section className={styles.importSection} aria-labelledby="platform-heading">
          <div className={styles.sectionHeading}><div><span>1. adım</span><h2 id="platform-heading">Platformunuzu seçin</h2><p>Ürünleri dışa aktardığınız sistemi seçin.</p></div>{provider !== "qukasoft" ? <button className={styles.secondaryButton} type="button" onClick={downloadTemplate}><Download size={18} aria-hidden />Şablonu indir</button> : null}</div>
          <fieldset className={styles.providerGrid} disabled={busy !== "idle"}><legend className={styles.srOnly}>Platform seçimi</legend>{CATALOG_IMPORT_PROVIDERS.map((item) => <label className={`${styles.providerCard} ${provider === item.id ? styles.providerSelected : ""}`} key={item.id}><input type="radio" name="provider" value={item.id} checked={provider === item.id} onChange={() => selectProvider(item.id)} /><strong>{item.label}</strong><small>{item.description}</small></label>)}</fieldset>
        </section>

        <section className={styles.importSection} aria-labelledby="source-heading">
          <div className={styles.sectionHeading}><div><span>2. adım</span><h2 id="source-heading">Ürün kaynağını ekleyin</h2><p>{provider === "qukasoft" ? "Qukasoft XML dosyası ürünleri, varyantları, kategorileri, markaları ve görselleri taşır." : "Ürün dosyanızı yükleyin veya feed adresini ekleyin."}</p></div></div>
          <div className={styles.sourceTabs} role="tablist" aria-label="Kaynak seçimi" onKeyDown={(event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || busy !== "idle" || provider === "qukasoft") return; event.preventDefault(); const next = event.key === "Home" ? "file" : event.key === "End" ? "feed" : sourceMode === "file" ? "feed" : "file"; setSourceMode(next); clearPreview(); document.getElementById(`catalog-source-${next}`)?.focus(); }}>
            <button id="catalog-source-file" type="button" role="tab" aria-controls="catalog-source-panel" tabIndex={sourceMode === "file" ? 0 : -1} aria-selected={sourceMode === "file"} disabled={busy !== "idle"} className={sourceMode === "file" ? styles.tabActive : undefined} onClick={() => { setSourceMode("file"); clearPreview(); }}><FileSpreadsheet size={19} aria-hidden />Dosyadan yükle</button>
            {provider !== "qukasoft" ? <button id="catalog-source-feed" type="button" role="tab" aria-controls="catalog-source-panel" tabIndex={sourceMode === "feed" ? 0 : -1} aria-selected={sourceMode === "feed"} disabled={busy !== "idle"} className={sourceMode === "feed" ? styles.tabActive : undefined} onClick={() => { setSourceMode("feed"); clearPreview(); }}><Link2 size={19} aria-hidden />Feed adresi</button> : null}
          </div>
          {sourceMode === "file" ? <form key="file" id="catalog-source-panel" role="tabpanel" aria-labelledby="catalog-source-file" className={styles.sourceForm} onSubmit={previewFile}><label htmlFor="catalog-import-file">{provider === "qukasoft" ? "Qukasoft XML dosyası" : "CSV, JSON veya XML dosyası"} <small>{provider === "qukasoft" ? "XML · en fazla 4 MiB · 2.500 ürün · ürün başına 16 görsel ve 50 varyant" : provider === "woocommerce" ? "Resmi WooCommerce CSV · en fazla 4 MiB · 2.500 ürün · ürün başına 16 görsel" : "En fazla 512 KiB · 100 ürün · ürün başına 50 varyant"}</small></label><input ref={fileRef} id="catalog-import-file" type="file" accept={provider === "qukasoft" ? ".xml,application/xml,text/xml" : provider === "woocommerce" ? ".csv,text/csv" : ".csv,.json,.xml,text/csv,application/json,application/xml,text/xml"} required disabled={busy !== "idle"} onChange={clearPreview} /><button className={preview ? styles.button : styles.primary} disabled={busy !== "idle"}>{busy === "preview" ? "Doğrulanıyor…" : "Dosyayı önizle"}</button></form> : <form key="feed" id="catalog-source-panel" role="tabpanel" aria-labelledby="catalog-source-feed" className={styles.sourceForm} onSubmit={previewFeed}><label htmlFor="catalog-feed-url">Güvenli HTTPS feed adresi <small>CSV, JSON veya XML · yönlendirmeler ve private ağlar otomatik denetlenir</small></label><input id="catalog-feed-url" type="url" inputMode="url" placeholder="https://feed.magazaniz.com/products.xml" value={feedUrl} disabled={busy !== "idle"} onChange={(event) => { setFeedUrl(event.currentTarget.value); clearPreview(); }} required maxLength={2048} /><button className={preview ? styles.button : styles.primary} disabled={busy !== "idle"}>{busy === "preview" ? "Feed doğrulanıyor…" : "Feed'i önizle"}</button></form>}
        </section>

        {preview ? <section className={styles.importSection} aria-labelledby="preview-heading">
          <div className={styles.sectionHeading}><div><span>3. adım</span><h2 id="preview-heading">Önizleme</h2><p>Ürünleri ve varyantları kontrol edin.</p></div><button className={styles.secondaryButton} type="button" onClick={clearPreview}><RotateCcw size={18} aria-hidden />Baştan seç</button></div>
          <div className={styles.previewMetrics}><div><strong>{productCount}</strong><span>ürün</span></div><div><strong>{variantCount}</strong><span>varyant</span></div><div><strong>{migrationSummary?.mediaCount ?? preview.skippedRows}</strong><span>{migrationSummary ? "görsel" : "atlanmış satır"}</span></div><div><strong>{migrationSummary?.warningCount ?? preview.warnings.length}</strong><span>uyarı</span></div></div>
          {migrationSummary ? <p className={styles.migrationNote} role="status">Ürünler ve görseller aşamalı aktarılır. Kesinti olursa aynı dosyayı seçerek devam edebilirsiniz.</p> : null}
          {migrationSummary?.warnings.map((warning) => <p className={styles.warning} role="status" key={warning}>{warning}</p>)}
          {preview.warnings.includes("unsupported_fields_ignored") ? <p className={styles.warning} role="status">Kategori, etiket, SEO veya uzaktaki görsel alanları bu aktarımda desteklenmediği için güvenle atlandı.</p> : null}
          <div className={styles.previewTableWrap} role="region" aria-label="Aktarılacak ürünler" tabIndex={0}><table className={styles.previewTable}><thead><tr><th>Ürün</th><th>Durum</th><th>Varyant</th><th>SKU</th><th>Fiyat</th><th>Stok</th></tr></thead><tbody>{preview.products.flatMap((product) => product.variants.map((variant, index) => <tr key={`${product.slug}-${variant.sku ?? index}`}><td><strong>{index === 0 ? product.title : ""}</strong>{index === 0 ? <small>{product.slug}</small> : null}</td><td>{index === 0 ? product.status : ""}</td><td>{variant.title}</td><td>{variant.sku ?? "—"}</td><td>{new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(variant.priceCents / 100)}</td><td>{variant.stockQuantity}</td></tr>))}</tbody></table></div>
          <div className={styles.importActions}><p>{migrationSummary ? "Aktarım durursa tamamlanan ürünler korunur." : "Bir satır çakışırsa bu aktarımda hiçbir ürün yazılmaz."}</p><button type="button" className={styles.primary} disabled={busy !== "idle" || completed} onClick={() => void importProducts()}><PackageCheck size={19} aria-hidden />{completed ? "Aktarım tamamlandı" : busy === "import" ? "Kalıcı kataloğa yazılıyor…" : "Ürünleri aktar"}</button></div>
          {migrationProgress ? <div className={styles.migrationProgress} role="status" aria-live="polite"><span>{migrationProgress.phase === "products" ? "Ürünler" : "Görseller"}</span><progress max={migrationProgress.total} value={migrationProgress.completed} /><strong>{migrationProgress.completed}/{migrationProgress.total}</strong></div> : null}
        </section> : null}
      </>}

      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>

    <section className={`${styles.surface} ${styles.workspace}`} aria-labelledby="history-heading">
      <div className={styles.historyHeading}><div><span>Geçmiş</span><h2 id="history-heading">Son toplu aktarımlar</h2></div><button type="button" className={styles.secondaryButton} onClick={() => void loadHistory()} disabled={historyLoading}><RotateCcw size={18} aria-hidden />Yenile</button></div>
      {historyLoading ? <div className={styles.state} role="status">Yükleme geçmişi alınıyor…</div> : items.length === 0 ? <PanelEmptyState title="Henüz toplu yükleme yok" description="İlk gerçek yükleme tamamlandığında burada görünecek." /> : <div className={styles.list}>{items.map((job) => <article className={styles.item} key={job.id}><div><h2>{job.fileName}</h2><p>{job.succeededRows}/{job.totalRows} başarılı · {job.failedRows} hatalı</p></div><span className={styles.status}>{{ processing: "İşleniyor", completed: "Tamamlandı", failed: "Başarısız" }[job.status]}</span></article>)}</div>}
    </section>
  </PanelPageShell>;
}
