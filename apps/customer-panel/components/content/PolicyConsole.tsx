"use client";

import {
  FIXED_STOREFRONT_POLICIES,
  type StorefrontPolicyKey,
} from "@celebix/saas-contracts";
import type { StorePolicyAdminPage, StorePolicyStatus } from "@celebix/saas-data";
import { Check, FileText, Pencil, RefreshCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ProductDescriptionPreview } from "@/components/catalog/ProductDescriptionField";
import {
  PanelEmptyState,
  PanelPageHeader,
  PanelPageShell,
  PanelStatusBadge,
} from "@/components/panel/PanelPageShell";
import { StorePolicyApiError, storePolicyApi } from "@/lib/store-policy-ui/client";

import styles from "./policy-console.module.css";

function status(page: StorePolicyAdminPage) {
  return page.status === "published"
    ? Object.freeze({ label: "Yayında", tone: "success" as const })
    : Object.freeze({ label: "Taslak", tone: "warning" as const });
}

function updatedAt(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function PolicyConsole({
  canManage,
  initialPolicyKey,
}: {
  canManage: boolean;
  initialPolicyKey?: StorefrontPolicyKey;
}) {
  const [items, setItems] = useState<readonly StorePolicyAdminPage[]>([]);
  const [selected, setSelected] = useState<StorePolicyAdminPage | null>(null);
  const [body, setBody] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<StorePolicyStatus>("draft");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const triggerRefs = useRef(new Map<StorefrontPolicyKey, HTMLButtonElement>());
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const open = useCallback((page: StorePolicyAdminPage) => {
    setSelected(page);
    setBody(page.body);
    setSelectedStatus(page.status);
    setMessage("");
    setError("");
    queueMicrotask(() => closeButtonRef.current?.focus());
  }, []);

  const close = useCallback(() => {
    const key = selected?.key;
    setSelected(null);
    setMessage("");
    setError("");
    if (key) queueMicrotask(() => triggerRefs.current.get(key)?.focus());
  }, [selected]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const pages = await storePolicyApi.list();
      setItems(pages);
      if (initialPolicyKey) {
        const target = pages.find((page) => page.key === initialPolicyKey);
        if (target) open(target);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Politikalar yüklenemedi.");
    } finally { setLoading(false); }
  }, [initialPolicyKey, open]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, selected]);

  async function save() {
    if (!selected || !canManage || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await storePolicyApi.save(selected.key, { expectedVersion: selected.version, body, status: selectedStatus });
      setItems((current) => Object.freeze(current.map((page) => page.key === saved.key ? saved : page)));
      setSelected(saved);
      setBody(saved.body);
      setSelectedStatus(saved.status);
      setMessage("Politika güvenle kaydedildi.");
    } catch (caught) {
      if (caught instanceof StorePolicyApiError && caught.code === "version_conflict") {
        try {
          const fresh = await storePolicyApi.get(selected.key);
          setItems((current) => Object.freeze(current.map((page) => page.key === fresh.key ? fresh : page)));
          setSelected(fresh);
          setBody(fresh.body);
          setSelectedStatus(fresh.status);
        } catch {}
      }
      setError(caught instanceof Error ? caught.message : "Politika kaydedilemedi.");
    } finally { setBusy(false); }
  }

  return (
    <PanelPageShell>
      <PanelPageHeader
        title="Politikalar"
        description="Mağazanızın yasal ve bilgilendirici metinlerini Markdown ile yönetin. Yedi sabit sayfanın adı ve adresi değiştirilemez."
        actions={<button className={styles.refresh} type="button" onClick={() => void load()} disabled={loading}><RefreshCcw aria-hidden="true" /> Yenile</button>}
      />
      {error && !selected ? <p className={styles.error} role="alert">{error}</p> : null}
      {loading ? <p className={styles.state} role="status">Politikalar yükleniyor…</p> : null}
      {!loading && items.length === 0 ? <PanelEmptyState title="Politikalar kullanılamıyor" description="Yedi sabit politika kaydı yüklenemedi." /> : null}
      <section className={styles.grid} aria-label="Sabit mağaza politikaları">
        {FIXED_STOREFRONT_POLICIES.map((definition) => {
          const page = items.find((candidate) => candidate.key === definition.key);
          const presentation = page ? status(page) : null;
          return (
            <article className={styles.card} key={definition.key}>
              <div className={styles.icon}><FileText aria-hidden="true" /></div>
              <div className={styles.cardBody}>
                <div className={styles.cardTitle}><h2>{definition.label}</h2>{presentation ? <PanelStatusBadge tone={presentation.tone}>{presentation.label}</PanelStatusBadge> : null}</div>
                <code>{definition.route}</code>
                <p>{page ? `Son güncelleme: ${updatedAt(page.updatedAt)}` : "Kayıt yüklenemedi"}</p>
              </div>
              <button
                ref={(node) => { if (node) triggerRefs.current.set(definition.key, node); else triggerRefs.current.delete(definition.key); }}
                className={styles.edit}
                type="button"
                disabled={!page}
                onClick={() => { if (page) open(page); }}
              >
                <Pencil aria-hidden="true" /> {canManage ? "Düzenle" : "Görüntüle"}
              </button>
            </article>
          );
        })}
      </section>
      {selected ? (
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section className={styles.editor} role="dialog" aria-modal="true" aria-labelledby="policy-editor-title">
            <header>
              <div><small>SABİT POLİTİKA</small><h2 id="policy-editor-title">{selected.label}</h2><code>{selected.route}</code></div>
              <button ref={closeButtonRef} type="button" onClick={close} aria-label="Politika düzenleyicisini kapat"><X aria-hidden="true" /></button>
            </header>
            <div className={styles.formBody}>
              <label className={styles.statusField}>Yayın durumu
                <select value={selectedStatus} disabled={!canManage || busy} onChange={(event) => setSelectedStatus(event.target.value as StorePolicyStatus)}>
                  <option value="draft">Taslak</option>
                  <option value="published">Yayında</option>
                </select>
              </label>
              <label className={styles.bodyField}>Politika metni <small>Markdown desteklenir</small>
                <textarea maxLength={100_000} rows={18} value={body} readOnly={!canManage} onChange={(event) => setBody(event.target.value)} />
              </label>
              <div className={styles.preview}><strong>Markdown önizleme</strong><ProductDescriptionPreview source={body} emptyMessage="Önizlemek için politika metni yazın." /></div>
              {message ? <p className={styles.success} role="status"><Check aria-hidden="true" /> {message}</p> : null}
              {error ? <p className={styles.error} role="alert">{error}</p> : null}
            </div>
            <footer><button type="button" className={styles.secondary} onClick={close}>Kapat</button>{canManage ? <button type="button" className={styles.primary} disabled={busy || (selectedStatus === "published" && !body.trim())} onClick={() => void save()}>{busy ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button> : null}</footer>
          </section>
        </div>
      ) : null}
    </PanelPageShell>
  );
}
