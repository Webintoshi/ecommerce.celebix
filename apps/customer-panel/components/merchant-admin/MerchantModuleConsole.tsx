"use client";

import {
  MERCHANT_ADMIN_PROVIDER_RECORD_KINDS,
  type MerchantAdminEvent,
  type MerchantAdminJson,
  type MerchantAdminProviderJob,
  type MerchantAdminProviderRecordKind,
  type MerchantAdminRecord,
  type MerchantAdminRecordKind,
  type MerchantProviderCapability,
  type MerchantProviderProfile,
} from "@celebix/saas-contracts";
import {
  Archive,
  Ban,
  CircleDashed,
  DatabaseZap,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
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
import { ProviderConnectionPanel } from "@/components/merchant-admin/ProviderConnectionPanel";
import { MerchantAdminApiError, merchantAdminApi } from "@/lib/merchant-admin-ui/client";
import { providerExecutionApi } from "@/lib/provider-execution-ui/client";
import { createRouteFor, editRouteFor } from "@/lib/merchant-admin-ui/record-route";
import {
  buildMerchantModuleSummary,
  buildProviderWorkflowState,
  formatMerchantAdminConfig,
  getMerchantModuleDefinition,
  isSingletonMerchantModule,
  selectSingletonEditorRecord,
  singletonRecordState,
  type MerchantModuleFieldDefinition,
  type MerchantModuleStatusFilter,
} from "@/lib/merchant-admin-ui/presentation";

import styles from "./merchant-module-console.module.css";

function inputValue(record: MerchantAdminRecord | null, key: string) {
  const current = record?.config[key];
  if (typeof current === "string" || typeof current === "number") return String(current);
  return Array.isArray(current) ? current.join("\n") : "";
}

function enumListDefaultChecked(
  record: MerchantAdminRecord | null,
  key: string,
  value: string,
) {
  const current = record?.config[key];
  return Array.isArray(current) && current.includes(value);
}

function dateTimeInputSnapshot(
  config: Readonly<Record<string, MerchantAdminJson>> | undefined,
  key: string,
) {
  const value = config?.[key];
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  const localValue = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, "0")}`;
  return Object.freeze({ localValue, originalIso: value });
}

function dateTimeInputValue(record: MerchantAdminRecord | null, key: string) {
  return dateTimeInputSnapshot(record?.config, key)?.localValue ?? "";
}

function listLimit(field: MerchantModuleFieldDefinition): number {
  const limit = field.maxItems;
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError("invalid_list_definition");
  return limit;
}

function parseFormConfig(
  fields: readonly MerchantModuleFieldDefinition[],
  data: FormData,
  originalConfig?: Readonly<Record<string, MerchantAdminJson>>,
): Readonly<Record<string, MerchantAdminJson>> {
  const entries: Record<string, MerchantAdminJson> = {};
  for (const field of fields) {
    if (field.type === "boolean") {
      entries[field.key] = data.get(field.key) === "on";
      continue;
    }
    if (field.type === "enum-list") {
      const limit = listLimit(field);
      const values = data.getAll(field.key);
      const allowedValues = field.allowedValues;
      if (values.length < 1 || values.length > limit || !allowedValues || values.some((value) => typeof value !== "string" || !allowedValues.includes(value)) || new Set(values).size !== values.length) throw new TypeError("invalid_enum_list");
      entries[field.key] = Object.freeze([...values] as string[]);
      continue;
    }
    const raw = String(data.get(field.key) ?? "").trim();
    if (!raw) {
      if (field.type === "string-list") throw new TypeError(`invalid_string_list_${listLimit(field)}`);
      continue;
    }
    if (field.type === "number") {
      if (field.allowedValues && !field.allowedValues.includes(raw)) throw new TypeError("invalid_number");
      const number = Number(raw);
      if (!Number.isSafeInteger(number) || number < 0) throw new TypeError("invalid_number");
      entries[field.key] = number;
    } else if (field.type === "datetime") {
      const original = dateTimeInputSnapshot(originalConfig, field.key);
      if (original && raw === original.localValue) {
        entries[field.key] = original.originalIso;
        continue;
      }
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(raw)) throw new TypeError("invalid_datetime");
      const timestamp = new Date(raw);
      if (!Number.isFinite(timestamp.getTime())) throw new TypeError("invalid_datetime");
      entries[field.key] = timestamp.toISOString();
    } else if (field.type === "string-list") {
      const values = raw.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
      const limit = listLimit(field);
      if (values.length < 1 || values.length > limit) throw new TypeError(`invalid_string_list_${limit}`);
      entries[field.key] = Object.freeze(values);
    } else if (field.type === "enum") {
      if (!field.allowedValues?.includes(raw)) throw new TypeError("invalid_enum_value");
      entries[field.key] = raw;
    } else {
      entries[field.key] = raw;
    }
  }
  return Object.freeze(entries);
}

function formErrorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    const match = /^invalid_string_list_(\d{1,3})$/.exec(error.message);
    if (match) {
      const limit = Number(match[1]);
      return `Liste 1 ile ${limit} arasında satır içermelidir.`;
    }
    if (error.message === "invalid_enum_list") return "Yalnız geçerli özelliklerden 1 ile 3 tanesini bir kez seçin.";
  }
  return error instanceof MerchantAdminApiError ? error.message : "Kayıt tamamlanamadı.";
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

function providerJobStatus(job: MerchantAdminProviderJob) {
  if (job.status === "cancelled") return Object.freeze({ label: "İptal edildi", tone: "neutral" as const });
  if (job.status === "succeeded") return Object.freeze({ label: "Tamamlandı", tone: "success" as const });
  if (job.status === "permanently_failed") return Object.freeze({ label: "Kalıcı hata", tone: "danger" as const });
  if (job.status === "provider_outcome_unknown") return Object.freeze({ label: "Sonuç doğrulanıyor — tekrar göndermeyin", tone: "warning" as const });
  if (job.status === "reconciliation_required") return Object.freeze({ label: "Uzlaştırma gerekli", tone: "warning" as const });
  if (job.status === "retryable_failed") return Object.freeze({ label: "Tekrar denenebilir", tone: "warning" as const });
  if (job.status === "leased") return Object.freeze({ label: "İşleniyor", tone: "warning" as const });
  if (job.status === "queued") return Object.freeze({ label: "Sırada", tone: "warning" as const });
  return Object.freeze({ label: "Sağlayıcı aktivasyonu bekleniyor", tone: "warning" as const });
}

function toProviderRecordKind(kind: MerchantAdminRecordKind): MerchantAdminProviderRecordKind | null {
  return MERCHANT_ADMIN_PROVIDER_RECORD_KINDS.includes(kind as MerchantAdminProviderRecordKind)
    ? kind as MerchantAdminProviderRecordKind
    : null;
}

function capabilityForProviderKind(kind: MerchantAdminProviderRecordKind): MerchantProviderCapability {
  const capabilities: Readonly<Record<MerchantAdminProviderRecordKind, MerchantProviderCapability>> = Object.freeze({
    marketplace_connection: "marketplace_sync",
    email_campaign: "email_delivery",
    phone_campaign: "phone_delivery",
    whatsapp_campaign: "whatsapp_delivery",
    invoice_integration: "invoice_reconciliation",
    indexing_request: "indexing",
  });
  return capabilities[kind];
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
  const providerRecordKind = toProviderRecordKind(kind);
  const providerCapability = providerRecordKind ? capabilityForProviderKind(providerRecordKind) : null;
  const [items, setItems] = useState<readonly MerchantAdminRecord[]>([]);
  const [events, setEvents] = useState<readonly MerchantAdminEvent[]>([]);
  const [providerJobs, setProviderJobs] = useState<readonly MerchantAdminProviderJob[]>([]);
  const [providerProfiles, setProviderProfiles] = useState<readonly MerchantProviderProfile[]>([]);
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
  const mountedRef = useRef(true);
  const loadVersionRef = useRef(0);
  const activeSubmissionRef = useRef<number | null>(null);
  const submissionVersionRef = useRef(0);

  const summary = useMemo(
    () => buildMerchantModuleSummary(items, query, statusFilter),
    [items, query, statusFilter],
  );

  const load = useCallback(async () => {
    const version = loadVersionRef.current + 1;
    loadVersionRef.current = version;
    if (!mountedRef.current) return;
    setLoading(true);
    setError("");
    try {
      const [records, audit, jobs, profiles] = await Promise.all([
        merchantAdminApi.records(kind),
        merchantAdminApi.events(kind),
        definition.workflow && providerRecordKind
          ? merchantAdminApi.providerJobs(providerRecordKind)
          : Promise.resolve(Object.freeze([]) as readonly MerchantAdminProviderJob[]),
        definition.workflow && providerCapability
          ? providerExecutionApi.profiles(providerCapability).catch(() => Object.freeze([]) as readonly MerchantProviderProfile[])
          : Promise.resolve(Object.freeze([]) as readonly MerchantProviderProfile[]),
      ]);
      if (!mountedRef.current || loadVersionRef.current !== version) return;
      setItems(records);
      setEvents(audit);
      setProviderJobs(jobs);
      setProviderProfiles(profiles);
    } catch (caught) {
      if (!mountedRef.current || loadVersionRef.current !== version) return;
      setError(
        caught instanceof MerchantAdminApiError
          ? caught.message
          : `${definition.title} yüklenemedi.`,
      );
    } finally {
      if (mountedRef.current && loadVersionRef.current === version) setLoading(false);
    }
  }, [definition.title, definition.workflow, kind, providerCapability, providerRecordKind]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      loadVersionRef.current += 1;
      activeSubmissionRef.current = null;
    };
  }, [load]);

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
    if (activeSubmissionRef.current !== null) return;
    const submission = submissionVersionRef.current + 1;
    submissionVersionRef.current = submission;
    activeSubmissionRef.current = submission;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await merchantAdminApi.save(kind, {
        ...(editing ? { recordId: editing.id, expectedVersion: editing.version } : {}),
        name: String(data.get("name") ?? "").trim(),
        config: parseFormConfig(definition.fields, data, editing?.config),
        status: data.get("status") === "active" ? "active" : "draft",
      });
      if (!mountedRef.current || activeSubmissionRef.current !== submission) return;
      setMessage("Kayıt kalıcı olarak kaydedildi.");
      closeEditor();
      form.reset();
      await load();
    } catch (caught) {
      if (mountedRef.current && activeSubmissionRef.current === submission) {
        setError(formErrorMessage(caught));
      }
    } finally {
      if (mountedRef.current && activeSubmissionRef.current === submission) {
        activeSubmissionRef.current = null;
        setBusy(false);
      }
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

  async function prepareProviderJob(record: MerchantAdminRecord) {
    if (!definition.workflow || !providerRecordKind) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await merchantAdminApi.prepareProviderJob(providerRecordKind, record.id, record.version);
      setMessage(`${definition.workflow.actionLabel} kalıcı olarak kaydedildi; dış sağlayıcıya çağrı yapılmadı.`);
      await load();
    } catch (caught) {
      setError(caught instanceof MerchantAdminApiError ? caught.message : "Hazırlık kaydı oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelProviderJob(job: MerchantAdminProviderJob) {
    if (!providerRecordKind) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await merchantAdminApi.cancelProviderJob(providerRecordKind, job.id, job.version);
      setMessage("Sağlayıcı hazırlığı iptal edildi; harici işlem çalıştırılmadı.");
      await load();
    } catch (caught) {
      setError(caught instanceof MerchantAdminApiError ? caught.message : "Hazırlık kaydı iptal edilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function queueProviderJob(job: MerchantAdminProviderJob, profile: MerchantProviderProfile) {
    if (!providerRecordKind || profile.status !== "active") return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await merchantAdminApi.queueProviderJob(providerRecordKind, job.id, job.version, profile.id, profile.version);
      setMessage("Sağlayıcı işi doğrulanmış bağlantıyla sıraya alındı.");
      await load();
    } catch (caught) {
      setError(caught instanceof MerchantAdminApiError ? caught.message : "Sağlayıcı işi sıraya alınamadı.");
    } finally { setBusy(false); }
  }

  const waitingJobs = useMemo(
    () => new Map(providerJobs.filter(({ status }) => status === "awaiting_provider_activation").map((job) => [job.recordId, job] as const)),
    [providerJobs],
  );
  const unknownJobs = useMemo(
    () => new Map(providerJobs.filter(({ status }) => status === "provider_outcome_unknown" || status === "reconciliation_required").map((job) => [job.recordId, job] as const)),
    [providerJobs],
  );
  const activeProviderProfile = providerProfiles.find((profile) => profile.capability === providerCapability && profile.status === "active");
  const singletonModule = isSingletonMerchantModule(kind);
  const singletonEditorRecord = useMemo(
    () => selectSingletonEditorRecord(kind, items),
    [items, kind],
  );

  function providerControls(record: MerchantAdminRecord) {
    if (!definition.workflow) return null;
    const workflow = buildProviderWorkflowState(definition, record);
    if (!workflow) return null;
    const waiting = waitingJobs.get(record.id);
    const unknown = unknownJobs.get(record.id);
    if (unknown) return (
      <div className={styles.workflowSummary} data-workflow-state={unknown.status}>
        <div><CircleDashed aria-hidden="true" /><span>{providerJobStatus(unknown).label}</span></div>
      </div>
    );
    return (
      <div className={styles.workflowSummary} data-workflow-state={waiting ? "awaiting_provider_activation" : workflow.code}>
        <div><CircleDashed aria-hidden="true" /><span>{waiting ? "Sağlayıcı aktivasyonu bekleniyor" : workflow.label}</span></div>
        {workflow.missingFields.length ? <small>Eksik: {workflow.missingFields.join(", ")}</small> : null}
        {canManage && waiting && activeProviderProfile ? (
          <><button type="button" className={styles.workflowAction} disabled={busy} onClick={() => void queueProviderJob(waiting, activeProviderProfile)}><CircleDashed aria-hidden="true" /> Sıraya al</button><button type="button" className={styles.workflowCancel} disabled={busy} onClick={() => void cancelProviderJob(waiting)}><Ban aria-hidden="true" /> Hazırlığı iptal et</button></>
        ) : canManage && waiting ? (
          <button type="button" className={styles.workflowCancel} disabled={busy} onClick={() => void cancelProviderJob(waiting)}><Ban aria-hidden="true" /> Hazırlığı iptal et</button>
        ) : canManage && workflow.canPrepare ? (
          <button type="button" className={styles.workflowAction} disabled={busy} onClick={() => void prepareProviderJob(record)}><CircleDashed aria-hidden="true" /> {definition.workflow.actionLabel} oluştur</button>
        ) : null}
      </div>
    );
  }

  const createLabel = `${definition.singular[0]?.toLocaleUpperCase("tr-TR")}${definition.singular.slice(1)} oluştur`;
  const createRoute = createRouteFor(definition.kind);

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
            {canManage ? createRoute ? (
              <Link href={createRoute} className={styles.primary}>
                <Plus aria-hidden="true" /> Yeni kayıt
              </Link>
            ) : singletonEditorRecord ? (
              <button type="button" className={styles.primary} onClick={(event) => openEdit(singletonEditorRecord, event)}>
                <Pencil aria-hidden="true" /> Ayarı düzenle
              </button>
            ) : (
              <button type="button" className={styles.primary} onClick={openCreate}>
                <Plus aria-hidden="true" /> {singletonModule ? "Ayar oluştur" : "Yeni kayıt"}
              </button>
            ) : null}
          </div>
        )}
      />

      <section className={styles.metrics} aria-label={`${definition.title} özeti`}>
        <PanelMetricCard label="Toplam kayıt" value={summary.total.toLocaleString("tr-TR")} detail="Kalıcı kayıt" />
        <PanelMetricCard label={definition.workflow ? "Hazır yapılandırma" : "Aktif"} value={summary.active.toLocaleString("tr-TR")} detail={definition.workflow ? "Harici çalıştırma değil" : "Yayında"} />
        <PanelMetricCard label="Taslak" value={summary.draft.toLocaleString("tr-TR")} detail="Çalışma halinde" />
        <PanelMetricCard label="Arşiv" value={summary.archived.toLocaleString("tr-TR")} detail="Salt-okunur geçmiş" />
      </section>

      {definition.execution === "provider_required" ? (
        <aside className={styles.providerNotice} aria-label="Sağlayıcı durumu">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>Doğrulanmış sağlayıcı bağlantısı gerekli</strong>
            <p>{definition.notice} Hazırlık kaydı yalnız etkin ve doğrulanmış bir bağlantıyla iş kuyruğuna alınabilir.</p>
          </div>
        </aside>
      ) : definition.notice ? <p className={styles.notice}>{definition.notice}</p> : null}

      {providerCapability ? <ProviderConnectionPanel capability={providerCapability} canManage={canManage} /> : null}

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
            action={canManage && !items.length ? createRoute ? (
              <Link href={createRoute} className={styles.primary}>{createLabel}</Link>
            ) : <button type="button" className={styles.primary} onClick={openCreate}>{createLabel}</button> : undefined}
          />
        ) : (
          <>
            <div className={styles.desktopTable}>
              <PanelDataTable label={`${definition.title} kayıtları`}>
                <thead><tr><th>Ad</th><th>Durum</th><th>Yapılandırma</th><th>Güncelleme</th><th><span className={styles.srOnly}>İşlemler</span></th></tr></thead>
                <tbody>
                  {summary.visible.map((record) => {
                    const status = statusPresentation(record.status);
                    const singletonState = singletonRecordState(kind, record, items);
                    const editRoute = editRouteFor(definition.kind, record.id);
                    return (
                      <tr key={record.id}>
                        <td><strong>{record.name}</strong><small>v{record.version}</small></td>
                        <td><PanelStatusBadge tone={status.tone}>{status.label}</PanelStatusBadge>{singletonState ? <small className={styles.muted}>{singletonState === "effective" ? "Vitrinde etkin" : "Yerine yeni kayıt geçti"}</small> : null}</td>
                        <td><ConfigSummary record={record} />{providerControls(record)}</td>
                        <td><time dateTime={record.updatedAt}>{new Date(record.updatedAt).toLocaleString("tr-TR")}</time></td>
                        <td>
                          {canManage ? (
                            <div className={styles.rowActions}>
                              {editRoute ? <Link href={editRoute} className={styles.iconButton} aria-label={`${record.name} kaydını düzenle`}><Pencil aria-hidden="true" /></Link> : <button type="button" className={styles.iconButton} aria-label={`${record.name} kaydını düzenle`} disabled={busy} onClick={(event) => openEdit(record, event)}><Pencil aria-hidden="true" /></button>}
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
                const singletonState = singletonRecordState(kind, record, items);
                const editRoute = editRouteFor(definition.kind, record.id);
                return (
                  <article className={styles.mobileCard} key={record.id}>
                    <header><div><h2>{record.name}</h2><small>v{record.version}</small>{singletonState ? <small className={styles.muted}>{singletonState === "effective" ? "Vitrinde etkin" : "Yerine yeni kayıt geçti"}</small> : null}</div><PanelStatusBadge tone={status.tone}>{status.label}</PanelStatusBadge></header>
                    <ConfigSummary record={record} />
                    {providerControls(record)}
                    {canManage ? (
                      <div className={styles.rowActions}>
                        {editRoute ? <Link href={editRoute} className={styles.button}><Pencil aria-hidden="true" /> Düzenle</Link> : <button type="button" className={styles.button} disabled={busy} onClick={(event) => openEdit(record, event)}><Pencil aria-hidden="true" /> Düzenle</button>}
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
        {definition.workflow ? (
          <section className={styles.providerHistory} aria-labelledby="provider-preparation-title">
            <header><div><span>Harici iş akışı</span><h2 id="provider-preparation-title">Hazırlık kayıtları</h2></div><strong>{providerJobs.length.toLocaleString("tr-TR")}</strong></header>
            {providerJobs.length ? (
              <ul>{providerJobs.map((job) => { const status = providerJobStatus(job); return <li key={job.id}><div><strong>{definition.workflow?.actionLabel}</strong><time dateTime={job.updatedAt}>{new Date(job.updatedAt).toLocaleString("tr-TR")}</time></div><PanelStatusBadge tone={status.tone}>{status.label}</PanelStatusBadge></li>; })}</ul>
            ) : <p>Henüz hazırlık kaydı yok. Harici sağlayıcıya hiçbir çağrı yapılmadı.</p>}
          </section>
        ) : null}
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
              <label>{definition.workflow ? "Hazırlık durumu" : "Yayın durumu"}<select name="status" defaultValue={editing?.status === "active" ? "active" : "draft"}><option value="draft">Taslak</option><option value="active">{definition.workflow ? "Hazırlık için yapılandırıldı" : "Aktif"}</option></select></label>
              {definition.fields.map((field) => field.type === "enum-list" ? (
                <fieldset className={styles.wide} key={field.key}>
                  <legend>{field.label}</legend>
                  {field.allowedValues?.map((value) => (
                    <label key={value}>
                      <input name={field.key} type="checkbox" value={value} defaultChecked={enumListDefaultChecked(editing, field.key, value)} />
                      <span>{field.optionLabels?.[value] ?? value}</span>
                    </label>
                  ))}
                </fieldset>
              ) : (
                <label className={field.type === "textarea" || field.type === "string-list" ? styles.wide : undefined} key={field.key}>
                  {field.label}
                  {field.type === "textarea" || field.type === "string-list" ? (
                    <textarea name={field.key} maxLength={4000} placeholder={field.placeholder} defaultValue={inputValue(editing, field.key)} />
                  ) : field.type === "boolean" ? (
                    <span className={styles.switchField}><input name={field.key} type="checkbox" defaultChecked={editing?.config[field.key] === true} /><span>Etkin</span></span>
                  ) : field.type === "enum" || field.type === "number" && field.allowedValues ? (
                    <select name={field.key} defaultValue={inputValue(editing, field.key)}>
                      <option value="">Seçin</option>
                      {field.allowedValues?.map((value) => <option key={value} value={value}>{field.optionLabels?.[value] ?? value}</option>)}
                    </select>
                  ) : field.type === "datetime" ? (
                    <input name={field.key} type="datetime-local" step="0.001" defaultValue={dateTimeInputValue(editing, field.key)} />
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
