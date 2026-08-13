"use client";

import type {
  MerchantAdminJson,
  MerchantPaymentMethod,
  MerchantProviderDescriptor,
  MerchantProviderProfile,
  PaymentProviderEnvironment,
} from "@celebix/saas-contracts";
import { AlertTriangle, CheckCircle2, PlugZap, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import {
  ProviderExecutionApiError,
  providerExecutionApi,
} from "@/lib/provider-execution-ui/client";
import {
  buildPaymentProviderConnectionViewModel,
  selectPaymentProviderConnectionProfile,
} from "@/lib/payment-settings-ui/model";

import styles from "./payment-settings.module.css";
import { PaytrConnectionForm } from "./PaytrConnectionForm";

const PAYTR_POLL_DELAYS_MS = Object.freeze([0, 800, 1_600, 2_400, 4_000] as const);
type PaytrRefreshResult = Readonly<{
  profile: MerchantProviderProfile;
  methodActive: boolean;
}>;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function PaymentProviderConnectionDrawer(props: Readonly<{
  descriptor: MerchantProviderDescriptor;
  environments: readonly PaymentProviderEnvironment[];
  initialEnvironment: PaymentProviderEnvironment;
  storefrontHostname: string | null;
  profiles: readonly MerchantProviderProfile[];
  methods: readonly MerchantPaymentMethod[];
  canManage: boolean;
  onClose(): void;
  onSaved(profileId: string, environment: PaymentProviderEnvironment): Promise<PaytrRefreshResult | null>;
}>) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const mountedRef = useRef(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "warning" | "error">("warning");
  const [providerUnavailable, setProviderUnavailable] = useState(false);
  const [selectedEnvironment, setSelectedEnvironment] = useState(props.initialEnvironment);

  useEffect(() => {
    mountedRef.current = true;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      mountedRef.current = false;
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const selectedProfile = selectPaymentProviderConnectionProfile(
    props.profiles,
    props.descriptor.providerCode,
    [selectedEnvironment],
  );
  const connection = props.storefrontHostname === null ? null : buildPaymentProviderConnectionViewModel({
    descriptor: props.descriptor,
    environment: selectedEnvironment,
    ...(selectedProfile ? { profile: selectedProfile } : {}),
    storefrontHostname: props.storefrontHostname,
    methods: props.methods,
    providerUnavailable,
  });
  const canSubmit = connection !== null
    && selectedProfile?.status !== "pending_validation"
    && (selectedProfile === null || connection.canRotate);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      props.onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) { event.preventDefault(); return; }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !props.canManage || !canSubmit) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const publicConfig = Object.freeze({
      environment: selectedEnvironment,
      ...Object.fromEntries(
        props.descriptor.publicFields.map((field) => [field.key, String(data.get(field.key) ?? "").trim()]),
      ),
    }) as Readonly<Record<string, MerchantAdminJson>>;
    const credential = Object.freeze(Object.fromEntries(
      props.descriptor.credentialFields.map((field) => [field.key, String(data.get(field.key) ?? "")]),
    ));
    setBusy(true);
    setMessage("");
    setProviderUnavailable(false);
    try {
      const saved = await providerExecutionApi.save({
        providerCode: props.descriptor.providerCode,
        capability: "payment_processing",
        publicConfig,
        credential,
        expectedVersion: selectedProfile?.version ?? 0,
        ...(selectedProfile ? { profileId: selectedProfile.id } : {}),
      });
      if (!mountedRef.current) return;
      form.reset();
      if (props.descriptor.providerCode !== "paytr_iframe") {
        setMessageTone("success");
        setMessage("Doğrulama bekliyor");
        await props.onSaved(saved.id, selectedEnvironment);
        return;
      }

      setMessageTone("warning");
      setMessage("PayTR bağlantısı kontrol ediliyor.");
      let latest: PaytrRefreshResult | null = null;
      for (const delay of PAYTR_POLL_DELAYS_MS) {
        if (delay > 0) await wait(delay);
        if (!mountedRef.current) return;
        latest = await props.onSaved(saved.id, selectedEnvironment);
        if (latest === null || latest.profile.status !== "pending_validation") break;
      }
      if (!mountedRef.current) return;
      if (latest?.profile.status === "active" && latest.methodActive) {
        setMessageTone("success");
        setMessage(latest.profile.publicConfig.environment === "test"
          ? "PayTR test modu etkinleştirildi."
          : "PayTR canlı ödeme etkinleştirildi.");
      } else if (latest?.profile.status === "rotation_required") {
        setMessageTone("error");
        setMessage("PayTR bilgileri doğrulanamadı. Bilgileri kontrol edip yeniden kaydedin.");
      } else if (latest === null || latest.profile.status === "active") {
        setProviderUnavailable(true);
        setMessageTone("warning");
        setMessage("PayTR ayarları doğrulandı ancak ödeme yöntemi henüz etkinleşmedi. Sistem daha sonra yeniden kontrol edecek.");
      } else {
        setMessageTone("warning");
        setMessage("Kontrol devam ediyor. Bu pencereyi kapatabilirsiniz.");
      }
    } catch (error) {
      if (!mountedRef.current) return;
      if (error instanceof ProviderExecutionApiError && error.code === "unavailable") {
        setProviderUnavailable(true);
      }
      setMessageTone("error");
      setMessage(error instanceof ProviderExecutionApiError
        ? error.message
        : "Sağlayıcı bağlantısı kaydedilemedi.");
    } finally {
      if (mountedRef.current) {
        form.reset();
        setBusy(false);
      }
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
          <div className={styles.dialogTitleIcon}>{props.descriptor.providerCode === "paytr_iframe" ? <ShieldCheck aria-hidden="true" /> : <PlugZap aria-hidden="true" />}</div>
          <div>
            <h2 id="payment-connection-title">{props.descriptor.providerCode === "paytr_iframe" ? "PayTR iFrame kurulumu" : `${props.descriptor.label} bağlantısı`}</h2>
            <p id="payment-connection-description">{props.descriptor.providerCode === "paytr_iframe" ? "PayTR mağaza bilgilerinizi girin; doğrulama ve etkinleştirme Celebix tarafından tamamlanır." : "Yalnız sağlayıcının doğrulanmış alanlarını doldurun."}</p>
          </div>
          <button ref={closeRef} className={styles.iconButton} type="button" onClick={props.onClose} disabled={busy} aria-label="Bağlantı penceresini kapat"><X /></button>
        </header>

        {!props.canManage ? <p className={styles.readOnlyNotice}>Salt okunur erişim: bağlantı bilgileri değiştirilemez.</p> : null}
        {message ? <p className={messageTone === "success" ? styles.successNotice : messageTone === "warning" ? styles.providerWarning : styles.errorNotice} role={messageTone === "error" ? "alert" : "status"}>{messageTone === "success" ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}{message}</p> : null}

        <form key={selectedEnvironment} className={styles.connectionForm} autoComplete="off" onSubmit={(event) => void save(event)}>
          {connection?.kind === "paytr" ? <PaytrConnectionForm
            connection={connection}
            disabled={busy || !props.canManage || !canSubmit}
            onEnvironmentChange={(environment) => {
              setMessage("");
              setProviderUnavailable(false);
              setSelectedEnvironment(environment);
            }}
          /> : <>
          <div className={styles.connectionSummary}>
            <strong>Bağlantı bilgileri</strong>
            <span>Gönderilen gizli değerler tekrar gösterilmez.</span>
          </div>
          <label>Ortam
            <select
              aria-label="Sağlayıcı ortamı"
              value={selectedEnvironment}
              disabled={busy || !props.canManage}
              onChange={(event) => {
                setMessage("");
                setSelectedEnvironment(event.currentTarget.value as PaymentProviderEnvironment);
              }}
            >
              {props.environments.map((environment) => <option key={environment} value={environment}>{environment === "test" ? "Test" : "Canlı"}</option>)}
            </select>
          </label>
          {connection ? <div className={styles.connectionSummary}>
            <strong>{connection.environmentLabel} · {connection.statusLabel}</strong>
            <span>{connection.maskedAccountReference ?? "Henüz hesap doğrulanmadı"}{connection.credentialVersionLabel ? ` · ${connection.credentialVersionLabel}` : ""}</span>
            <span>Bildirim adresi: {connection.callbackUrl}</span>
            <span>Son doğrulama: {connection.lastValidatedAt ?? "Henüz doğrulanmadı"}</span>
          </div> : <div className={styles.connectionSummary}>
            <strong>Mağaza alan adı bekleniyor</strong>
            <span>Bildirim adresi, doğrulanmış mağaza alan adı bağlandığında oluşturulur.</span>
          </div>}
          {(connection?.kind === "generic" ? connection.publicFields : props.descriptor.publicFields.map((field) => ({ ...field, initialValue: "" }))).map((field) => (
            <label key={field.key}>{field.label}<input name={field.key} required defaultValue={field.initialValue} maxLength={1_000} disabled={busy || !props.canManage || !canSubmit} /></label>
          ))}
          {(connection?.kind === "generic" ? connection.credentialFields : props.descriptor.credentialFields).map((field) => (
            <label key={field.key}>{field.label}<input name={field.key} required type="password" autoComplete="off" maxLength={16_384} disabled={busy || !props.canManage || !canSubmit} /></label>
          ))}
          </>}
          <footer className={styles.drawerActions}>
            <button type="button" className={styles.secondaryButton} onClick={props.onClose} disabled={busy}>Vazgeç</button>
            <button type="submit" className={styles.primaryButton} disabled={busy || !props.canManage || !canSubmit}>{busy ? "Kaydediliyor…" : connection?.submitLabel ?? "Bağlantıyı kaydet"}</button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
