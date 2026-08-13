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
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const FOCUSABLE = [
  "button:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
].join(",");

export function PolicyConsole({
  canManage,
  initialPolicyKey,
  embedded = false,
}: {
  canManage: boolean;
  initialPolicyKey?: StorefrontPolicyKey;
  embedded?: boolean;
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
  const editorRef = useRef<HTMLElement | null>(null);

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
    } finally {
      setLoading(false);
    }
  }, [initialPolicyKey, open]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !editorRef.current) return;
      const controls = Array.from(editorRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = controls.at(0);
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, selected]);

  async function save() {
    if (!selected || !canManage || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await storePolicyApi.save(selected.key, {
        expectedVersion: selected.version,
        body,
        status: selectedStatus,
      });
      setItems((current) => Object.freeze(current.map((page) => page.key === saved.key ? saved : page)));
      setSelected(saved);
      setBody(saved.body);
      setSelectedStatus(saved.status);
      setMessage(saved.status === "published"
        ? "Politika kaydedildi ve mağaza footer'ında yayınlandı."
        : "Politika taslak olarak güvenle kaydedildi.");
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
    } finally {
      setBusy(false);
    }
  }

  const publishedCount = items.filter((page) => page.status === "published").length;
  const draftCount = items.filter((page) => page.status === "draft").length;

  return (
    <PanelPageShell embedded={embedded}>
      <PanelPageHeader
        title="Politikalar"
        description="Yasal metinlerinizi yazın, önizleyin ve hazır olduğunda mağazanızın footer'ında yayınlayın."
        embedded={embedded}
        actions={(
          <button className={styles.refresh} type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCcw aria-hidden="true" /> Yenile
          </button>
        )}
      />
      {error && !selected ? <p className={styles.error} role="alert">{error}</p> : null}
      {loading ? <p className={styles.state} role="status">Politikalar yükleniyor…</p> : null}
      {!loading && items.length === 0 ? (
        <PanelEmptyState title="Politikalar kullanılamıyor" description="Yedi sabit politika kaydı yüklenemedi." />
      ) : null}
      {!loading && items.length > 0 ? (
        <section className={styles.workspace} data-testid="policy-workspace" aria-labelledby="policy-workspace-title">
          <header className={styles.workspaceHeader}>
            <div>
              <small>SABİT MAĞAZA SAYFALARI</small>
              <h2 id="policy-workspace-title">Politika çalışma alanı</h2>
              <p>Adlar ve adresler sabittir. Yayına aldığınız metinler footer'a otomatik eklenir.</p>
            </div>
            <dl className={styles.summary} aria-label="Politika özeti">
              <div><dt>Yayındaki metinler</dt><dd>{publishedCount}</dd></div>
              <div><dt>Taslak metinler</dt><dd>{draftCount}</dd></div>
            </dl>
          </header>
          <div className={styles.list} aria-label="Sabit mağaza politikaları">
            {FIXED_STOREFRONT_POLICIES.map((definition, index) => {
              const page = items.find((candidate) => candidate.key === definition.key);
              const presentation = page ? status(page) : null;
              return (
                <article className={styles.row} key={definition.key}>
                  <span className={styles.ordinal} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div className={styles.icon}><FileText aria-hidden="true" /></div>
                  <div className={styles.rowBody}>
                    <div className={styles.rowTitle}>
                      <h3>{definition.label}</h3>
                      {presentation ? <PanelStatusBadge tone={presentation.tone}>{presentation.label}</PanelStatusBadge> : null}
                    </div>
                    <code>{definition.route}</code>
                  </div>
                  <p className={styles.updated}>{page ? `Güncellendi ${updatedAt(page.updatedAt)}` : "Kayıt yüklenemedi"}</p>
                  <button
                    ref={(node) => {
                      if (node) triggerRefs.current.set(definition.key, node);
                      else triggerRefs.current.delete(definition.key);
                    }}
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
          </div>
        </section>
      ) : null}
      {selected ? (
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section ref={editorRef} className={styles.editor} role="dialog" aria-modal="true" aria-labelledby="policy-editor-title">
            <header className={styles.editorHeader}>
              <div>
                <small>POLİTİKA DÜZENLENİYOR</small>
                <h2 id="policy-editor-title">{selected.label}</h2>
                <code>{selected.route}</code>
              </div>
              <button ref={closeButtonRef} type="button" onClick={close} aria-label="Politika düzenleyicisini kapat">
                <X aria-hidden="true" />
              </button>
            </header>
            <div className={styles.formBody}>
              <fieldset className={styles.statusField}>
                <legend>Yayın durumu</legend>
                <div className={styles.statusOptions} role="radiogroup" aria-label="Yayın durumu">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selectedStatus === "draft"}
                    className={selectedStatus === "draft" ? styles.statusActive : undefined}
                    disabled={!canManage || busy}
                    onClick={() => { setSelectedStatus("draft"); setMessage(""); }}
                  >
                    <span>Taslak</span><small>Yalnız panelde görünür</small>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selectedStatus === "published"}
                    className={selectedStatus === "published" ? styles.statusActive : undefined}
                    disabled={!canManage || busy}
                    onClick={() => { setSelectedStatus("published"); setMessage(""); }}
                  >
                    <span>Yayında</span><small>Footer'a otomatik eklenir</small>
                  </button>
                </div>
              </fieldset>
              <div className={styles.editorColumns}>
                <label className={styles.bodyField}>
                  <span>Politika metni <small>Markdown desteklenir</small></span>
                  <textarea
                    maxLength={100_000}
                    rows={22}
                    value={body}
                    readOnly={!canManage}
                    onChange={(event) => { setBody(event.target.value); setMessage(""); }}
                    placeholder="# Başlık\n\nPolitika metninizi buraya yazın."
                  />
                </label>
                <div className={styles.preview}>
                  <div><strong>Markdown önizleme</strong><small>Müşterinizin göreceği görünüm</small></div>
                  <ProductDescriptionPreview source={body} emptyMessage="Önizlemek için politika metni yazın." />
                </div>
              </div>
              {message ? <p className={styles.success} role="status"><Check aria-hidden="true" /> {message}</p> : null}
              {error ? <p className={styles.error} role="alert">{error}</p> : null}
            </div>
            <footer className={styles.editorFooter}>
              <p>{selectedStatus === "published" ? "Kaydettiğinizde footer bağlantısı güncellenir." : "Taslaklar storefront'ta görünmez."}</p>
              <div>
                <button type="button" className={styles.secondary} onClick={close}>Kapat</button>
                {canManage ? (
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={busy || (selectedStatus === "published" && !body.trim())}
                    onClick={() => void save()}
                  >
                    {busy ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
                  </button>
                ) : null}
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </PanelPageShell>
  );
}
