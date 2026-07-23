"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CatalogImportFormat, CatalogImportPreview } from "@celebix/saas-contracts";

import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { CatalogAdminApiError, catalogAdminApi } from "@/lib/catalog-admin-ui/client";
import styles from "./catalog-admin-console.module.css";

const MAX_FILE_BYTES = 131_072;

type Props = Readonly<{
  format: CatalogImportFormat;
  title: string;
  description: string;
  canImport: boolean;
}>;

export function canCommitCatalogImportPreview(
  preview: Pick<CatalogImportPreview, "status" | "expiresAt"> | undefined,
  now = Date.now(),
) {
  return Boolean(preview && preview.status === "prepared" && Date.parse(preview.expiresAt) > now);
}

function failureMessage(caught: unknown, fallback: string) {
  return caught instanceof CatalogAdminApiError ? caught.message : fallback;
}

function aborted(caught: unknown) {
  return caught instanceof DOMException && caught.name === "AbortError";
}

function price(cents: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(cents / 100);
}

export function CatalogImportPreparationConsole({ format, title, description, canImport }: Props) {
  const [preview, setPreview] = useState<CatalogImportPreview>();
  const [busyAction, setBusyAction] = useState<"prepare" | "commit">();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const activeRequest = useRef<AbortController | undefined>(undefined);
  const busyRef = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const mounted = useRef(true);
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestSequence.current += 1;
      const controller = activeRequest.current;
      if (controller) controller.abort();
    };
  }, []);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (preview) previewHeadingRef.current?.focus(); }, [preview]);

  useEffect(() => {
    if (!preview || preview.status !== "prepared") return;
    const remaining = Date.parse(preview.expiresAt) - Date.now();
    if (remaining <= 0) {
      if (now < Date.parse(preview.expiresAt)) setNow(Date.now());
      return;
    }
    const timer = window.setTimeout(() => setNow(Date.now()), remaining + 1);
    return () => window.clearTimeout(timer);
  }, [now, preview]);

  function beginRequest() {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    return { controller, sequence };
  }

  function isCurrent(sequence: number) {
    return mounted.current && requestSequence.current === sequence;
  }

  function finish(sequence: number) {
    if (!isCurrent(sequence)) return;
    activeRequest.current = undefined;
    busyRef.current = false;
    setBusyAction(undefined);
  }

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canImport || busyRef.current) return;
    const file = new FormData(event.currentTarget).get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_FILE_BYTES || !file.name.toLowerCase().endsWith(".csv")) {
      setError("En fazla 128 KB boyutunda geçerli bir CSV dosyası seçin.");
      return;
    }
    busyRef.current = true;
    setBusyAction("prepare");
    setError("");
    setNotice("");
    setPreview(undefined);
    const { controller, sequence } = beginRequest();
    let content = "";
    try {
      content = await file.text();
      if (!isCurrent(sequence)) return;
      const prepared = await catalogAdminApi.prepareImportPreview({ format, fileName: file.name, content }, controller.signal);
      content = "";
      const canonical = await catalogAdminApi.getImportPreview(prepared.id, controller.signal);
      if (!isCurrent(sequence)) return;
      setNow(Date.now());
      setPreview(canonical);
      setNotice("Önizleme hazır. Katalog henüz değiştirilmedi.");
      formRef.current?.reset();
    } catch (caught) {
      if (isCurrent(sequence) && !aborted(caught)) setError(failureMessage(caught, "CSV önizlemesi oluşturulamadı."));
    } finally {
      content = "";
      finish(sequence);
    }
  }

  async function commit() {
    if (!canImport || busyRef.current || !preview) return;
    if (!canCommitCatalogImportPreview(preview, Date.now())) {
      setNow(Date.now());
      setError("Bu önizlemenin süresi doldu. Yeni bir önizleme oluşturun.");
      return;
    }
    busyRef.current = true;
    setBusyAction("commit");
    setError("");
    setNotice("");
    const { controller, sequence } = beginRequest();
    try {
      const result = await catalogAdminApi.commitImportPreview(preview.id, preview.version, controller.signal);
      const canonical = await catalogAdminApi.getImportPreview(result.id, controller.signal);
      if (!isCurrent(sequence)) return;
      setNow(Date.now());
      setPreview(canonical);
      setNotice(`${preview.totalRows} ürün kalıcı kataloğa aktarıldı.`);
    } catch (caught) {
      if (isCurrent(sequence) && !aborted(caught)) setError(failureMessage(caught, "Katalog aktarımı tamamlanamadı."));
    } finally {
      finish(sequence);
    }
  }

  const canConfirm = canImport && !busyAction && canCommitCatalogImportPreview(preview, now);
  const guide = format === "shopify_csv"
    ? "Shopify CSV dosya dönüştürme işlemi yalnızca seçtiğiniz yerel dosyayı işler; mağaza bağlantısı veya senkronizasyon başlatmaz."
    : "Başlık sırası: title,slug,priceCents,sku,stockQuantity";

  return (
    <PanelPageShell>
      <PanelPageHeader title={title} description={description} />
      <section className={styles.surface}>
        {!canImport ? <p className={styles.warning} role="status" aria-live="polite">Bu işlem için katalog içe aktarma yetkiniz yok.</p> : (
          <form ref={formRef} className={styles.upload} onSubmit={prepare}>
            <p>{guide}</p>
            <label className={styles.fileField}><span>CSV dosyası</span><input name="file" type="file" accept=".csv,text/csv" required disabled={Boolean(busyAction)} onChange={() => { setPreview(undefined); setError(""); setNotice(""); }} /></label>
            <button className={styles.primary} disabled={Boolean(busyAction)}>{busyAction === "prepare" ? "Önizleme oluşturuluyor…" : "Önizleme oluştur"}</button>
          </form>
        )}
        {notice ? <p className={styles.notice} role="status" aria-live="polite">{notice}</p> : null}
        {error ? <p ref={errorRef} className={styles.error} role="alert" tabIndex={-1}>{error}</p> : null}
        {preview ? (
          <section className={styles.preview} aria-labelledby="catalog-import-preview-title">
            <div className={styles.previewHeader}><div><h2 ref={previewHeadingRef} id="catalog-import-preview-title" tabIndex={-1}>Kalıcı önizleme</h2><p>{preview.totalRows} satır doğrulandı · sürüm {preview.version}</p></div><span className={styles.status}>{preview.status}</span></div>
            <p className={styles.previewMeta}>{preview.fileName} · Son onay zamanı {new Date(preview.expiresAt).toLocaleString("tr-TR")}</p>
            <div className={styles.tableScroll}><table className={styles.previewTable} aria-label="Doğrulanan ürün önizlemesi"><thead><tr><th>Ürün</th><th>URL anahtarı</th><th>SKU</th><th>Fiyat</th><th>Stok</th></tr></thead><tbody>{preview.rows.map((row, index) => <tr key={`${row.slug}-${index}`}><td>{row.title}</td><td>{row.slug}</td><td>{row.sku ?? "—"}</td><td>{price(row.priceCents)}</td><td>{row.stockQuantity}</td></tr>)}</tbody></table></div>
            {canImport ? <div className={styles.actions}><button className={styles.primary} type="button" disabled={!canConfirm} onClick={() => void commit()}>{busyAction === "commit" ? "Kataloğa aktarılıyor…" : "Kataloğa aktar"}</button>{!canCommitCatalogImportPreview(preview, now) && preview.status === "prepared" ? <small>Önizleme süresi doldu; yeniden hazırlayın.</small> : null}</div> : null}
          </section>
        ) : null}
      </section>
    </PanelPageShell>
  );
}
