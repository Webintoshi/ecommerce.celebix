"use client";

import type {
  MerchantAdminJson,
  MerchantProviderDescriptor,
  MerchantProviderProfile,
  PaymentProviderEnvironment,
} from "@celebix/saas-contracts";
import { CheckCircle2, PlugZap, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import {
  ProviderExecutionApiError,
  providerExecutionApi,
} from "@/lib/provider-execution-ui/client";
import { buildPaymentProviderConnectionViewModel } from "@/lib/payment-settings-ui/model";

import styles from "./payment-settings.module.css";

export function PaymentProviderConnectionDrawer(props: Readonly<{
  descriptor: MerchantProviderDescriptor;
  environment: PaymentProviderEnvironment;
  storefrontHostname: string | null;
  profile?: MerchantProviderProfile;
  canManage: boolean;
  onClose(): void;
  onSaved(): Promise<void>;
}>) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  const connection = props.storefrontHostname === null ? null : buildPaymentProviderConnectionViewModel({
    descriptor: props.descriptor,
    environment: props.environment,
    ...(props.profile ? { profile: props.profile } : {}),
    storefrontHostname: props.storefrontHostname,
  });

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      props.onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) { event.preventDefault(); return; }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !props.canManage) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const publicConfig = Object.freeze({
      environment: props.environment,
      ...Object.fromEntries(
        props.descriptor.publicFields.map((field) => [field.key, String(data.get(field.key) ?? "").trim()]),
      ),
    }) as Readonly<Record<string, MerchantAdminJson>>;
    const credential = Object.freeze(Object.fromEntries(
      props.descriptor.credentialFields.map((field) => [field.key, String(data.get(field.key) ?? "")]),
    ));
    setBusy(true);
    setMessage("");
    try {
      await providerExecutionApi.save({
        providerCode: props.descriptor.providerCode,
        capability: "payment_processing",
        publicConfig,
        credential,
        expectedVersion: props.profile?.version ?? 0,
        ...(props.profile ? { profileId: props.profile.id } : {}),
      });
      form.reset();
      setMessage("Doğrulama bekliyor");
      await props.onSaved();
    } catch (error) {
      setMessage(error instanceof ProviderExecutionApiError
        ? error.message
        : "Sağlayıcı bağlantısı kaydedilemedi.");
    } finally {
      form.reset();
      setBusy(false);
    }
  }

  return (
    <div className={styles.drawerLayer} onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) props.onClose();
    }}>
      <aside
        ref={drawerRef}
        className={styles.connectionDrawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-connection-title"
        aria-describedby="payment-connection-description"
        onKeyDown={onKeyDown}
      >
        <header className={styles.dialogHeader}>
          <div className={styles.dialogTitleIcon}><PlugZap aria-hidden="true" /></div>
          <div>
            <h2 id="payment-connection-title">{props.descriptor.label} bağlantısı</h2>
            <p id="payment-connection-description">Yalnız sağlayıcının doğrulanmış alanlarını doldurun.</p>
          </div>
          <button ref={closeRef} className={styles.iconButton} type="button" onClick={props.onClose} disabled={busy} aria-label="Bağlantı penceresini kapat"><X /></button>
        </header>

        {!props.canManage ? <p className={styles.readOnlyNotice}>Salt okunur erişim: bağlantı bilgileri değiştirilemez.</p> : null}
        {message ? <p className={message === "Doğrulama bekliyor" ? styles.successNotice : styles.errorNotice} role="status">{message === "Doğrulama bekliyor" ? <CheckCircle2 aria-hidden="true" /> : null}{message}</p> : null}

        <form className={styles.connectionForm} autoComplete="off" onSubmit={(event) => void save(event)}>
          <div className={styles.connectionSummary}>
            <strong>Bağlantı bilgileri</strong>
            <span>Gönderilen gizli değerler tekrar gösterilmez.</span>
          </div>
          {connection ? <div className={styles.connectionSummary}>
            <strong>{connection.environmentLabel} · {connection.statusLabel}</strong>
            <span>{connection.maskedAccountReference ?? "Henüz hesap doğrulanmadı"}{connection.credentialVersionLabel ? ` · ${connection.credentialVersionLabel}` : ""}</span>
            <span>Bildirim adresi: {connection.callbackUrl}</span>
            <span>Son doğrulama: {connection.lastValidatedAt ?? "Henüz doğrulanmadı"}</span>
          </div> : <div className={styles.connectionSummary}>
            <strong>Mağaza alan adı bekleniyor</strong>
            <span>Bildirim adresi, doğrulanmış mağaza alan adı bağlandığında oluşturulur.</span>
          </div>}
          {(connection?.publicFields ?? props.descriptor.publicFields.map((field) => ({ ...field, initialValue: "" }))).map((field) => (
            <label key={field.key}>{field.label}<input name={field.key} required defaultValue={field.initialValue} maxLength={1_000} disabled={busy || !props.canManage} /></label>
          ))}
          {(connection?.credentialFields ?? props.descriptor.credentialFields).map((field) => (
            <label key={field.key}>{field.label}<input name={field.key} required type="password" autoComplete="off" maxLength={16_384} disabled={busy || !props.canManage} /></label>
          ))}
          <footer className={styles.drawerActions}>
            <button type="button" className={styles.secondaryButton} onClick={props.onClose} disabled={busy}>Vazgeç</button>
            <button type="submit" className={styles.primaryButton} disabled={busy || !props.canManage || connection === null}>{busy ? "Kaydediliyor…" : connection?.submitLabel ?? "Bağlantıyı kaydet"}</button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
