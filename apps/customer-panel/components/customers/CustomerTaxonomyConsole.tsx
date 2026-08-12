"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CustomerSegment, CustomerTag } from "@celebix/saas-contracts";
import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { CustomerApiError, customerApi } from "@/lib/customer-ui/client";
import styles from "./customer-console.module.css";

const DEFAULT_TAG_COLOR = "#7c3aed";

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
    [nameError, setNameError] = useState(""),
    [tagName, setTagName] = useState(""),
    [tagColor, setTagColor] = useState(DEFAULT_TAG_COLOR);
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
    if (!name) {
      setNameError(kind === "tags" ? "Etiket adı gerekli." : "Segment adı gerekli.");
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
      if (kind === "tags") {
        setTagName("");
        setTagColor(DEFAULT_TAG_COLOR);
      }
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
      <section className={kind === "segments" ? styles.segmentWorkspace : styles.tagWorkspace}>
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
            <section className={styles.tagCreatePanel} aria-labelledby="tag-create-title">
              <header className={styles.tagCreateHeader}>
                <div><h2 id="tag-create-title">Yeni etiket</h2><p>Müşteri kayıtlarında tekrar kullanabileceğiniz görünür bir etiket oluşturun.</p></div>
              </header>
              <form className={styles.tagCreateForm} onSubmit={submit} noValidate>
                <label className={styles.tagField}>
                  <span>Etiket adı</span>
                  <input
                    name="name"
                    value={tagName}
                    placeholder="Örn. VIP"
                    aria-invalid={nameError ? "true" : undefined}
                    aria-describedby={nameError ? "tag-name-error" : undefined}
                    onChange={(event) => { setTagName(event.currentTarget.value); if (nameError) setNameError(""); }}
                    maxLength={64}
                  />
                  <small id="tag-name-error" className={nameError ? styles.tagFieldError : styles.tagFieldHint} aria-live="polite">
                    {nameError || "Kısa ve kolay taranabilir bir etiket adı kullanın."}
                  </small>
                </label>
                <label className={styles.tagColorField}>
                  <span>Renk</span>
                  <span className={styles.tagColorControl}>
                    <i style={{ backgroundColor: tagColor }} aria-hidden="true" />
                    <code>{tagColor.toUpperCase()}</code>
                    <b>Değiştir</b>
                    <input
                      name="secondary"
                      type="color"
                      value={tagColor}
                      aria-label="Etiket rengini seç"
                      onChange={(event) => setTagColor(event.currentTarget.value)}
                    />
                  </span>
                  <small className={styles.tagFieldHint}>Etiketi listelerde ayırt eden renk.</small>
                </label>
                <div className={styles.tagPreviewField}>
                  <span>Önizleme</span>
                  <span
                    className={styles.tagPreviewChip}
                    style={{ backgroundColor: `${tagColor}14`, borderColor: `${tagColor}3d` }}
                  >
                    <i style={{ backgroundColor: tagColor }} aria-hidden="true" />
                    {tagName.trim() || "Etiket önizleme"}
                  </span>
                  <small>Yalnız frontend önizlemesidir.</small>
                </div>
                <button className={styles.tagCreateButton} disabled={busy}>
                  {busy ? "Oluşturuluyor…" : "Etiket oluştur"}
                </button>
              </form>
            </section>
          )
        ) : null}
        {error ? (
          <p className={kind === "segments" ? styles.segmentApiError : styles.tagApiError} role="alert">
            {error}
          </p>
        ) : null}
        {loading ? (
          <div className={kind === "segments" ? styles.segmentLoading : styles.tagLoading} role="status">
            {kind === "segments" ? "Segmentler yükleniyor…" : "Etiketler yükleniyor…"}
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
            <section className={styles.tagListPanel} aria-labelledby="tags-list-title">
              <header className={styles.tagListTitle}><div><h2 id="tags-list-title">Etiketler</h2><p>Müşteri sınıflandırmalarınız burada listelenir.</p></div><span>0 kayıt</span></header>
              <div className={styles.tagEmpty}>
                <strong>Henüz etiketler yok</strong>
                <p>Müşterilerinizi daha hızlı sınıflandırmak için ilk etiketinizi oluşturun.</p>
              </div>
            </section>
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
            <section className={styles.tagListPanel} aria-labelledby="tags-list-title">
              <header className={styles.tagListTitle}><div><h2 id="tags-list-title">Etiketler</h2><p>Etiket renklerini ve müşteri kullanımını izleyin.</p></div><span>{items.length.toLocaleString("tr-TR")} kayıt</span></header>
              <div className={styles.tagListHeader} aria-hidden="true"><span>Etiket</span><span>Renk</span><span>Kullanım</span></div>
              <div className={styles.tagRows}>
                {items.map((item) => (
                  <article className={styles.tagRow} key={item.id}>
                    {"color" in item ? (
                      <span className={styles.tagListChip} style={{ backgroundColor: `${item.color}14`, borderColor: `${item.color}3d` }}>
                        <i style={{ backgroundColor: item.color }} aria-hidden="true" />{item.name}
                      </span>
                    ) : null}
                    <span className={styles.tagColorValue}>{"color" in item ? <><i style={{ backgroundColor: item.color }} aria-hidden="true" /><code>{item.color.toUpperCase()}</code></> : null}</span>
                    <strong className={styles.tagCustomerCount}>{item.customerCount.toLocaleString("tr-TR")} müşteri</strong>
                  </article>
                ))}
              </div>
            </section>
          )
        )}
      </section>
    </PanelPageShell>
  );
}
