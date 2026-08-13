"use client";

import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

import type { PaytrPaymentProviderConnectionView } from "@/lib/payment-settings-ui/model";

import styles from "./payment-settings.module.css";

const PAYTR_MERCHANT_PANEL_URL = "https://www.paytr.com/magaza/kullanici-girisi";

function SecretField(props: Readonly<{
  name: "merchantKey" | "merchantSalt";
  label: string;
  disabled: boolean;
}>) {
  const [visible, setVisible] = useState(false);
  return <label>{props.label}
    <span className={styles.secretField}>
      <input
        name={props.name}
        required
        type={visible ? "text" : "password"}
        autoComplete="new-password"
        maxLength={16_384}
        disabled={props.disabled}
      />
      <button
        type="button"
        className={styles.fieldIconButton}
        aria-label={visible ? `${props.label} değerini gizle` : `${props.label} değerini göster`}
        aria-pressed={visible}
        disabled={props.disabled}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </span>
  </label>;
}

export function PaytrConnectionForm(props: Readonly<{
  connection: PaytrPaymentProviderConnectionView;
  disabled: boolean;
  onEnvironmentChange(environment: "test" | "live"): void;
}>) {
  const [copied, setCopied] = useState(false);

  async function copyCallback() {
    try {
      await navigator.clipboard.writeText(props.connection.callbackUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      setCopied(false);
    }
  }

  return <>
    <section className={styles.paytrStatusCard} aria-label="PayTR bağlantı durumu">
      <span className={styles.paytrStatusIcon}><ShieldCheck aria-hidden="true" /></span>
      <span>
        <strong>{props.connection.statusLabel}</strong>
        <small>
          {props.connection.maskedAccountReference ?? "PayTR mağaza bilgilerinizi girerek kuruluma başlayın."}
          {props.connection.lastValidatedAt ? ` · Son kontrol ${props.connection.lastValidatedAt}` : ""}
        </small>
      </span>
      <span className={styles[`tone-${props.connection.statusTone}`]}>{props.connection.environmentLabel}</span>
    </section>

    {props.connection.anotherActiveProviderLabel ? <p className={styles.providerWarning} role="status">
      PayTR etkinleştiğinde mevcut “{props.connection.anotherActiveProviderLabel}” kart sağlayıcısı devre dışı kalır.
    </p> : null}

    <label className={styles.paytrModeControl}>
      <span><strong>Test Modu</strong><small>Gerçek tahsilat yapmadan bağlantıyı doğrulayın.</small></span>
      <input
        type="checkbox"
        role="switch"
        checked={props.connection.environment === "test"}
        disabled={props.disabled}
        onChange={(event) => props.onEnvironmentChange(event.currentTarget.checked ? "test" : "live")}
      />
    </label>

    <label>Mağaza numarası
      <input
        name="merchantId"
        required
        defaultValue={props.connection.merchantIdInitialValue}
        autoComplete="off"
        maxLength={1_000}
        disabled={props.disabled}
      />
    </label>
    <SecretField name="merchantKey" label="Mağaza parolası" disabled={props.disabled} />
    <SecretField name="merchantSalt" label="Mağaza gizli anahtarı" disabled={props.disabled} />

    <section className={styles.callbackCard} aria-labelledby="paytr-callback-title">
      <span>
        <strong id="paytr-callback-title">Bildirim URL’si</strong>
        <small>Bu adresi PayTR mağaza panelindeki bildirim URL’si alanına ekleyin.</small>
      </span>
      <code>{props.connection.callbackUrl}</code>
      <button type="button" className={styles.secondaryButton} onClick={() => void copyCallback()}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? "Kopyalandı" : "Kopyala"}
      </button>
    </section>

    <a
      className={styles.paytrPanelLink}
      href={PAYTR_MERCHANT_PANEL_URL}
      target="_blank"
      rel="noreferrer"
    >
      PayTR Satıcı Panelini Aç<ExternalLink aria-hidden="true" />
    </a>
  </>;
}
