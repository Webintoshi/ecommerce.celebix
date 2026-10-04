"use client";

import type { MerchantAdminJson, MerchantAdminRecord, MerchantAdminRecordKind } from "@celebix/saas-contracts";
import { ArrowLeft, FileText, Mail, MessageCircle, Search, Unplug } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { MerchantAdminApiError, merchantAdminApi } from "@/lib/merchant-admin-ui/client";
import {
  formatMerchantAdminConfig,
  getMerchantModuleDefinition,
  type MerchantModuleFieldDefinition,
} from "@/lib/merchant-admin-ui/presentation";

import { SettingsRecordForm } from "@/components/settings/SettingsRecordForm";
import styles from "./merchant-module-console.module.css";
import operations from "./merchant-operations.module.css";

function RecordPreview({ kind, config, name }: { kind: MerchantAdminRecordKind; config: Readonly<Record<string, MerchantAdminJson>>; name: string }) {
  const text = (key: string) => typeof config[key] === "string" ? String(config[key]) : "";
  const definition = getMerchantModuleDefinition(kind);
  const isSeo = definition.family === "seo";
  const isCampaign = definition.family === "marketing";
  const visualPreview = isCampaign || isSeo && definition.fields.some(field => field.key === "metaTitle" || field.key === "title") || ["blog_post", "page", "lucky_wheel"].includes(kind);
  const summary = visualPreview ? [] : formatMerchantAdminConfig(definition, config);
  const title = text("metaTitle") || text("subject") || text("title") || text("campaignMessage") || name || (visualPreview ? "Başlık" : "Kayıt");
  const body = text("metaDescription") || text("description") || text("excerpt") || text("message") || text("script") || text("content") || text("body");
  const Icon = isSeo ? Search : isCampaign ? kind === "email_campaign" ? Mail : MessageCircle : definition.execution === "provider_required" ? Unplug : FileText;
  const prizes = text("prizeLabels").split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  return <aside className={operations.preview} aria-label="Kayıt önizlemesi">
    <h2>{kind === "lucky_wheel" ? "Ödül havuzu" : visualPreview ? "Önizleme" : "Kayıt özeti"}</h2>
    <div className={operations.previewBody}>
      {kind === "lucky_wheel" ? <svg className={operations.wheel} viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="68" fill="var(--cp-soft)" stroke="var(--cp-border)" strokeWidth="2"/><path d="M80 80V12a68 68 0 0 1 59 34Z" fill="var(--cp-brand-soft)"/><path d="M80 12v136M12 80h136M32 32l96 96M32 128l96-96" stroke="var(--cp-border)" strokeWidth="2"/><circle cx="80" cy="80" r="16" fill="var(--cp-surface)" stroke="var(--cp-graphite)" strokeWidth="2"/><path d="m72 4 8 16 8-16" fill="var(--cp-brand)"/></svg> : <Icon aria-hidden="true" />}
      <h3>{title}</h3>
      {isSeo && visualPreview && (text("canonicalPath") || text("sourcePath")) ? <small>{text("canonicalPath") || text("sourcePath")}</small> : null}
      {body && visualPreview ? <p>{body.length > 360 ? `${body.slice(0, 360)}…` : body}</p> : null}
      {summary.length ? <dl className={operations.previewSummary}>{summary.map(({label, value}) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
      {kind === "lucky_wheel" ? prizes.length ? <ol>{prizes.map((prize, index) => <li key={`${index}:${prize}`}>{prize}</li>)}</ol> : <p>Eklediğiniz ödüller burada görünür.</p> : null}
      {text("provider") && visualPreview ? <p>{text("provider")}{text("merchantReference") || text("accountReference") ? ` · ${text("merchantReference") || text("accountReference")}` : ""}</p> : null}
      {text("audience") ? <small>{text("audience")}</small> : null}
      {text("scheduledAt") ? <small>{text("scheduledAt")}</small> : null}
    </div>
    {text("metaTitle") || text("metaDescription") ? <p className={operations.previewCaption}><span>Başlık {text("metaTitle").length}</span><span>Açıklama {text("metaDescription").length}</span></p> : null}
    {definition.execution === "provider_required" ? <p className={operations.previewCaption}>Kaydetmek harici işlemi başlatmaz.</p> : null}
  </aside>;
}

function inputValue(record: MerchantAdminRecord | undefined, key: string) {
  const value = record?.config[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : Array.isArray(value) ? value.join("\n") : "";
}

function enumListDefaultChecked(record: MerchantAdminRecord | undefined, key: string, value: string) {
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
  const pad = (entry: number) => String(entry).padStart(2, "0");
  return Object.freeze({
    localValue: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, "0")}`,
    originalIso: value,
  });
}

function dateTimeInputValue(record: MerchantAdminRecord | undefined, key: string) {
  return dateTimeInputSnapshot(record?.config, key)?.localValue ?? "";
}

function listLimit(field: MerchantModuleFieldDefinition) {
  const limit = field.maxItems;
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError("invalid_list_definition");
  }
  return limit;
}

function parseFormConfig(
  fields: readonly MerchantModuleFieldDefinition[],
  data: FormData,
  record?: MerchantAdminRecord,
): Readonly<Record<string, MerchantAdminJson>> {
  const config: Record<string, MerchantAdminJson> = {};
  for (const field of fields) {
    if (field.key === "policyType" && record && Object.hasOwn(record.config, field.key)) {
      config[field.key] = record.config[field.key]!;
      continue;
    }
    if (field.type === "boolean") {
      config[field.key] = data.get(field.key) === "on";
      continue;
    }
    if (field.type === "enum-list") {
      const limit = listLimit(field);
      const values = data.getAll(field.key);
      const allowedValues = field.allowedValues;
      if (values.length < 1 || values.length > limit || !allowedValues || values.some((value) => typeof value !== "string" || !allowedValues.includes(value)) || new Set(values).size !== values.length) {
        throw new TypeError("invalid_enum_list");
      }
      config[field.key] = Object.freeze([...values] as string[]);
      continue;
    }
    const raw = String(data.get(field.key) ?? "").trim();
    if (!raw) {
      if (field.required) throw new TypeError("invalid_required_field");
      if (field.type === "string-list") throw new TypeError(`invalid_string_list_${listLimit(field)}`);
      continue;
    }
    if (field.type === "number") {
      if (field.allowedValues && !field.allowedValues.includes(raw)) throw new TypeError("merchant_record_form_invalid");
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("merchant_record_form_invalid");
      config[field.key] = value;
    } else if (field.type === "datetime") {
      const original = dateTimeInputSnapshot(record?.config, field.key);
      if (original && raw === original.localValue) {
        config[field.key] = original.originalIso;
        continue;
      }
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(raw)) throw new TypeError("invalid_datetime");
      const timestamp = new Date(raw);
      if (!Number.isFinite(timestamp.getTime())) throw new TypeError("invalid_datetime");
      config[field.key] = timestamp.toISOString();
    } else if (field.type === "string-list") {
      const values = raw.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
      const limit = listLimit(field);
      if (values.length < 1 || values.length > limit) throw new TypeError(`invalid_string_list_${limit}`);
      config[field.key] = Object.freeze(values);
    } else if (field.type === "enum") {
      if (!field.allowedValues?.includes(raw)) throw new TypeError("invalid_enum_value");
      config[field.key] = raw;
    } else if (field.type === "email") {
      config[field.key] = raw.toLowerCase();
    } else {
      config[field.key] = raw;
    }
  }
  return Object.freeze(config);
}

function safeError(caught: unknown) {
  if (caught instanceof MerchantAdminApiError) return caught.message;
  if (caught instanceof TypeError) {
    const list = /^invalid_string_list_(\d{1,3})$/.exec(caught.message);
    if (list) return `Liste 1 ile ${Number(list[1])} arasında satır içermelidir.`;
    if (caught.message === "invalid_enum_list") return "Yalnız izin verilen seçeneklerden geçerli sayıda seçim yapın.";
    if (["merchant_record_form_invalid", "invalid_datetime", "invalid_enum_value", "invalid_list_definition", "invalid_required_field"].includes(caught.message)) return "Gönderilen kayıt bilgileri geçersiz.";
  }
  return "Kayıt tamamlanamadı.";
}

export function MerchantRecordEditor({
  kind,
  recordId,
  returnTo,
  canManage,
}: {
  kind: MerchantAdminRecordKind;
  recordId?: string;
  returnTo: string;
  canManage: boolean;
}) {
  const definition = getMerchantModuleDefinition(kind);
  const router = useRouter();
  const [record, setRecord] = useState<MerchantAdminRecord>();
  const [loadSucceeded, setLoadSucceeded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<Readonly<{ name: string; config: Readonly<Record<string, MerchantAdminJson>> }> | null>(null);
  const requestSequence = useRef(0);
  const activeSubmission = useRef<number | undefined>(undefined);
  const submissionSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    activeSubmission.current = undefined;
    setLoading(true);
    setBusy(false);
    setError("");
    setRecord(undefined);
    setLoadSucceeded(false);
    setDirty(false);
    setPreview(null);
    try {
      const selected = recordId === undefined ? undefined : await merchantAdminApi.record(kind, recordId);
      if (requestSequence.current !== sequence) return;
      if (selected) setRecord(selected);
      setLoadSucceeded(true);
    } catch (caught) {
      if (requestSequence.current === sequence) setError(safeError(caught));
    } finally {
      if (requestSequence.current === sequence) setLoading(false);
    }
  }, [kind, recordId]);

  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy || activeSubmission.current !== undefined) return;
    if (recordId === undefined ? record !== undefined : record === undefined || record.id !== recordId || record.kind !== kind) return;
    const sequence = requestSequence.current;
    const submission = submissionSequence.current + 1;
    submissionSequence.current = submission;
    activeSubmission.current = submission;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await merchantAdminApi.save(kind, {
        ...(record ? { recordId: record.id, expectedVersion: record.version } : {}),
        name: String(data.get("name") ?? "").trim(),
        config: parseFormConfig(definition.fields, data, record),
        status: data.get("status") === "active" ? "active" : "draft",
      });
      if (requestSequence.current === sequence) {
        setDirty(false);
        router.push(returnTo);
        router.refresh();
      }
    } catch (caught) {
      if (requestSequence.current === sequence) setError(safeError(caught));
    } finally {
      if (activeSubmission.current === submission) {
        activeSubmission.current = undefined;
        if (requestSequence.current === sequence) setBusy(false);
      }
    }
  }

  if (kind === "administrator_invite") return <PanelPageShell>
    <PanelPageHeader title={recordId ? "Daveti düzenle" : "Yönetici ekle"} />
    {!canManage ? <p className={styles.error} role="alert">Düzenleme yetkiniz yok.</p> : loading ? <p className={styles.state} role="status">Yükleniyor…</p> : <>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {loadSucceeded ? <SettingsRecordForm key={`${record?.id ?? "new"}:${record?.version ?? 0}`} kind={kind} record={record ?? null} canManage={canManage} busy={busy} onSubmit={submit} /> : <button type="button" className={styles.button} onClick={() => void load()}>Tekrar dene</button>}
    </>}
  </PanelPageShell>;

  const title = recordId === undefined ? `Yeni ${definition.singular}` : `${definition.singular} düzenle`;

  if (definition.family !== "settings") {
    const contentFields = definition.fields.filter(field => field.type === "textarea" || field.type === "string-list");
    const optionFields = definition.fields.filter(field => field.type === "boolean" || field.type === "enum-list");
    const otherFields = definition.fields.filter(field => !contentFields.includes(field) && !optionFields.includes(field));
    const renderField = (field: MerchantModuleFieldDefinition) => field.type === "enum-list" ? <fieldset disabled={busy} className={operations.wide} key={field.key}>
      <legend>{field.label}</legend>{field.allowedValues?.map(value => <label className={operations.checkLabel} key={value}><input disabled={busy} name={field.key} type="checkbox" value={value} defaultChecked={enumListDefaultChecked(record, field.key, value)} /><span>{field.optionLabels?.[value] ?? value}</span></label>)}
    </fieldset> : <label className={field.type === "textarea" || field.type === "string-list" ? operations.wide : undefined} key={field.key}>
      {field.label}{field.required ? <span className="sr-only"> zorunlu</span> : null}
      {field.type === "textarea" || field.type === "string-list" ? <textarea disabled={busy} name={field.key} required={field.required} maxLength={4000} placeholder={field.placeholder} defaultValue={inputValue(record, field.key)} /> : field.type === "boolean" ? <span className={operations.toggle}><input disabled={busy} name={field.key} type="checkbox" defaultChecked={record?.config[field.key] === true} /><span>Etkin</span></span> : field.type === "enum" || field.type === "number" && field.allowedValues ? <select disabled={busy} name={field.key} required={field.required} defaultValue={inputValue(record, field.key)}><option value="">Seçin</option>{field.allowedValues?.map(value => <option key={value} value={value}>{field.optionLabels?.[value] ?? value}</option>)}</select> : <input disabled={busy} name={field.key} required={field.required} type={field.type === "email" || field.type === "url" ? field.type : field.type === "number" ? "number" : field.type === "datetime" ? "datetime-local" : "text"} min={field.type === "number" ? 0 : undefined} step={field.type === "number" ? 1 : field.type === "datetime" ? "0.001" : undefined} maxLength={field.type === "number" ? undefined : 1000} placeholder={field.placeholder} defaultValue={field.type === "datetime" ? dateTimeInputValue(record, field.key) : inputValue(record, field.key)} />}
    </label>;
    const previewValue = preview ?? { name: record?.name ?? "", config: record?.config ?? {} };
    return <div className={operations.workspace}><PanelPageShell>
      <h1 className={styles.srOnly}>{title}</h1><PanelPageHeader title={title} />
      <Link className={operations.back} href={returnTo} onClick={event => { if (busy || dirty && !window.confirm("Kaydedilmemiş değişikliklerden vazgeçilsin mi?")) event.preventDefault(); }}><ArrowLeft aria-hidden="true" /> {definition.title}</Link>
      {!canManage ? <p className={styles.readOnly} role="status">Düzenleme yetkiniz yok.</p> : loading ? <p className={styles.state} role="status">Yükleniyor…</p> : <>
        {error ? <div className={operations.feedback}><p className={styles.error} role="alert">{error}{loadSucceeded ? " Bilgileriniz korundu." : ""}</p>{!loadSucceeded ? <button type="button" className={styles.button} onClick={() => void load()}>Tekrar dene</button> : null}</div> : null}
        {loadSucceeded ? <div className={operations.editLayout}>
          <form key={`${kind}:${recordId ?? "new"}`} className={operations.form} aria-busy={busy} onSubmit={submit} onInput={event => {
            const data = new FormData(event.currentTarget);
            const config: Record<string, MerchantAdminJson> = {};
            for (const field of definition.fields) config[field.key] = field.type === "boolean" ? data.get(field.key) === "on" : field.type === "enum-list" ? data.getAll(field.key).filter((value): value is string => typeof value === "string") : String(data.get(field.key) ?? "");
            setPreview({ name: String(data.get("name") ?? ""), config }); setDirty(true);
          }}>
            <section><h2>{recordId ? record?.name || "Kayıt" : "Kayıt bilgileri"}</h2><div className={operations.fields}>
              <label>Ad<input disabled={busy} name="name" required maxLength={160} defaultValue={record?.name ?? ""} /></label>
              <label>{definition.execution === "provider_required" ? "Hazırlık durumu" : "Yayın durumu"}<select disabled={busy} name="status" defaultValue="active"><option value="draft">Kapalı</option><option value="active">{definition.execution === "provider_required" ? "Hazırlık için yapılandırıldı" : "Aktif"}</option></select></label>
              {otherFields.map(renderField)}
            </div></section>
            {contentFields.length ? <section><h2>{definition.family === "marketing" ? "Mesaj" : kind === "lucky_wheel" ? "Ödüller ve koşullar" : "İçerik"}</h2><div className={operations.fields}>{contentFields.map(renderField)}</div></section> : null}
            {optionFields.length ? <section><h2>Tercihler</h2><div className={operations.fields}>{optionFields.map(renderField)}</div></section> : null}
            <footer className={operations.saveBar}><span role="status">{busy ? "Kaydediliyor…" : dirty ? "Kaydedilmedi" : record ? `v${record.version}` : "Yeni kayıt"}</span><div><Link href={returnTo} className={styles.button} onClick={event => { if (busy || dirty && !window.confirm("Kaydedilmemiş değişikliklerden vazgeçilsin mi?")) event.preventDefault(); }}>Vazgeç</Link><button className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button></div></footer>
          </form>
          <RecordPreview kind={kind} config={previewValue.config} name={previewValue.name} />
        </div> : null}
      </>}
    </PanelPageShell></div>;
  }
  if (!canManage) {
    return <PanelPageShell><PanelPageHeader title={title} description={definition.description} /><p className={styles.error} role="alert">Bu kayıt için düzenleme yetkiniz yok.</p></PanelPageShell>;
  }

  return <PanelPageShell><PanelPageHeader title={title} description={definition.description} /><section className={styles.surface}>
    {loading ? <p className={styles.state} role="status">Kayıt yükleniyor…</p> : null}
    {!loading && error ? <p className={styles.error} role="alert">{error}</p> : null}
    {!loading && !error && definition.execution === "provider_required" ? <p className={styles.notice}>{definition.notice} Bu ekranda yalnız güvenli yapılandırma kaydedilir; harici çalıştırma başlatılmaz.</p> : null}
    {!loading && !error ? <form className={styles.form} onSubmit={submit}>
      <label>Ad<input name="name" required maxLength={160} defaultValue={record?.name ?? ""} /></label>
      <label>{definition.execution === "provider_required" ? "Hazırlık durumu" : "Yayın durumu"}<select name="status" defaultValue="active"><option value="draft">Kapalı</option><option value="active">{definition.execution === "provider_required" ? "Hazırlık için yapılandırıldı" : "Aktif"}</option></select></label>
      {definition.fields.map((field) => field.type === "enum-list" ? (
        <fieldset className={styles.wide} key={field.key}>
          <legend>{field.label}</legend>
          {field.allowedValues?.map((value) => (
            <label key={value}>
              <input name={field.key} type="checkbox" value={value} defaultChecked={enumListDefaultChecked(record, field.key, value)} />
              <span>{field.optionLabels?.[value] ?? value}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <label className={field.type === "textarea" || field.type === "string-list" ? styles.wide : undefined} key={field.key}>
          {field.label}
          {field.key === "policyType" && record ? (
            <input name={field.key} readOnly aria-readonly="true" value={inputValue(record, field.key)} />
          ) : field.type === "textarea" || field.type === "string-list" ? (
            <textarea name={field.key} required={field.required} maxLength={4000} placeholder={field.placeholder} defaultValue={inputValue(record, field.key)} />
          ) : field.type === "boolean" ? (
            <span className={styles.switchField}><input name={field.key} type="checkbox" defaultChecked={record?.config[field.key] === true} /><span>Etkin</span></span>
          ) : field.type === "enum" || field.type === "number" && field.allowedValues ? (
            <select name={field.key} required={field.required} defaultValue={inputValue(record, field.key)}><option value="">Seçin</option>{field.allowedValues?.map((value) => <option key={value} value={value}>{field.optionLabels?.[value] ?? value}</option>)}</select>
          ) : (
            <input name={field.key} required={field.required} type={field.type === "email" || field.type === "url" ? field.type : field.type === "number" ? "number" : field.type === "datetime" ? "datetime-local" : "text"} min={field.type === "number" ? 0 : undefined} step={field.type === "number" ? 1 : undefined} maxLength={field.type === "number" ? undefined : 1000} placeholder={field.placeholder} defaultValue={inputValue(record, field.key)} />
          )}
        </label>
      ))}
      <div className={`${styles.wide} ${styles.actions}`}><button className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button></div>
    </form> : null}
  </section></PanelPageShell>;
}
