"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CustomerSegment, CustomerTag } from "@celebix/saas-contracts";
import {
  PanelEmptyState,
  PanelPageHeader,
  PanelPageShell,
} from "@/components/panel/PanelPageShell";
import { CustomerApiError, customerApi } from "@/lib/customer-ui/client";
import styles from "./customer-console.module.css";
export function CustomerTaxonomyConsole({
  kind,
  canManage,
}: {
  kind: "tags" | "segments";
  canManage: boolean;
}) {
  const title = kind === "tags" ? "Etiketler" : "Müşteri Segmentleri",
    [items, setItems] = useState<readonly (CustomerTag | CustomerSegment)[]>(
      [],
    ),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [nameError, setNameError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(
        kind === "tags"
          ? await customerApi.tags()
          : await customerApi.segments(),
      );
    } catch (e) {
      setError(
        e instanceof CustomerApiError ? e.message : `${title} yüklenemedi.`,
      );
    } finally {
      setLoading(false);
    }
  }, [kind, title]);
  useEffect(() => {
    void load();
  }, [load]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form),
      name = String(f.get("name") ?? "").trim(),
      secondary = String(f.get("secondary") ?? "").trim();
    setError("");
    if (kind === "segments" && !name) {
      setNameError("Segment adı gerekli.");
      return;
    }
    setNameError("");
    setBusy(true);
    try {
      kind === "tags"
        ? await customerApi.saveTag({ name, color: secondary })
        : await customerApi.saveSegment({
            name,
            ...(secondary ? { description: secondary } : {}),
          });
      form.reset();
      await load();
    } catch (x) {
      setError(
        x instanceof CustomerApiError ? x.message : `${title} kaydedilemedi.`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <PanelPageShell>
      <PanelPageHeader
        title={title}
        description={
          kind === "tags"
            ? "Müşterileri görünür ve yeniden kullanılabilir etiketlerle sınıflandırın."
            : "Manuel müşteri grupları oluşturun ve üye sayılarını izleyin."
        }
      />
      <section className={kind === "segments" ? styles.segmentWorkspace : styles.taxonomy}>
        {canManage ? (
          kind === "segments" ? (
            <section className={styles.segmentCreatePanel} aria-labelledby="segment-create-title">
              <header className={styles.segmentCreateHeader}>
                <div><h2 id="segment-create-title">Yeni segment</h2><p>Müşterileri tekrar kullanılabilir manuel gruplarda düzenleyin.</p></div>
              </header>
              <form className={styles.segmentCreateForm} onSubmit={submit} noValidate>
                <label className={styles.segmentField}>
                  <span>Segment adı</span>
                  <input
                    name="name"
                    placeholder="Örn. Sadakat müşterileri"
                    aria-invalid={nameError ? "true" : undefined}
                    aria-describedby={nameError ? "segment-name-error" : undefined}
                    onChange={() => { if (nameError) setNameError(""); }}
                    maxLength={100}
                  />
                  <small id="segment-name-error" className={nameError ? styles.segmentFieldError : styles.segmentFieldHint} aria-live="polite">
                    {nameError || "Müşterilerde görünecek kısa ve net bir ad kullanın."}
                  </small>
                </label>
                <label className={styles.segmentField}>
                  <span>Açıklama <small>Opsiyonel</small></span>
                  <input name="secondary" placeholder="Segmentin kullanım amacını belirtin" maxLength={500} />
                  <small className={styles.segmentFieldHint}>Ekibinizin segmenti doğru kullanmasına yardımcı olur.</small>
                </label>
                <button className={styles.segmentCreateButton} disabled={busy}>
                  {busy ? "Oluşturuluyor…" : "Segment oluştur"}
                </button>
              </form>
            </section>
          ) : (
            <form className={styles.taxonomyForm} onSubmit={submit}>
              <input name="name" aria-label="Etiket adı" placeholder="Etiket adı" required maxLength={64} />
              <input name="secondary" aria-label="Etiket rengi" type="color" defaultValue="#7c3aed" maxLength={7} />
              <button className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : "Oluştur"}</button>
            </form>
          )
        ) : null}
        {error ? (
          <p className={kind === "segments" ? styles.segmentApiError : styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {loading ? (
          <div className={kind === "segments" ? styles.segmentLoading : styles.state} role="status">
            {kind === "segments" ? "Segmentler yükleniyor…" : `${title} yükleniyor…`}
          </div>
        ) : items.length === 0 ? (
          kind === "segments" ? (
            <section className={styles.segmentListPanel} aria-labelledby="segments-list-title">
              <header className={styles.segmentListTitle}><div><h2 id="segments-list-title">Segmentler</h2><p>Manuel müşteri gruplarınız burada listelenir.</p></div><span>0 kayıt</span></header>
              <div className={styles.segmentEmpty}>
                <strong>Henüz segmentler yok</strong>
                <p>Müşterilerinizi kampanya, sadakat veya operasyon ihtiyaçlarına göre gruplamak için ilk segmentinizi oluşturun.</p>
              </div>
            </section>
          ) : (
            <PanelEmptyState title="Henüz etiketler yok" description="İlk gerçek kayıt oluşturulduğunda burada görünecek." />
          )
        ) : (
          kind === "segments" ? (
            <section className={styles.segmentListPanel} aria-labelledby="segments-list-title">
              <header className={styles.segmentListTitle}><div><h2 id="segments-list-title">Segmentler</h2><p>Manuel müşteri gruplarını ve üye sayılarını izleyin.</p></div><span>{items.length.toLocaleString("tr-TR")} kayıt</span></header>
              <div className={styles.segmentListHeader} aria-hidden="true"><span>Segment</span><span>Açıklama</span><span>Üye sayısı</span></div>
              <div className={styles.segmentRows}>
                {items.map((item) => (
                  <article className={styles.segmentRow} key={item.id}>
                    <div className={styles.segmentIdentity}><strong>{item.name}</strong><small>Manuel segment</small></div>
                    <p>{"description" in item && item.description ? item.description : "Açıklama eklenmemiş"}</p>
                    <strong className={styles.segmentCustomerCount}>{item.customerCount.toLocaleString("tr-TR")} müşteri</strong>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <div className={styles.taxonomyList}>
              {items.map((i) => (
                <article className={styles.taxonomyItem} key={i.id}>
                  <div>
                    {"color" in i ? <span className={styles.color} style={{ display: "inline-block", marginRight: 8, background: i.color }} /> : null}
                    <strong>{i.name}</strong>
                  </div>
                  <span>{i.customerCount} müşteri</span>
                </article>
              ))}
            </div>
          )
        )}
      </section>
    </PanelPageShell>
  );
}
