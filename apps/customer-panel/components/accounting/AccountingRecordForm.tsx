"use client";

import type { MerchantAdminRecord } from "@celebix/saas-contracts";
import { Check, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";

import { AccountingArtwork } from "./AccountingArtwork";
import styles from "./accounting-record-form.module.css";

type Props = {
  kind: "accounting_profile" | "invoice_integration";
  record?: MerchantAdminRecord | null;
  busy: boolean;
  dirty?: boolean;
  returnTo?: string;
  embedded?: boolean;
  onDirtyChange?: () => void;
  onCancel?: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const text = (record: MerchantAdminRecord | null | undefined, key: string) => {
  const value = record?.config[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
};

export function AccountingRecordForm({ kind, record, busy, dirty = false, returnTo, embedded = false, onDirtyChange, onCancel, onSubmit }: Props) {
  const invoice = kind === "invoice_integration";
  const referenceHintId = useId();
  const [values, setValues] = useState(() => ({
    name: record?.name ?? "",
    status: record?.status === "draft" ? "draft" : "active",
    legalName: text(record, "legalName"),
    taxOffice: text(record, "taxOffice"),
    taxNumber: text(record, "taxNumber"),
    invoiceEmail: text(record, "invoiceEmail"),
    provider: text(record, "provider"),
    accountReference: text(record, "accountReference"),
    enabled: record?.config.enabled === true,
  }));
  function change<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues(current => ({ ...current, [key]: value }));
    onDirtyChange?.();
  }
  function field(key: "legalName" | "taxOffice" | "taxNumber" | "invoiceEmail" | "provider" | "accountReference", label: string, type = "text") {
    return <label className={key === "legalName" ? styles.wide : undefined}>{label}<input name={key} type={type} aria-describedby={key === "accountReference" ? referenceHintId : undefined} maxLength={1000} disabled={busy} value={values[key]} onChange={event => change(key, event.target.value)} />{key === "accountReference" ? <small id={referenceHintId} className={styles.fieldHint}>API anahtarı veya şifre yazmayın</small> : null}</label>;
  }
  const summary = invoice
    ? [["Fatura hizmeti", values.provider], ["Firma veya hesap numarası", values.accountReference], ["Bağlantı isteği", values.enabled ? "Açık" : "Kapalı"]]
    : [["Ticari unvan", values.legalName], ["Vergi dairesi", values.taxOffice], ["Vergi numarası", values.taxNumber], ["Fatura e-postası", values.invoiceEmail]];

  return <div className={`${styles.layout} ${embedded ? styles.embedded : ""}`}>
    <form className={styles.form} aria-label={invoice ? "Fatura bağlantısı" : "İşletme profili"} aria-busy={busy || undefined} onSubmit={onSubmit}>
      <section className={styles.section}>
        <h2>{invoice ? "Bağlantı bilgileri" : "İşletme kimliği"}</h2>
        <div className={styles.fields}>
          <label className={styles.wide}>{invoice ? "Bağlantı adı" : "Profil adı"}<input name="name" autoFocus={!record} required maxLength={160} disabled={busy} value={values.name} onChange={event => change("name", event.target.value)} /></label>
          {invoice ? <>{field("provider", "Fatura hizmeti")}{field("accountReference", "Hizmetteki firma veya hesap numarası")}</> : <>{field("legalName", "Ticari unvan")}{field("taxOffice", "Vergi dairesi")}{field("taxNumber", "Vergi numarası")}{field("invoiceEmail", "Fatura e-postası", "email")}</>}
        </div>
      </section>
      <section className={styles.section}>
        <h2>Tercihler</h2>
        <label className={styles.statusField}>{invoice ? "Hazırlık durumu" : "Profil durumu"}<select name="status" disabled={busy} value={values.status} onChange={event => change("status", event.target.value)}><option value="draft">Kapalı</option><option value="active">{invoice ? "Hazırlığa açık" : "Aktif"}</option></select></label>
        {invoice ? <label className={styles.toggle}><span><strong>Bağlantıyı kullanmak istiyorum</strong><small>Harici işlem için doğrulanmış sağlayıcı bağlantısı gerekir.</small></span><input type="checkbox" name="enabled" checked={values.enabled} disabled={busy} onChange={event => change("enabled", event.target.checked)} /><span className={styles.toggleTrack} aria-hidden="true"><Check size={12} /></span></label> : null}
      </section>
      <footer className={styles.saveBar}>
        <span role="status">{busy ? "Kaydediliyor…" : dirty ? "Kaydedilmedi" : record ? "Kayıtlı" : ""}</span>
        <div>{onCancel ? <button type="button" className="button button-secondary" disabled={busy} onClick={onCancel}>Vazgeç</button> : returnTo ? <Link href={returnTo} className="button button-secondary" onClick={event => { if (busy || dirty && !window.confirm("Kaydedilmemiş değişikliklerden vazgeçilsin mi?")) event.preventDefault(); }}>Vazgeç</Link> : null}<button className="button button-primary" disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</button></div>
      </footer>
    </form>
    <aside className={styles.preview} aria-label={invoice ? "Fatura bağlantısı özeti" : "İşletme profili özeti"}>
      <AccountingArtwork variant={invoice ? "invoice" : "legal"} className={styles.artwork} />
      <div className={styles.identity}><span>{invoice ? "Fatura bağlantısı" : "İşletme profili"}</span><h2>{values.name.trim() || (invoice ? "Yeni bağlantı" : "Yeni profil")}</h2></div>
      <dl className={styles.summary}>{summary.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value?.trim() || "—"}</dd></div>)}<div><dt>{invoice ? "Hazırlık durumu" : "Profil durumu"}</dt><dd>{values.status === "draft" ? "Kapalı" : invoice ? "Hazırlığa açık" : "Aktif"}</dd></div></dl>
      {invoice ? <p className={styles.safety}><ShieldCheck size={18} aria-hidden="true" /><span>Kaydetmek fatura oluşturmaz veya harici işlemi başlatmaz.</span></p> : null}
    </aside>
  </div>;
}
