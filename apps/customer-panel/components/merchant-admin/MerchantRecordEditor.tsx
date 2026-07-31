"use client";

import type { MerchantAdminJson, MerchantAdminRecord, MerchantAdminRecordKind } from "@celebix/saas-contracts";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { MerchantAdminApiError, merchantAdminApi } from "@/lib/merchant-admin-ui/client";
import {
  getMerchantModuleDefinition,
  type MerchantModuleFieldDefinition,
} from "@/lib/merchant-admin-ui/presentation";

import styles from "./merchant-module-console.module.css";

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
      if (field.type === "string-list") throw new TypeError(`invalid_string_list_${listLimit(field)}`);
      continue;
    }
    if (field.type === "number") {
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
    if (["merchant_record_form_invalid", "invalid_datetime", "invalid_enum_value", "invalid_list_definition"].includes(caught.message)) return "Gönderilen kayıt bilgileri geçersiz.";
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    try {
      const selected = recordId === undefined ? undefined : await merchantAdminApi.record(kind, recordId);
      if (requestSequence.current !== sequence) return;
      if (selected) setRecord(selected);
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

  const title = recordId === undefined ? `Yeni ${definition.singular}` : `${definition.singular} düzenle`;
  if (!canManage) {
    return <PanelPageShell><PanelPageHeader title={title} description={definition.description} /><p className={styles.error} role="alert">Bu kayıt için düzenleme yetkiniz yok.</p></PanelPageShell>;
  }

  return <PanelPageShell><PanelPageHeader title={title} description={definition.description} /><section className={styles.surface}>
    {loading ? <p className={styles.state} role="status">Kayıt yükleniyor…</p> : null}
    {!loading && error ? <p className={styles.error} role="alert">{error}</p> : null}
    {!loading && !error && definition.execution === "provider_required" ? <p className={styles.notice}>{definition.notice} Bu ekranda yalnız güvenli yapılandırma kaydedilir; harici çalıştırma başlatılmaz.</p> : null}
    {!loading && !error ? <form className={styles.form} onSubmit={submit}>
      <label>Ad<input name="name" required maxLength={160} defaultValue={record?.name ?? ""} /></label>
      <label>{definition.execution === "provider_required" ? "Hazırlık durumu" : "Yayın durumu"}<select name="status" defaultValue={record?.status === "active" ? "active" : "draft"}><option value="draft">Taslak</option><option value="active">{definition.execution === "provider_required" ? "Hazırlık için yapılandırıldı" : "Aktif"}</option></select></label>
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
            <textarea name={field.key} maxLength={4000} placeholder={field.placeholder} defaultValue={inputValue(record, field.key)} />
          ) : field.type === "boolean" ? (
            <span className={styles.switchField}><input name={field.key} type="checkbox" defaultChecked={record?.config[field.key] === true} /><span>Etkin</span></span>
          ) : field.type === "enum" ? (
            <select name={field.key} defaultValue={inputValue(record, field.key)}><option value="">Seçin</option>{field.allowedValues?.map((value) => <option value={value} key={value}>{field.optionLabels?.[value] ?? value}</option>)}</select>
          ) : field.type === "datetime" ? (
            <input name={field.key} type="datetime-local" step="0.001" defaultValue={dateTimeInputValue(record, field.key)} />
          ) : (
            <input name={field.key} type={field.type === "email" || field.type === "url" ? field.type : field.type === "number" ? "number" : "text"} min={field.type === "number" ? 0 : undefined} step={field.type === "number" ? 1 : undefined} maxLength={field.type === "number" ? undefined : 1000} placeholder={field.placeholder} defaultValue={inputValue(record, field.key)} />
          )}
        </label>
      ))}
      <div className={`${styles.wide} ${styles.actions}`}><button className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button></div>
    </form> : null}
  </section></PanelPageShell>;
}
