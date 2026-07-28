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

type BuiltInFormField = "label" | "bankName" | "accountHolder" | "iban" | "instructions";
type BuiltInFormError = Readonly<{ field: BuiltInFormField; message: string }>;

const VALID_BANK_CONFIG = Object.freeze({
  accountHolder: "Örnek Ticaret Ltd. Şti.",
  bankName: "Örnek Bankası",
  iban: "TR330006100519786457841326",
  instructions: "",
});
const BANK_FIELD_ERRORS = Object.freeze({
  bankName: "Banka adı 2–120 bayt arasında olmalıdır.",
  accountHolder: "Hesap sahibi 2–160 bayt arasında olmalıdır.",
  iban: "Geçerli bir Türkiye IBAN numarası girin.",
  instructions: "Müşteri talimatı en fazla 500 bayt olabilir.",
} as const);

function invalidConfigField(
  kind: BuiltInPaymentMethodKind,
  values: Readonly<Record<string, string>>,
): BuiltInFormError | null {
  if (kind === "cash_on_delivery") {
    try {
      parseBuiltInPaymentMethodConfig(kind, { instructions: values.instructions ?? "" });
      return null;
    } catch {
      return Object.freeze({
        field: "instructions",
        message: "Müşteri talimatı en fazla 500 bayt olabilir.",
      });
    }
  }
  for (const field of ["bankName", "accountHolder", "iban", "instructions"] as const) {
    try {
      parseBuiltInPaymentMethodConfig(kind, {
        ...VALID_BANK_CONFIG,
        [field]: values[field] ?? "",
      });
    } catch {
      return Object.freeze({ field, message: BANK_FIELD_ERRORS[field] });
    }
  }
  return null;
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
  const closeRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const bankNameRef = useRef<HTMLInputElement>(null);
  const accountHolderRef = useRef<HTMLInputElement>(null);
  const ibanRef = useRef<HTMLInputElement>(null);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);
  const submitOwnedRef = useRef(false);
  const consoleOwnedRef = useRef(false);
  const [formError, setFormError] = useState<BuiltInFormError | null>(null);
  const isBankTransfer = props.kind === "bank_transfer";
  const title = isBankTransfer ? "Banka havalesi" : "Kapıda ödeme";
  const Icon = isBankTransfer ? Banknote : Truck;

  useEffect(() => {
    if (!props.busy && props.canManage) labelRef.current?.focus();
    else if (!props.busy) closeRef.current?.focus();
    else drawerRef.current?.focus();
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

  function focusField(field: BuiltInFormField) {
    if (field === "label") labelRef.current?.focus();
    else if (field === "bankName") bankNameRef.current?.focus();
    else if (field === "accountHolder") accountHolderRef.current?.focus();
    else if (field === "iban") ibanRef.current?.focus();
    else instructionsRef.current?.focus();
  }

  function errorAttributes(field: BuiltInFormField) {
    const invalid = formError?.field === field;
    return {
      "aria-invalid": invalid || undefined,
      "aria-describedby": invalid ? `built-in-payment-${field}-error` : undefined,
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitOwnedRef.current || props.busy || !props.canManage) return;
    const data = new FormData(event.currentTarget);
    const label = canonicalLabel(String(data.get("label") ?? ""));
    if (label === null) {
      const error = Object.freeze({
        field: "label" as const,
        message: "Ödeme ekranı etiketi 1–120 bayt arasında olmalıdır.",
      });
      setFormError(error);
      focusField(error.field);
      return;
    }

    const values = isBankTransfer ? Object.freeze({
      accountHolder: String(data.get("accountHolder") ?? "").trim(),
      bankName: String(data.get("bankName") ?? "").trim(),
      iban: normalizeTurkishIbanInput(String(data.get("iban") ?? "")),
      instructions: String(data.get("instructions") ?? "").trim(),
    }) : Object.freeze({
      instructions: String(data.get("instructions") ?? "").trim(),
    });
    const fieldError = invalidConfigField(props.kind, values);
    if (fieldError !== null) {
      setFormError(fieldError);
      focusField(fieldError.field);
      return;
    }

    let config: Readonly<Record<string, MerchantAdminJson>>;
    try {
      config = parseBuiltInPaymentMethodConfig(props.kind, values);
    } catch {
      const error = Object.freeze({
        field: (isBankTransfer ? "bankName" : "instructions") as BuiltInFormField,
        message: "Yöntem bilgilerini kontrol edin.",
      });
      setFormError(error);
      focusField(error.field);
      return;
    }

    setFormError(null);
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
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className={styles.dialogHeader}>
          <div className={styles.dialogTitleIcon}><Icon aria-hidden="true" /></div>
          <div>
            <h2 id="built-in-payment-title">{props.method ? `${title} yöntemini düzenle` : `${title} ekle`}</h2>
            <p id="built-in-payment-description">Müşterinin ödeme adımında göreceği bilgileri düzenleyin.</p>
          </div>
          <button
            ref={closeRef}
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
        {formError ? <p
          id={`built-in-payment-${formError.field}-error`}
          className={styles.errorNotice}
          role="alert"
        >{formError.message}</p> : null}

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
              {...errorAttributes("label")}
            />
          </label>
          {isBankTransfer ? <>
            <label>
              Banka adı
              <input
                ref={bankNameRef}
                name="bankName"
                required
                maxLength={120}
                defaultValue={initialConfigValue(props.method, "bankName")}
                disabled={disabled}
                {...errorAttributes("bankName")}
              />
            </label>
            <label>
              Hesap sahibi
              <input
                ref={accountHolderRef}
                name="accountHolder"
                required
                maxLength={160}
                defaultValue={initialConfigValue(props.method, "accountHolder")}
                disabled={disabled}
                {...errorAttributes("accountHolder")}
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
                {...errorAttributes("iban")}
              />
            </label>
          </> : null}
          <label>
            Müşteri talimatı
            <textarea
              ref={instructionsRef}
              name="instructions"
              maxLength={500}
              defaultValue={initialConfigValue(props.method, "instructions")}
              disabled={disabled}
              {...errorAttributes("instructions")}
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
