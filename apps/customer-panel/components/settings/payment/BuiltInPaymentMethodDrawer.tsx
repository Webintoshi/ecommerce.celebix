"use client";

import {
  normalizeTurkishIbanInput,
  parseBuiltInPaymentMethodConfig,
  type BuiltInPaymentMethodKind,
  type MerchantAdminJson,
  type MerchantPaymentMethod,
} from "@celebix/saas-contracts";
import { Banknote, Truck, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import styles from "./payment-settings.module.css";

export type BuiltInPaymentMethodDrawerSubmit = Readonly<{
  kind: BuiltInPaymentMethodKind;
  method: MerchantPaymentMethod | null;
  methodId: string;
  label: string;
  config: Readonly<Record<string, MerchantAdminJson>>;
}>;

function initialConfigValue(method: MerchantPaymentMethod | null, key: string): string {
  const value = method?.config[key];
  return typeof value === "string" ? value : "";
}

function canonicalLabel(value: string): string | null {
  const selected = value.trim();
  const bytes = new TextEncoder().encode(selected).byteLength;
  return bytes >= 1 && bytes <= 120 ? selected : null;
}

export function BuiltInPaymentMethodDrawer(props: Readonly<{
  kind: BuiltInPaymentMethodKind;
  method: MerchantPaymentMethod | null;
  canManage: boolean;
  busy: boolean;
  onSubmit(value: BuiltInPaymentMethodDrawerSubmit): void | Promise<void>;
  onClose(): void;
}>) {
  const drawerRef = useRef<HTMLElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const ibanRef = useRef<HTMLInputElement>(null);
  const submitOwnedRef = useRef(false);
  const consoleOwnedRef = useRef(false);
  const [message, setMessage] = useState("");
  const isBankTransfer = props.kind === "bank_transfer";
  const title = isBankTransfer ? "Banka havalesi" : "Kapıda ödeme";
  const Icon = isBankTransfer ? Banknote : Truck;

  useEffect(() => {
    labelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (props.busy) {
      consoleOwnedRef.current = true;
    } else if (consoleOwnedRef.current) {
      submitOwnedRef.current = false;
      consoleOwnedRef.current = false;
    }
  }, [props.busy]);

  function close() {
    if (!props.busy && !submitOwnedRef.current) props.onClose();
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !props.busy && !submitOwnedRef.current) {
      event.preventDefault();
      props.onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitOwnedRef.current || props.busy || !props.canManage) return;
    const data = new FormData(event.currentTarget);
    const label = canonicalLabel(String(data.get("label") ?? ""));
    if (label === null) {
      setMessage("Ödeme ekranı etiketi 1–120 bayt arasında olmalıdır.");
      labelRef.current?.focus();
      return;
    }

    let config: Readonly<Record<string, MerchantAdminJson>>;
    try {
      config = isBankTransfer
        ? parseBuiltInPaymentMethodConfig(props.kind, {
          accountHolder: String(data.get("accountHolder") ?? "").trim(),
          bankName: String(data.get("bankName") ?? "").trim(),
          iban: normalizeTurkishIbanInput(String(data.get("iban") ?? "")),
          instructions: String(data.get("instructions") ?? "").trim(),
        })
        : parseBuiltInPaymentMethodConfig(props.kind, {
          instructions: String(data.get("instructions") ?? "").trim(),
        });
    } catch {
      setMessage(isBankTransfer
        ? "Banka bilgilerini ve geçerli Türkiye IBAN numarasını kontrol edin."
        : "Müşteri talimatı en fazla 500 bayt olabilir.");
      (isBankTransfer ? ibanRef : labelRef).current?.focus();
      return;
    }

    setMessage("");
    submitOwnedRef.current = true;
    const methodId = props.method?.id ?? crypto.randomUUID();
    await props.onSubmit(Object.freeze({
      kind: props.kind,
      method: props.method,
      methodId,
      label,
      config,
    }));
  }

  const disabled = props.busy || !props.canManage;
  return (
    <div className={styles.drawerLayer} onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <aside
        ref={drawerRef}
        className={styles.builtInDrawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="built-in-payment-title"
        aria-describedby="built-in-payment-description"
        onKeyDown={onKeyDown}
      >
        <header className={styles.dialogHeader}>
          <div className={styles.dialogTitleIcon}><Icon aria-hidden="true" /></div>
          <div>
            <h2 id="built-in-payment-title">{props.method ? `${title} yöntemini düzenle` : `${title} ekle`}</h2>
            <p id="built-in-payment-description">Müşterinin ödeme adımında göreceği bilgileri düzenleyin.</p>
          </div>
          <button
            className={styles.iconButton}
            type="button"
            onClick={close}
            disabled={props.busy}
            aria-label="Yerleşik yöntem penceresini kapat"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        {!props.canManage
          ? <p className={styles.readOnlyNotice}>Salt okunur erişim: yöntem bilgileri değiştirilemez.</p>
          : null}
        {props.method?.state === "emergency_disabled"
          ? <p className={styles.providerWarning}>Acil durum kapatması düzenleme sırasında korunur.</p>
          : null}
        {message ? <p className={styles.errorNotice} role="alert">{message}</p> : null}

        <form className={styles.builtInForm} onSubmit={(event) => void submit(event)}>
          <label>
            Ödeme ekranı etiketi
            <input
              ref={labelRef}
              name="label"
              required
              maxLength={120}
              defaultValue={props.method?.label ?? title}
              disabled={disabled}
            />
          </label>
          {isBankTransfer ? <>
            <label>
              Banka adı
              <input
                name="bankName"
                required
                maxLength={120}
                defaultValue={initialConfigValue(props.method, "bankName")}
                disabled={disabled}
              />
            </label>
            <label>
              Hesap sahibi
              <input
                name="accountHolder"
                required
                maxLength={160}
                defaultValue={initialConfigValue(props.method, "accountHolder")}
                disabled={disabled}
              />
            </label>
            <label>
              Türkiye IBAN numarası
              <input
                ref={ibanRef}
                name="iban"
                required
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={40}
                defaultValue={initialConfigValue(props.method, "iban")}
                disabled={disabled}
              />
            </label>
          </> : null}
          <label>
            Müşteri talimatı
            <textarea
              name="instructions"
              maxLength={500}
              defaultValue={initialConfigValue(props.method, "instructions")}
              disabled={disabled}
            />
          </label>
          <footer className={styles.drawerActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={close}
              disabled={props.busy}
            >
              Vazgeç
            </button>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={disabled}
            >
              {props.busy ? "Kaydediliyor…" : props.method ? "Değişiklikleri kaydet" : "Kaydet ve etkinleştir"}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
