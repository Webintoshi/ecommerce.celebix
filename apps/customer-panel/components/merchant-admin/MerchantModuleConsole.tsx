"use client";

import type {
  MerchantAdminEvent,
  MerchantAdminJson,
  MerchantAdminRecord,
  MerchantAdminRecordKind,
} from "@celebix/saas-contracts";
import {
  Archive,
  DatabaseZap,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";

import {
  PanelDataTable,
  PanelEmptyState,
  PanelMetricCard,
  PanelPageHeader,
  PanelPageShell,
  PanelStatusBadge,
  PanelToolbar,
} from "@/components/panel/PanelPageShell";
import { MerchantAdminApiError, merchantAdminApi } from "@/lib/merchant-admin-ui/client";
import {
  buildMerchantModuleSummary,
  formatMerchantAdminConfig,
  getMerchantModuleDefinition,
  type MerchantModuleFieldDefinition,
  type MerchantModuleStatusFilter,
} from "@/lib/merchant-admin-ui/presentation";

import styles from "./merchant-module-console.module.css";

function inputValue(record: MerchantAdminRecord | null, key: string) {
  const current = record?.config[key];
  if (typeof current === "string" || typeof current === "number") return String(current);
  return Array.isArray(current) ? current.join("\n") : "";
}

function parseFormConfig(
  fields: readonly MerchantModuleFieldDefinition[],
  data: FormData,
): Readonly<Record<string, MerchantAdminJson>> {
  const entries: Record<string, MerchantAdminJson> = {};
  for (const field of fields) {
    if (field.type === "boolean") {
      entries[field.key] = data.get(field.key) === "on";
      continue;
    }
    const raw = String(data.get(field.key) ?? "").trim();
    if (!raw) continue;
    if (field.type === "number") {
      const number = Number(raw);
      if (!Number.isSafeInteger(number) || number < 0) throw new TypeError("invalid_number");
      entries[field.key] = number;
    } else if (field.type === "textarea" && field.key.endsWith("s")) {
      entries[field.key] = Object.freeze(
        raw.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).slice(0, 100),
      );
    } else {
      entries[field.key] = raw;
    }
  }
  return Object.freeze(entries);
}

function statusPresentation(status: MerchantAdminRecord["status"]) {
  if (status === "active") return Object.freeze({ label: "Aktif", tone: "success" as const });
  if (status === "draft") return Object.freeze({ label: "Taslak", tone: "warning" as const });
  return Object.freeze({ label: "Arşivlendi", tone: "neutral" as const });
}

function eventLabel(event: MerchantAdminEvent) {
  const labels: Readonly<Record<MerchantAdminEvent["eventKind"], string>> = Object.freeze({
    archived: "Arşivlendi",
    coupon_used: "Kupon kullanıldı",
    delivery_attempt: "Teslimat denemesi",
    indexing_job: "İndeksleme işi",
    invoice_reconciled: "Fatura uzlaştırıldı",
    saved: "Kaydedildi",
    sync_job: "Senkronizasyon işi",
    wheel_spin: "Çark çevrildi",
  });
  return labels[event.eventKind];
}

function ConfigSummary({ record }: { record: MerchantAdminRecord }) {
  const definition = getMerchantModuleDefinition(record.kind);
  const values = formatMerchantAdminConfig(definition, record.config).slice(0, 3);
  return values.length ? (
    <dl className={styles.configSummary}>
      {values.map(({ label, value }) => (
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  ) : <span className={styles.muted}>Ek yapılandırma yok</span>;
}

export function MerchantModuleConsole({
  kind,
  canManage,
  createFirst = false,
}: {
  kind: MerchantAdminRecordKind;
  canManage: boolean;
  createFirst?: boolean;
}) {
  const definition = getMerchantModuleDefinition(kind);
  const [items, setItems] = useState<readonly MerchantAdminRecord[]>([]);
  const [events, setEvents] = useState<readonly MerchantAdminEvent[]>([]);
  const [editing, setEditing] = useState<MerchantAdminRecord | null>(null);
  const [editorOpen, setEditorOpen] = useState(createFirst && canManage);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<MerchantModuleStatusFilter>("all");
  const editorTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const editorRef = useRef<HTMLElement | null>(null);

  const summary = useMemo(
    () => buildMerchantModuleSummary(items, query, statusFilter),
    [items, query, statusFilter],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [records, audit] = await Promise.all([
        merchantAdminApi.records(kind),
        merchantAdminApi.events(kind),
      ]);
      setItems(records);
      setEvents(audit);
    } catch (caught) {
      setError(
        caught instanceof MerchantAdminApiError
          ? caught.message
          : `${definition.title} yüklenemedi.`,
      );
    } finally {
      setLoading(false);
    }
  }, [definition.title, kind]);

  useEffect(() => { void load(); }, [load]);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditing(null);
    queueMicrotask(() => editorTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!editorOpen) return;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditor();
        return;
      }
      if (event.key !== "Tab") return;

      const surface = editorRef.current;
      const focusable = surface?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!surface || !focusable?.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !surface.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !surface.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [closeEditor, editorOpen]);

  function openCreate(event: MouseEvent<HTMLButtonElement>) {
    editorTriggerRef.current = event.currentTarget;
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(record: MerchantAdminRecord, event: MouseEvent<HTMLButtonElement>) {
    editorTriggerRef.current = event.currentTarget;
    setEditing(record);
    setEditorOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await merchantAdminApi.save(kind, {
        ...(editing ? { recordId: editing.id, expectedVersion: editing.version } : {}),
        name: String(data.get("name") ?? "").trim(),
        config: parseFormConfig(definition.fields, data),
        status: data.get("status") === "active" ? "active" : "draft",
      });
      setMessage("Kayıt kalıcı olarak kaydedildi.");
      closeEditor();
      form.reset();
      await load();
    } catch (caught) {
      setError(caught instanceof MerchantAdminApiError ? caught.message : "Kayıt tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function archiveRecord(record: MerchantAdminRecord) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await merchantAdminApi.archive(kind, record.id, record.version);
      if (editing?.id === record.id) closeEditor();
      setMessage("Kayıt arşivlendi.");
      await load();
    } catch (caught) {
      setError(caught instanceof MerchantAdminApiError ? caught.message : "Kayıt arşivlenemedi.");
    } finally {
      setBusy(false);
    }
  }

  const createLabel = `${definition.singular[0]?.toLocaleUpperCase("tr-TR")}${definition.singular.slice(1)} oluştur`;

  return (
    <PanelPageShell>
      <PanelPageHeader
        title={definition.title}
        description={definition.description}
        actions={(
          <div className={styles.headerActions}>
            <button type="button" className={styles.button} disabled={loading} onClick={() => void load()}>
              <RefreshCcw aria-hidden="true" /> Yenile
            </button>
            {canManage ? (
              <button type="button" className={styles.primary} onClick={openCreate}>
                <Plus aria-hidden="true" /> Yeni kayıt
              </button>
            ) : null}
          </div>
        )}
      />

      <section className={styles.metrics} aria-label={`${definition.title} özeti`}>
        <PanelMetricCard label="Toplam kayıt" value={summary.total.toLocaleString("tr-TR")} detail="Kalıcı kayıt" />
        <PanelMetricCard label="Aktif" value={summary.active.toLocaleString("tr-TR")} detail="Yayında" />
        <PanelMetricCard label="Taslak" value={summary.draft.toLocaleString("tr-TR")} detail="Çalışma halinde" />
        <PanelMetricCard label="Arşiv" value={summary.archived.toLocaleString("tr-TR")} detail="Salt-okunur geçmiş" />
      </section>

      {definition.execution === "provider_required" ? (
        <aside className={styles.providerNotice} aria-label="Sağlayıcı durumu">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>Harici çalıştırma kapalı</strong>
            <p>{definition.notice}</p>
          </div>
        </aside>
      ) : definition.notice ? <p className={styles.notice}>{definition.notice}</p> : null}

      {message ? <p className={styles.success} role="status">{message}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <section className={styles.surface}>
        <PanelToolbar>
          <label className={styles.search}>
            <Search aria-hidden="true" />
            <span className={styles.srOnly}>Kayıt ara</span>
            <input
              aria-label="Kayıt ara"
              type="search"
              value={query}
              maxLength={160}
              placeholder={`${definition.title} içinde ara`}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className={styles.filter}>
            <span>Durum</span>
            <select
              aria-label="Durum filtresi"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as MerchantModuleStatusFilter)}
            >
              <option value="all">Tümü</option>
              <option value="active">Aktif</option>
              <option value="draft">Taslak</option>
              <option value="archived">Arşiv</option>
            </select>
          </label>
        </PanelToolbar>

        {loading ? (
          <div className={styles.state} role="status">{definition.title} yükleniyor…</div>
        ) : summary.visible.length === 0 ? (
          <PanelEmptyState
            title={items.length ? "Filtreyle eşleşen kayıt yok" : `Henüz ${definition.singular} yok`}
            description={items.length ? "Arama veya durum filtresini değiştirin." : "İlk kalıcı kayıt oluşturulduğunda burada görünecek."}
            action={canManage && !items.length ? (
              <button type="button" className={styles.primary} onClick={openCreate}>{createLabel}</button>
            ) : undefined}
          />
        ) : (
          <>
            <div className={styles.desktopTable}>
              <PanelDataTable label={`${definition.title} kayıtları`}>
                <thead><tr><th>Ad</th><th>Durum</th><th>Yapılandırma</th><th>Güncelleme</th><th><span className={styles.srOnly}>İşlemler</span></th></tr></thead>
                <tbody>
                  {summary.visible.map((record) => {
                    const status = statusPresentation(record.status);
                    return (
                      <tr key={record.id}>
                        <td><strong>{record.name}</strong><small>v{record.version}</small></td>
                        <td><PanelStatusBadge tone={status.tone}>{status.label}</PanelStatusBadge></td>
                        <td><ConfigSummary record={record} /></td>
                        <td><time dateTime={record.updatedAt}>{new Date(record.updatedAt).toLocaleString("tr-TR")}</time></td>
                        <td>
                          {canManage ? (
                            <div className={styles.rowActions}>
                              <button type="button" className={styles.iconButton} aria-label={`${record.name} kaydını düzenle`} disabled={busy} onClick={(event) => openEdit(record, event)}><Pencil aria-hidden="true" /></button>
                              <button type="button" className={styles.iconDanger} aria-label={`${record.name} kaydını arşivle`} disabled={busy || record.status === "archived"} onClick={() => void archiveRecord(record)}><Archive aria-hidden="true" /></button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </PanelDataTable>
            </div>

            <div className={styles.mobileCards}>
              {summary.visible.map((record) => {
                const status = statusPresentation(record.status);
                return (
                  <article className={styles.mobileCard} key={record.id}>
                    <header><div><h2>{record.name}</h2><small>v{record.version}</small></div><PanelStatusBadge tone={status.tone}>{status.label}</PanelStatusBadge></header>
                    <ConfigSummary record={record} />
                    {canManage ? (
                      <div className={styles.rowActions}>
                        <button type="button" className={styles.button} disabled={busy} onClick={(event) => openEdit(record, event)}><Pencil aria-hidden="true" /> Düzenle</button>
                        <button type="button" className={styles.danger} disabled={busy || record.status === "archived"} onClick={() => void archiveRecord(record)}><Archive aria-hidden="true" /> Arşivle</button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </>
        )}

        <details className={styles.audit}>
          <summary><DatabaseZap aria-hidden="true" /> İşlem geçmişi ({events.length})</summary>
          {events.length ? (
            <ol>{events.map((event) => <li key={event.id}><strong>{eventLabel(event)}</strong><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString("tr-TR")}</time></li>)}</ol>
          ) : <p>Henüz kalıcı işlem kaydı yok.</p>}
        </details>
      </section>

      {editorOpen ? (
        <div className={styles.editorLayer}>
          <button type="button" className={styles.editorBackdrop} aria-label="Düzenleyiciyi kapat" onClick={closeEditor} />
          <section ref={editorRef} className={styles.editor} role="dialog" aria-modal="true" aria-labelledby="merchant-module-editor-title">
            <header>
              <div><span>{definition.title}</span><h2 id="merchant-module-editor-title">{editing ? "Kaydı düzenle" : createLabel}</h2></div>
              <button ref={closeButtonRef} type="button" className={styles.iconButton} aria-label="Düzenleyiciyi kapat" onClick={closeEditor}><X aria-hidden="true" /></button>
            </header>
            <form key={editing?.id ?? "new"} className={styles.form} onSubmit={submit}>
              <label>Ad<input autoFocus={!editing} name="name" required maxLength={160} defaultValue={editing?.name} /></label>
              <label>Yayın durumu<select name="status" defaultValue={editing?.status === "active" ? "active" : "draft"}><option value="draft">Taslak</option><option value="active">Aktif</option></select></label>
              {definition.fields.map((field) => (
                <label className={field.type === "textarea" ? styles.wide : undefined} key={field.key}>
                  {field.label}
                  {field.type === "textarea" ? (
                    <textarea name={field.key} maxLength={4000} placeholder={field.placeholder} defaultValue={inputValue(editing, field.key)} />
                  ) : field.type === "boolean" ? (
                    <span className={styles.switchField}><input name={field.key} type="checkbox" defaultChecked={editing?.config[field.key] === true} /><span>Etkin</span></span>
                  ) : (
                    <input name={field.key} type={field.type} min={field.type === "number" ? 0 : undefined} step={field.type === "number" ? 1 : undefined} maxLength={field.type === "number" ? undefined : 1000} placeholder={field.placeholder} defaultValue={inputValue(editing, field.key)} />
                  )}
                </label>
              ))}
              <div className={`${styles.wide} ${styles.actions}`}>
                <button className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : editing ? "Değişiklikleri kaydet" : createLabel}</button>
                <button className={styles.button} type="button" disabled={busy} onClick={closeEditor}>Vazgeç</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </PanelPageShell>
  );
}
