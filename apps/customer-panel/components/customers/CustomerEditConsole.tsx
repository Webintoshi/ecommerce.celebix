"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CustomerDetail } from "@celebix/saas-contracts";

import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { CustomerApiError, customerApi } from "@/lib/customer-ui/client";
import styles from "./customer-console.module.css";

function message(error: unknown) {
  return error instanceof CustomerApiError ? error.message : "Müşteri bilgileri güncellenemedi.";
}

function formAddresses(customer: CustomerDetail) {
  return customer.addresses.map((address) => ({
    id: address.id,
    label: address.label,
    recipientName: address.recipientName,
    line1: address.line1,
    ...(address.line2 ? { line2: address.line2 } : {}),
    city: address.city,
    ...(address.district ? { district: address.district } : {}),
    ...(address.postalCode ? { postalCode: address.postalCode } : {}),
    country: address.country,
    isDefault: address.isDefault,
  }));
}

export function CustomerEditConsole({ customerId }: Readonly<{ customerId: string }>) {
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try { setCustomer(await customerApi.get(customerId)); }
    catch (caught) { setError(message(caught)); }
  }, [customerId]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer) return;
    const form = new FormData(event.currentTarget);
    const firstName = String(form.get("firstName") ?? "").trim();
    const lastName = String(form.get("lastName") ?? "").trim();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const phone = String(form.get("phone") ?? "").trim();
    const formConsents = (["email", "phone", "whatsapp"] as const).map((channel) => ({
      channel,
      status: form.get(`${channel}Consent`) === "on" ? "granted" as const : "denied" as const,
    }));
    setBusy(true);
    setError("");
    try {
      const result = await customerApi.update(customerId, {
        firstName,
        lastName,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        addresses: formAddresses(customer),
        consents: formConsents,
        expectedVersion: customer.version,
      });
      router.push(`/customers/${result.id}`);
    } catch (caught) {
      setError(caught instanceof CustomerApiError && caught.code === "version_conflict" ? "Bu müşteri sizden önce güncellendi. En güncel kaydı yükleyip tekrar deneyin." : message(caught));
    } finally { setBusy(false); }
  }

  if (error && !customer) return <PanelPageShell><p className={styles.error} role="alert">{error}</p><button className={styles.button} type="button" onClick={() => void load()}>Tekrar dene</button></PanelPageShell>;
  if (!customer) return <PanelPageShell><p className={styles.state} role="status">Müşteri hazırlanıyor…</p></PanelPageShell>;
  return (
    <PanelPageShell>
      <Link className={styles.back} href={`/customers/${encodeURIComponent(customer.id)}`}>← Müşteri ayrıntılarına dön</Link>
      <PanelPageHeader title="Müşteriyi Düzenle" description="İletişim ve kanal izinlerini kayıt sürümüyle güncelleyin." />
      <form className={styles.form} onSubmit={submit}>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.grid}>
          <label>Ad<input name="firstName" defaultValue={customer.firstName} required maxLength={100} /></label>
          <label>Soyad<input name="lastName" defaultValue={customer.lastName} required maxLength={100} /></label>
          <label>E-posta<input name="email" type="email" defaultValue={customer.email ?? ""} maxLength={320} /></label>
          <label>Telefon<input name="phone" type="tel" defaultValue={customer.phone ?? ""} maxLength={16} /></label>
        </div>
        <section className={styles.section}><div><h2>İletişim izinleri</h2><p>Kanal izinleri açık ve kalıcı kayıtla güncellenir.</p></div><div className={styles.checks}>{(["email", "phone", "whatsapp"] as const).map((channel) => <label className={styles.check} key={channel}><input name={`${channel}Consent`} type="checkbox" defaultChecked={customer.consents.some((consent) => consent.channel === channel && consent.status === "granted")} />{channel === "email" ? "E-posta" : channel === "phone" ? "Telefon" : "WhatsApp"}</label>)}</div></section>
        <div className={styles.actions}><Link className={styles.button} href={`/customers/${encodeURIComponent(customer.id)}`}>Vazgeç</Link><button className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}</button></div>
      </form>
    </PanelPageShell>
  );
}
