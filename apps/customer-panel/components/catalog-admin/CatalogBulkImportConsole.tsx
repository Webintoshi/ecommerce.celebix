"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { CatalogAdminImportJob } from "@celebix/saas-contracts";
import { Download, FileSpreadsheet, Link2, PackageCheck, RotateCcw } from "lucide-react";
import { PanelEmptyState, PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { CatalogAdminApiError, catalogAdminApi } from "@/lib/catalog-admin-ui/client";
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
const CONTROL = /[\u0000-\u001f\u007f]/;
type Busy = "idle" | "preview" | "import";
type Preview = CatalogImportParseResult & Readonly<{ format: CatalogImportFormat; fileName: string }>;

function fileFormat(file: File): CatalogImportFormat | null {
  const extension = file.name.toLowerCase().split(".").at(-1);
  return extension === "csv" || extension === "json" || extension === "xml" ? extension : null;
}

function safeFileName(value: string): string | null {
  return value.length >= 1 && value.length <= 200 && value === value.trim() && !CONTROL.test(value) ? value : null;
}

function message(caught: unknown, fallback: string): string {
  return caught instanceof CatalogAdminApiError ? caught.message : fallback;
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
  const fileRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try { setItems(await catalogAdminApi.imports()); }
    catch (caught) { setError(message(caught, "Yükleme geçmişi alınamadı.")); }
    finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  function clearPreview() {
    setPreview(null);
    setOperationId("");
    setCompleted(false);
    setNotice("");
    setError("");
  }

  function selectProvider(next: CatalogImportProvider) {
    setProvider(next);
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
    const file = fileRef.current?.files?.[0];
    const format = file ? fileFormat(file) : null;
    const fileName = file ? safeFileName(file.name) : null;
    if (!file || !format || !fileName || file.size < 1 || file.size > MAX_SOURCE_BYTES) {
      setError("En fazla 512 KiB olan geçerli bir CSV, JSON veya XML dosyası seçin.");
      return;
    }
    setBusy("preview"); setError(""); setNotice("");
    try { acceptPreview(parseCatalogImportSource(await file.text(), { provider, format }), format, fileName); }
    catch { setError("Dosya seçilen platformun ürün biçimine uymuyor."); }
    finally { setBusy("idle"); }
  }

  async function previewFeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("preview"); setError(""); setNotice("");
    try {
      const result = await catalogAdminApi.previewFeed({ provider, url: feedUrl });
      acceptPreview(result, result.format, `feed-${provider}.${result.format}`);
    } catch (caught) { setError(message(caught, "Feed güvenle alınamadı veya ürün biçimi geçersiz.")); }
    finally { setBusy("idle"); }
  }

  async function importProducts() {
    if (!preview || !operationId || busy !== "idle") return;
    setBusy("import"); setError(""); setNotice("");
    try {
      await catalogAdminApi.importProducts({ fileName: preview.fileName, products: preview.products }, operationId);
      setCompleted(true);
      setNotice(`${preview.products.length} ürün kalıcı kataloğa aktarıldı.`);
      await loadHistory();
    } catch (caught) { setError(message(caught, "Ürün aktarımı tamamlanamadı; aynı güvenli işlem kimliğiyle tekrar deneyebilirsiniz.")); }
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
  const variantCount = preview?.products.reduce((total, product) => total + product.variants.length, 0) ?? 0;

  return <PanelPageShell>
    <PanelPageHeader title="Toplu Ürün Aktarımı" description="12 platformdan dosya veya güvenli HTTPS feed ile ürünlerinizi kalıcı kataloğa taşıyın." />
    <section className={styles.importWorkspace}>
      <ol className={styles.steps} aria-label="Aktarım adımları">
        {["Platform seçimi", "Kaynak seçimi", "Önizleme", "Aktarım"].map((label, index) => <li className={index + 1 <= step ? styles.stepActive : undefined} key={label} aria-current={index + 1 === step ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}
      </ol>

      {!canImport ? <p className={styles.error} role="alert">Bu mağazada toplu ürün aktarımı için yetkiniz yok.</p> : <>
        <section className={styles.importSection} aria-labelledby="platform-heading">
          <div className={styles.sectionHeading}><div><span>1. adım</span><h2 id="platform-heading">Platformunuzu seçin</h2><p>Kaynak sütunlarını doğru eşlemek için ürünleri dışa aktardığınız sistemi seçin.</p></div><button className={styles.secondaryButton} type="button" onClick={downloadTemplate}><Download size={18} aria-hidden />Şablonu indir</button></div>
          <fieldset className={styles.providerGrid}><legend className={styles.srOnly}>Platform seçimi</legend>{CATALOG_IMPORT_PROVIDERS.map((item) => <label className={`${styles.providerCard} ${provider === item.id ? styles.providerSelected : ""}`} key={item.id}><input type="radio" name="provider" value={item.id} checked={provider === item.id} onChange={() => selectProvider(item.id)} /><strong>{item.label}</strong><small>{item.description}</small></label>)}</fieldset>
        </section>

        <section className={styles.importSection} aria-labelledby="source-heading">
          <div className={styles.sectionHeading}><div><span>2. adım</span><h2 id="source-heading">Ürün kaynağını ekleyin</h2><p>Dosyadan yükleme ve manuel feed aynı doğrulama kurallarını kullanır.</p></div></div>
          <div className={styles.sourceTabs} role="tablist" aria-label="Kaynak seçimi">
            <button type="button" role="tab" aria-selected={sourceMode === "file"} className={sourceMode === "file" ? styles.tabActive : undefined} onClick={() => { setSourceMode("file"); clearPreview(); }}><FileSpreadsheet size={19} aria-hidden />Dosyadan yükle</button>
            <button type="button" role="tab" aria-selected={sourceMode === "feed"} className={sourceMode === "feed" ? styles.tabActive : undefined} onClick={() => { setSourceMode("feed"); clearPreview(); }}><Link2 size={19} aria-hidden />Feed adresi</button>
          </div>
          {sourceMode === "file" ? <form className={styles.sourceForm} onSubmit={previewFile}><label htmlFor="catalog-import-file">CSV, JSON veya XML dosyası <small>En fazla 512 KiB · 100 ürün · ürün başına 50 varyant</small></label><input ref={fileRef} id="catalog-import-file" type="file" accept=".csv,.json,.xml,text/csv,application/json,application/xml,text/xml" required onChange={clearPreview} /><button className={styles.primary} disabled={busy !== "idle"}>{busy === "preview" ? "Doğrulanıyor…" : "Dosyayı önizle"}</button></form> : <form className={styles.sourceForm} onSubmit={previewFeed}><label htmlFor="catalog-feed-url">Güvenli HTTPS feed adresi <small>CSV, JSON veya XML · yönlendirmeler ve private ağlar otomatik denetlenir</small></label><input id="catalog-feed-url" type="url" inputMode="url" placeholder="https://feed.magazaniz.com/products.xml" value={feedUrl} onChange={(event) => { setFeedUrl(event.currentTarget.value); clearPreview(); }} required maxLength={2048} /><button className={styles.primary} disabled={busy !== "idle"}>{busy === "preview" ? "Feed doğrulanıyor…" : "Feed'i önizle"}</button></form>}
        </section>

        {preview ? <section className={styles.importSection} aria-labelledby="preview-heading">
          <div className={styles.sectionHeading}><div><span>3. adım</span><h2 id="preview-heading">Önizleme</h2><p>Kalıcı yazma başlamadan önce eşlenen ürün ve varyantları kontrol edin.</p></div><button className={styles.secondaryButton} type="button" onClick={clearPreview}><RotateCcw size={18} aria-hidden />Baştan seç</button></div>
          <div className={styles.previewMetrics}><div><strong>{preview.products.length}</strong><span>ürün</span></div><div><strong>{variantCount}</strong><span>varyant</span></div><div><strong>{preview.skippedRows}</strong><span>atlanmış satır</span></div><div><strong>{preview.warnings.length}</strong><span>uyarı</span></div></div>
          {preview.warnings.includes("unsupported_fields_ignored") ? <p className={styles.warning} role="status">Kategori, etiket, SEO veya uzaktaki görsel alanları bu aktarımda desteklenmediği için güvenle atlandı.</p> : null}
          <div className={styles.previewTableWrap}><table className={styles.previewTable}><thead><tr><th>Ürün</th><th>Durum</th><th>Varyant</th><th>SKU</th><th>Fiyat</th><th>Stok</th></tr></thead><tbody>{preview.products.flatMap((product) => product.variants.map((variant, index) => <tr key={`${product.slug}-${variant.sku ?? index}`}><td><strong>{index === 0 ? product.title : ""}</strong>{index === 0 ? <small>{product.slug}</small> : null}</td><td>{index === 0 ? product.status : ""}</td><td>{variant.title}</td><td>{variant.sku ?? "—"}</td><td>{new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(variant.priceCents / 100)}</td><td>{variant.stockQuantity}</td></tr>))}</tbody></table></div>
          <div className={styles.importActions}><p>Aktarım tek atomik işlemde tamamlanır; bir satır çakışırsa hiçbir ürün kısmen yazılmaz.</p><button type="button" className={styles.primary} disabled={busy !== "idle" || completed} onClick={() => void importProducts()}><PackageCheck size={19} aria-hidden />{completed ? "Aktarım tamamlandı" : busy === "import" ? "Kalıcı kataloğa yazılıyor…" : "Ürünleri aktar"}</button></div>
        </section> : null}
      </>}

      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>

    <section className={styles.surface} aria-labelledby="history-heading">
      <div className={styles.historyHeading}><div><span>Geçmiş</span><h2 id="history-heading">Son toplu aktarımlar</h2></div><button type="button" className={styles.secondaryButton} onClick={() => void loadHistory()} disabled={historyLoading}><RotateCcw size={18} aria-hidden />Yenile</button></div>
      {historyLoading ? <div className={styles.state} role="status">Yükleme geçmişi alınıyor…</div> : items.length === 0 ? <PanelEmptyState title="Henüz toplu yükleme yok" description="İlk gerçek yükleme tamamlandığında burada görünecek." /> : <div className={styles.list}>{items.map((job) => <article className={styles.item} key={job.id}><div><h2>{job.fileName}</h2><p>{job.succeededRows}/{job.totalRows} başarılı · {job.failedRows} hatalı</p></div><span className={styles.status}>{job.status}</span></article>)}</div>}
    </section>
  </PanelPageShell>;
}
