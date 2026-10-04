"use client";

import type { MerchantAdminRecord, MerchantAdminRecordKind } from "@celebix/saas-contracts";
import { Check, Circle, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getMerchantModuleDefinition } from "@/lib/merchant-admin-ui/presentation";
import styles from "./settings-record-form.module.css";

type Kind = Extract<MerchantAdminRecordKind, "general_setting" | "language_setting" | "notification_setting" | "administrator_invite">;
const SECTIONS: Record<Kind, { title: string; keys: string[]; illustration?: string }[]> = {
  general_setting: [{ title: "Mağaza", keys: ["storeDisplayName", "supportEmail"], illustration: "store" }, { title: "Bölge", keys: ["timezone"] }, { title: "Ürün kodları", keys: ["skuPrefix"] }],
  language_setting: [{ title: "Mağaza dili", keys: ["defaultLocale"], illustration: "communication" }, { title: "Etkin diller", keys: ["enabledLocales"] }],
  notification_setting: [{ title: "Sipariş", keys: ["orderNotificationsEnabled", "notificationEmail"], illustration: "communication" }, { title: "Gönderici", keys: ["senderLabel", "replyToEmail"] }],
  administrator_invite: [{ title: "Davet", keys: ["name", "email"], illustration: "store" }, { title: "Yetki", keys: ["role", "expiresAt", "status"] }],
};

function value(record: MerchantAdminRecord | null, key: string) {
  const raw = record?.config[key];
  return typeof raw === "string" || typeof raw === "number" ? String(raw) : Array.isArray(raw) ? raw.join("\n") : "";
}
function localDate(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (v: number) => String(v).padStart(2,"0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3,"0")}`;
}
function snapshot(form: HTMLFormElement) {
  return JSON.stringify(Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea")).map((input) => [input.name, input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value]));
}

export function SettingsRecordForm({ kind, record, canManage, busy, onSubmit, onDirtyChange }: {
  kind: Kind; record: MerchantAdminRecord | null; canManage: boolean; busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; onDirtyChange?: (dirty: boolean) => void;
}) {
  const definition = getMerchantModuleDefinition(kind);
  const form = useRef<HTMLFormElement>(null);
  const baseline = useRef("");
  const [dirty, setDirty] = useState(false);
  const administrator = kind === "administrator_invite";
  useEffect(() => { if (form.current) baseline.current = snapshot(form.current); onDirtyChange?.(false); }, [onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  function changed() { const next = !!form.current && snapshot(form.current) !== baseline.current; setDirty(next); onDirtyChange?.(next); }
  function reset() { form.current?.reset(); setDirty(false); onDirtyChange?.(false); }

  return <form ref={form} className={styles.form} onChange={changed} onSubmit={onSubmit} data-settings-dirty={dirty}>
    {!administrator ? <><input name="name" type="hidden" value={record?.name ?? definition.title} readOnly /><input name="status" type="hidden" value="active" readOnly /></> : null}
    {SECTIONS[kind].map((section) => <section className={styles.section} key={section.title}>
      <div className={styles.sectionLabel}><h2>{section.title}</h2>{section.illustration ? <img src={`/illustrations/settings/${section.illustration}.svg`} width={150} height={100} alt="" aria-hidden="true" /> : null}</div>
      <fieldset className={styles.fields} disabled={!canManage || busy}>
        <legend className={styles.srOnly}>{section.title}</legend>
        {section.keys.map((key) => {
          if (key === "name") return <label key={key}>Ad<input name="name" required maxLength={160} defaultValue={record?.name ?? ""} autoComplete="off" /></label>;
          if (key === "status") return <label key={key}>Davet durumu<select name="status" defaultValue="active"><option value="draft">Kapalı</option><option value="active">Aktif</option></select></label>;
          const field = definition.fields.find((field) => field.key === key)!;
          const help = key === "skuPrefix" ? "Yeni SKU'larda kullanılır. Mevcut kodlar değişmez." : key === "enabledLocales" ? "Her satıra bir dil kodu: tr-TR, en-US…" : key === "timezone" ? "Örn. Europe/Istanbul" : undefined;
          if (field.type === "boolean") return <label className={`${styles.switchRow} ${styles.wide}`} key={key}><span>{field.label}</span><input name={key} type="checkbox" role="switch" defaultChecked={record?.config[key] === true} /></label>;
          return <label key={key} className={field.type === "textarea" ? styles.wide : undefined}>{field.label}{field.required ? <span className={styles.required} aria-hidden="true">*</span> : null}
            {field.type === "textarea" ? <textarea name={key} rows={4} maxLength={4000} placeholder={field.placeholder} defaultValue={value(record,key)} /> : field.type === "enum" ? <select name={key} required={field.required} defaultValue={value(record,key)}><option value="">Seçin</option>{field.allowedValues?.map((choice) => <option key={choice} value={choice}>{field.optionLabels?.[choice] ?? choice}</option>)}</select> : <input name={key} required={field.required} type={field.type === "datetime" ? "datetime-local" : field.type} step={field.type === "datetime" ? "0.001" : undefined} maxLength={key === "skuPrefix" ? 20 : 1000} placeholder={field.placeholder} defaultValue={field.type === "datetime" ? localDate(value(record,key)) : value(record,key)} aria-describedby={help ? `settings-${key}-help` : undefined} />}
            {help ? <small id={`settings-${key}-help`}>{help}</small> : null}
          </label>;
        })}
        {kind === "administrator_invite" && section.title === "Yetki" ? <small className={styles.wide}>Yönetici tüm ayarlara, editör içerik ve kataloğa, analist raporlara erişir. Mağaza sahibi rolü devredilmez.</small> : null}
      </fieldset>
    </section>)}
    <div className={styles.saveBar}>
      <span role="status">{busy ? <Circle size={15} aria-hidden="true" /> : dirty ? <Circle size={15} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}{!canManage ? "Salt okunur" : busy ? "Kaydediliyor…" : dirty ? "Kaydedilmemiş değişiklikler" : record ? "Kaydedildi" : "Yeni yapılandırma"}</span>
      {canManage ? <div>{dirty ? <button type="button" disabled={busy} onClick={reset}><Undo2 size={16} aria-hidden="true" />Vazgeç</button> : null}<button className={styles.primary} disabled={busy || !!record && !dirty}>{administrator && !record ? "Davet oluştur" : "Kaydet"}</button></div> : null}
    </div>
  </form>;
}
