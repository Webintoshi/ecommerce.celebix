"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CatalogImportFormat } from "@celebix/saas-contracts";

import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { catalogAdminApi } from "@/lib/catalog-admin-ui/client";
import {
  createCatalogImportPreparationController,
  EMPTY_CATALOG_IMPORT_PREPARATION_SNAPSHOT,
  type CatalogImportPreparationSnapshot,
} from "@/lib/catalog-admin-ui/import-preparation-controller";
import styles from "./catalog-admin-console.module.css";

type Props = Readonly<{
  format: CatalogImportFormat;
  title: string;
  description: string;
  canImport: boolean;
}>;

function price(cents: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(cents / 100);
}

export function CatalogImportPreparationConsole({ format, title, description, canImport }: Props) {
  const bindingKey = `${format}:${canImport}`;
  const [binding, setBinding] = useState<Readonly<{ key: string; snapshot: CatalogImportPreparationSnapshot }>>({
    key: bindingKey,
    snapshot: EMPTY_CATALOG_IMPORT_PREPARATION_SNAPSHOT,
  });
  const controllerRef = useRef<ReturnType<typeof createCatalogImportPreparationController> | undefined>(undefined);
  const controllerKeyRef = useRef("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  const snapshot = binding.key === bindingKey ? binding.snapshot : EMPTY_CATALOG_IMPORT_PREPARATION_SNAPSHOT;
  const preview = snapshot.preview;

  useEffect(() => {
    const controller = createCatalogImportPreparationController({
      api: catalogAdminApi,
      canImport,
      format,
      onChange(next) { setBinding({ key: bindingKey, snapshot: next }); },
    });
    controllerRef.current = controller;
    controllerKeyRef.current = bindingKey;
    setBinding({ key: bindingKey, snapshot: controller.getSnapshot() });
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = undefined;
      if (controllerKeyRef.current === bindingKey) controllerKeyRef.current = "";
    };
  }, [bindingKey, canImport, format]);

  useEffect(() => { if (snapshot.error) errorRef.current?.focus(); }, [snapshot.error]);
  useEffect(() => { if (preview) previewHeadingRef.current?.focus(); }, [preview]);

  useEffect(() => {
    if (!preview || preview.status !== "prepared") return;
    const remaining = Date.parse(preview.expiresAt) - Date.now();
    if (remaining <= 0) {
      controllerRef.current?.refreshClock();
      return;
    }
    const timer = window.setTimeout(() => controllerRef.current?.refreshClock(), remaining + 1);
    return () => window.clearTimeout(timer);
  }, [preview]);

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (controllerKeyRef.current !== bindingKey) return;
    const file = new FormData(event.currentTarget).get("file");
    if (!(file instanceof File)) return;
    const controller = controllerRef.current;
    await controller?.prepare(file);
    if (controllerRef.current === controller && controller?.getSnapshot().phase === "prepared") formRef.current?.reset();
  }

  const busy = snapshot.phase === "preparing" || snapshot.phase === "committing" || snapshot.phase === "verifying";
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
            <label className={styles.fileField}><span>CSV dosyası</span><input name="file" type="file" accept=".csv,text/csv" required disabled={busy} onChange={() => controllerRef.current?.resetSelection()} /></label>
            <button className={styles.primary} disabled={busy}>{snapshot.phase === "preparing" ? "Önizleme oluşturuluyor…" : "Önizleme oluştur"}</button>
          </form>
        )}
        {snapshot.notice ? <p className={styles.notice} role="status" aria-live="polite">{snapshot.notice}</p> : null}
        {snapshot.error ? <p ref={errorRef} className={styles.error} role="alert" tabIndex={-1}>{snapshot.error}</p> : null}
        {preview ? (
          <section className={styles.preview} aria-labelledby="catalog-import-preview-title">
            <div className={styles.previewHeader}><div><h2 ref={previewHeadingRef} id="catalog-import-preview-title" tabIndex={-1}>Kalıcı önizleme</h2><p>{preview.totalRows} satır doğrulandı · sürüm {preview.version}</p></div><span className={styles.status}>{preview.status}</span></div>
            <p className={styles.previewMeta}>{preview.fileName} · Son onay zamanı {new Date(preview.expiresAt).toLocaleString("tr-TR")}</p>
            <div className={styles.tableScroll}><table className={styles.previewTable} aria-label="Doğrulanan ürün önizlemesi"><thead><tr><th>Ürün</th><th>URL anahtarı</th><th>SKU</th><th>Fiyat</th><th>Stok</th></tr></thead><tbody>{preview.rows.map((row, index) => <tr key={`${row.slug}-${index}`}><td>{row.title}</td><td>{row.slug}</td><td>{row.sku ?? "—"}</td><td>{price(row.priceCents)}</td><td>{row.stockQuantity}</td></tr>)}</tbody></table></div>
            {canImport ? <div className={styles.actions}><button className={styles.primary} type="button" disabled={!snapshot.canCommit} onClick={() => void controllerRef.current?.commit()}>{snapshot.phase === "committing" || snapshot.phase === "verifying" ? "Aktarım doğrulanıyor…" : "Kataloğa aktar"}</button>{snapshot.phase === "prepared" && !snapshot.canCommit ? <small>Önizleme süresi doldu; yeniden hazırlayın.</small> : null}</div> : null}
          </section>
        ) : null}
      </section>
    </PanelPageShell>
  );
}
