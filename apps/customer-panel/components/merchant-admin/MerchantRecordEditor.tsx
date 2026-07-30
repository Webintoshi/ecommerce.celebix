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
    const raw = String(data.get(field.key) ?? "").trim();
    if (!raw) continue;
    if (field.type === "number") {
      if (field.allowedValues && !field.allowedValues.includes(raw)) throw new TypeError("merchant_record_form_invalid");
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("merchant_record_form_invalid");
      config[field.key] = value;
    } else if (field.type === "textarea" && field.key.endsWith("s")) {
      config[field.key] = Object.freeze(
        raw.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).slice(0, 100),
      );
    } else {
      config[field.key] = raw;
    }
  }
  return Object.freeze(config);
}

function safeError(caught: unknown) {
  if (caught instanceof MerchantAdminApiError) return caught.message;
  if (caught instanceof TypeError && caught.message === "merchant_record_form_invalid") {
    return "Gönderilen kayıt bilgileri geçersiz.";
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
    {!loading && !error ? <form className={styles.form} onSubmit={submit}>
      <label>Ad<input name="name" required maxLength={160} defaultValue={record?.name ?? ""} /></label>
      <label>Yayın durumu<select name="status" defaultValue={record?.status === "active" ? "active" : "draft"}><option value="draft">Taslak</option><option value="active">Aktif</option></select></label>
      {definition.fields.map((field) => (
        <label className={field.type === "textarea" ? styles.wide : undefined} key={field.key}>
          {field.label}
          {field.key === "policyType" && record ? (
            <input name={field.key} readOnly aria-readonly="true" value={inputValue(record, field.key)} />
          ) : field.type === "textarea" ? (
            <textarea name={field.key} maxLength={4000} placeholder={field.placeholder} defaultValue={inputValue(record, field.key)} />
          ) : field.type === "boolean" ? (
            <span className={styles.switchField}><input name={field.key} type="checkbox" defaultChecked={record?.config[field.key] === true} /><span>Etkin</span></span>
          ) : field.type === "enum" || field.type === "number" && field.allowedValues ? (
            <select name={field.key} defaultValue={inputValue(record, field.key)}>{field.allowedValues?.map((value) => <option key={value} value={value}>{field.optionLabels?.[value] ?? value}</option>)}</select>
          ) : (
            <input name={field.key} type={field.type} min={field.type === "number" ? 0 : undefined} step={field.type === "number" ? 1 : undefined} maxLength={field.type === "number" ? undefined : 1000} placeholder={field.placeholder} defaultValue={inputValue(record, field.key)} />
          )}
        </label>
      ))}
      <div className={`${styles.wide} ${styles.actions}`}><button className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button></div>
    </form> : null}
  </section></PanelPageShell>;
}
