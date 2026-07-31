"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CustomerDetail } from "@celebix/saas-contracts";
import type { CustomerAddressInput } from "@celebix/saas-data";

import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { CustomerApiError, customerApi } from "@/lib/customer-ui/client";
import styles from "./customer-console.module.css";

function message(error: unknown) {
  return error instanceof CustomerApiError ? error.message : "Müşteri bilgileri güncellenemedi.";
}

function customerAddresses(customer: CustomerDetail): readonly CustomerAddressInput[] {
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

function normalizedAddresses(addresses: readonly CustomerAddressInput[]): readonly CustomerAddressInput[] {
  return addresses.map((address, index) => ({
    ...(address.id ? { id: address.id } : {}),
    label: address.label.trim(),
    recipientName: address.recipientName.trim(),
    line1: address.line1.trim(),
    ...(address.line2?.trim() ? { line2: address.line2.trim() } : {}),
    city: address.city.trim(),
    ...(address.district?.trim() ? { district: address.district.trim() } : {}),
    ...(address.postalCode?.trim() ? { postalCode: address.postalCode.trim() } : {}),
    country: address.country.trim().toUpperCase(),
    isDefault: addresses.some((item) => item.isDefault) ? address.isDefault : index === 0,
  }));
}

export function CustomerEditConsole({ customerId, initialCustomer, initialError = "" }: Readonly<{ customerId: string; initialCustomer?: CustomerDetail; initialError?: string }>) {
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerDetail | null>(initialCustomer ?? null);
  const [addresses, setAddresses] = useState<readonly CustomerAddressInput[]>(() => initialCustomer ? customerAddresses(initialCustomer) : []);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setCustomer(null);
    setAddresses([]);
    setError("");
    setBusy(false);
    try {
      const result = await customerApi.get(customerId);
      if (requestSequence.current === sequence && result.id === customerId) {
        setCustomer(result);
        setAddresses(customerAddresses(result));
      }
    } catch (caught) {
      if (requestSequence.current === sequence) setError(message(caught));
    }
  }, [customerId, requestSequence]);

  useEffect(() => {
    if (initialCustomer || initialError) return;
    void load();
    return () => { requestSequence.current += 1; };
  }, [initialCustomer, initialError, load, requestSequence]);

  function updateAddress(index: number, patch: Partial<CustomerAddressInput>) {
    setAddresses((current) => current.map((address, position) => position === index ? { ...address, ...patch } : address));
  }

  function addAddress() {
    if (!customer || addresses.length >= 20) return;
    setAddresses((current) => [...current, {
      label: current.length ? `Adres ${current.length + 1}` : "Varsayılan",
      recipientName: customer.displayName,
      line1: "",
      city: "",
      country: "TR",
      isDefault: current.length === 0,
    }]);
  }

  function removeAddress(index: number) {
    setAddresses((current) => {
      const remaining = current.filter((_address, position) => position !== index);
      if (remaining.length && !remaining.some((address) => address.isDefault)) return remaining.map((address, position) => ({ ...address, isDefault: position === 0 }));
      return remaining;
    });
  }

  function makeDefault(index: number) {
    setAddresses((current) => current.map((address, position) => ({ ...address, isDefault: position === index })));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer || customer.id !== customerId || busy) return;
    const sequence = requestSequence.current;
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
        addresses: normalizedAddresses(addresses),
        consents: formConsents,
        expectedVersion: customer.version,
      });
      if (requestSequence.current === sequence) router.push(`/customers/${result.id}`);
    } catch (caught) {
      if (requestSequence.current === sequence) setError(caught instanceof CustomerApiError && caught.code === "version_conflict" ? "Bu müşteri sizden önce güncellendi. En güncel kaydı yükleyip tekrar deneyin." : message(caught));
    } finally { if (requestSequence.current === sequence) setBusy(false); }
  }

  if (error && (!customer || customer.id !== customerId)) return <PanelPageShell><p className={styles.error} role="alert">{error}</p><button className={styles.button} type="button" onClick={() => void load()}>Tekrar dene</button></PanelPageShell>;
  if (!customer || customer.id !== customerId) return <PanelPageShell><p className={styles.state} role="status">Müşteri hazırlanıyor…</p></PanelPageShell>;
  return (
    <PanelPageShell>
      <Link className={styles.back} href={`/customers/${encodeURIComponent(customer.id)}`}>← Müşteri ayrıntılarına dön</Link>
      <PanelPageHeader title="Müşteriyi Düzenle" description="İletişim, izin ve adres defterini güvenli kayıt sürümüyle güncelleyin." />
      <form className={styles.form} onSubmit={submit}>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.grid}>
          <label>Ad<input name="firstName" defaultValue={customer.firstName} required maxLength={100} /></label>
          <label>Soyad<input name="lastName" defaultValue={customer.lastName} required maxLength={100} /></label>
          <label>E-posta<input name="email" type="email" defaultValue={customer.email ?? ""} maxLength={320} /></label>
          <label>Telefon<input name="phone" type="tel" defaultValue={customer.phone ?? ""} maxLength={16} /></label>
        </div>

        <section className={styles.section} aria-label="Adres defteri">
          <div className={styles.sectionHeader}>
            <div><h2>Adres defteri</h2><p>En fazla 20 teslimat adresi; tek bir varsayılan adres seçilebilir.</p></div>
            <button className={styles.button} type="button" disabled={addresses.length >= 20} onClick={addAddress}>Adres ekle</button>
          </div>
          {addresses.length ? <div className={styles.addressEditorList}>{addresses.map((address, index) => (
            <fieldset className={styles.addressEditor} key={address.id ?? `new-${index}`}>
              <legend>{address.label || `Adres ${index + 1}`}</legend>
              <div className={styles.grid}>
                <label>Adres etiketi<input value={address.label} required maxLength={50} onChange={(event) => updateAddress(index, { label: event.target.value })} /></label>
                <label>Alıcı adı<input value={address.recipientName} required maxLength={200} onChange={(event) => updateAddress(index, { recipientName: event.target.value })} /></label>
                <label className={styles.wide}>Adres<input value={address.line1} required maxLength={300} onChange={(event) => updateAddress(index, { line1: event.target.value })} /></label>
                <label className={styles.wide}>Adres devamı<input value={address.line2 ?? ""} maxLength={300} onChange={(event) => updateAddress(index, { line2: event.target.value })} /></label>
                <label>İlçe<input value={address.district ?? ""} maxLength={100} onChange={(event) => updateAddress(index, { district: event.target.value })} /></label>
                <label>Şehir<input value={address.city} required maxLength={100} onChange={(event) => updateAddress(index, { city: event.target.value })} /></label>
                <label>Posta kodu<input value={address.postalCode ?? ""} maxLength={20} onChange={(event) => updateAddress(index, { postalCode: event.target.value })} /></label>
                <label>Ülke kodu<input value={address.country} required pattern="[A-Z]{2}" maxLength={2} onChange={(event) => updateAddress(index, { country: event.target.value.toUpperCase() })} /></label>
              </div>
              <div className={styles.addressEditorActions}>
                <label className={styles.defaultAddress}><input type="radio" name="defaultAddress" checked={address.isDefault} onChange={() => makeDefault(index)} />Varsayılan adres</label>
                <button className={styles.danger} type="button" onClick={() => removeAddress(index)}>Adresi kaldır</button>
              </div>
            </fieldset>
          ))}</div> : <p className={styles.inlineEmpty}>Adres kaydı yok. İsterseniz adres ekleyebilirsiniz.</p>}
        </section>

        <section className={styles.section}>
          <div><h2>İletişim izinleri</h2><p>Kanal izinleri açık ve kalıcı kayıtla güncellenir.</p></div>
          <div className={styles.checks}>{(["email", "phone", "whatsapp"] as const).map((channel) => <label className={styles.check} key={channel}><input name={`${channel}Consent`} type="checkbox" defaultChecked={customer.consents.some((consent) => consent.channel === channel && consent.status === "granted")} />{channel === "email" ? "E-posta" : channel === "phone" ? "Telefon" : "WhatsApp"}</label>)}</div>
        </section>
        <div className={styles.actions}><Link className={styles.button} href={`/customers/${encodeURIComponent(customer.id)}`}>Vazgeç</Link><button className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}</button></div>
      </form>
    </PanelPageShell>
  );
}
