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
  const title = kind === "tags" ? "Etiketler" : "Segmentler",
    [items, setItems] = useState<readonly (CustomerTag | CustomerSegment)[]>(
      [],
    ),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
    setBusy(true);
    setError("");
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
      <section className={styles.taxonomy}>
        {canManage ? (
          <form className={styles.taxonomyForm} onSubmit={submit}>
            <input
              name="name"
              aria-label={kind === "tags" ? "Etiket adı" : "Segment adı"}
              placeholder={kind === "tags" ? "Etiket adı" : "Segment adı"}
              required
              maxLength={kind === "tags" ? 64 : 100}
            />
            <input
              name="secondary"
              aria-label={
                kind === "tags" ? "Etiket rengi" : "Segment açıklaması"
              }
              type={kind === "tags" ? "color" : "text"}
              defaultValue={kind === "tags" ? "#7c3aed" : undefined}
              placeholder={
                kind === "segments" ? "Açıklama (opsiyonel)" : undefined
              }
              maxLength={kind === "tags" ? 7 : 500}
            />
            <button className={styles.primary} disabled={busy}>
              {busy ? "Kaydediliyor…" : "Oluştur"}
            </button>
          </form>
        ) : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {loading ? (
          <div className={styles.state} role="status">
            {title} yükleniyor…
          </div>
        ) : items.length === 0 ? (
          <PanelEmptyState
            title={`Henüz ${title.toLocaleLowerCase("tr-TR")} yok`}
            description="İlk gerçek kayıt oluşturulduğunda burada görünecek."
          />
        ) : (
          <div className={styles.taxonomyList}>
            {items.map((i) => (
              <article className={styles.taxonomyItem} key={i.id}>
                <div>
                  {kind === "tags" && "color" in i ? (
                    <span
                      className={styles.color}
                      style={{
                        display: "inline-block",
                        marginRight: 8,
                        background: i.color,
                      }}
                    />
                  ) : null}
                  <strong>{i.name}</strong>
                  {"description" in i && i.description ? (
                    <small>{i.description}</small>
                  ) : null}
                </div>
                <span>{i.customerCount} müşteri</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </PanelPageShell>
  );
}
