"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import type { SelfServeFeatureFlags } from "@/lib/self-serve-flags";
import {
  SELF_SERVE_LAST_REQUEST_STORAGE_KEY,
  SELF_SERVE_REQUEST_STORAGE_KEY,
  type SelfServeOnboardingRequest,
} from "@/lib/self-serve-onboarding";
import {
  normalizeSelfServeRegistrationInput,
  validateSelfServeRegistrationInput,
  type SelfServeRegistrationInput,
  type SelfServeRegistrationValidationError,
} from "@/lib/self-serve-registration";
import { suggestSelfServeStoreSlug } from "@/lib/self-serve-store-slug";

interface SelfServeDirectRegistrationFormProps {
  flags: SelfServeFeatureFlags;
}

interface RegistrationSuccess {
  request: SelfServeOnboardingRequest;
  plannedAdminUrl?: string | null;
  persistenceMode?: string;
  provisioning?: {
    state?: string;
    autoProvisioningEnabled?: boolean;
    storeCreateEnabled?: boolean;
    provisioningEnabled?: boolean;
  };
}

const initialForm: SelfServeRegistrationInput = {
  firstName: "",
  lastName: "",
  storeName: "",
  storeSlug: "",
  phone: "+90",
  email: "",
  password: "",
  marketingConsent: false,
  privacyConsent: false,
};

const fieldLabels: Record<keyof SelfServeRegistrationInput, string> = {
  firstName: "Ad",
  lastName: "Soyad",
  storeName: "Magaza adi",
  storeSlug: "Magaza adresi",
  phone: "Telefon",
  email: "E-posta",
  password: "Sifre",
  marketingConsent: "Ticari iletisim onayi",
  privacyConsent: "KVKK ve gizlilik onayi",
};

function saveBrowserRequest(request: SelfServeOnboardingRequest) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const raw = window.localStorage.getItem(SELF_SERVE_REQUEST_STORAGE_KEY);
    const existing = raw ? (JSON.parse(raw) as SelfServeOnboardingRequest[]) : [];
    const next = [request, ...existing.filter((item) => item.id !== request.id)].slice(0, 25);

    window.localStorage.setItem(SELF_SERVE_REQUEST_STORAGE_KEY, JSON.stringify(next));
    window.localStorage.setItem(SELF_SERVE_LAST_REQUEST_STORAGE_KEY, JSON.stringify(request));
  } catch {
    // Local storage is a convenience mirror for Phase 1 owner review; API state remains authoritative for the request.
  }
}

function toFieldErrorMap(errors: SelfServeRegistrationValidationError[]) {
  return errors.reduce<Partial<Record<keyof SelfServeRegistrationInput, string>>>((acc, error) => {
    acc[error.field] = error.message;
    return acc;
  }, {});
}

function fieldName(field: keyof SelfServeRegistrationInput) {
  return fieldLabels[field];
}

export function SelfServeDirectRegistrationForm({ flags }: SelfServeDirectRegistrationFormProps) {
  const [form, setForm] = useState<SelfServeRegistrationInput>(initialForm);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof SelfServeRegistrationInput, string>>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<RegistrationSuccess | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const domainSuffix = flags.defaultDomainSuffix || "celebix.site";

  function updateField<K extends keyof SelfServeRegistrationInput>(field: K, value: SelfServeRegistrationInput[K]) {
    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "storeName" && !slugTouched && typeof value === "string") {
        next.storeSlug = suggestSelfServeStoreSlug(value);
      }

      return next;
    });

    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
    setGlobalError(null);
  }

  function handleTextChange(field: keyof SelfServeRegistrationInput) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      if (field === "storeSlug") {
        setSlugTouched(true);
      }

      updateField(field, event.target.value as never);
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeSelfServeRegistrationInput(form);
    const validationErrors = validateSelfServeRegistrationInput(normalized);

    setForm((current) => ({ ...current, ...normalized, password: current.password }));

    if (validationErrors.length > 0) {
      setFieldErrors(toFieldErrorMap(validationErrors));
      setGlobalError("Lutfen isaretli alanlari kontrol edin.");
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    setGlobalError(null);

    try {
      const response = await fetch("/api/self-serve/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalized),
      });
      const payload = (await response.json()) as
        | (RegistrationSuccess & { code?: string; errors?: string[]; fieldErrors?: SelfServeRegistrationValidationError[] })
        | { errors?: string[]; fieldErrors?: SelfServeRegistrationValidationError[] };

      if (!response.ok || !("request" in payload)) {
        if ("fieldErrors" in payload && payload.fieldErrors) {
          setFieldErrors(toFieldErrorMap(payload.fieldErrors));
        }

        setGlobalError(payload.errors?.[0] ?? "Kayit su anda tamamlanamadi. Lutfen tekrar deneyin.");
        return;
      }

      saveBrowserRequest(payload.request);
      setSuccess(payload);
      setForm({ ...initialForm, phone: normalized.phone, email: normalized.email });
      setSlugTouched(false);
    } catch {
      setGlobalError("Kayit servisine ulasilamadi. Lutfen kisa bir sure sonra tekrar deneyin.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (success) {
    return (
      <section className="self-serve-direct-success" aria-live="polite">
        <span className="self-serve-direct-success-icon">✓</span>
        <p className="self-serve-direct-kicker">Basvurunuz alindi</p>
        <h2>{success.request.store.storeName} kuruluma hazirlaniyor.</h2>
        <p>
          Hesap ve magaza kurulum sureci hazir oldugunda admin panelinize guvenli sekilde
          yonlendirileceksiniz.
        </p>
        <div className="self-serve-direct-status-grid">
          <div>
            <span>Magaza adresi</span>
            <strong>{success.request.store.proposedDomain ?? `${success.request.store.slug}.${domainSuffix}`}</strong>
          </div>
          <div>
            <span>Planlanan admin</span>
            <strong>{success.plannedAdminUrl ?? "Guvenli handoff bekliyor"}</strong>
          </div>
          <div>
            <span>Durum</span>
            <strong>Kurulum hazirlaniyor</strong>
          </div>
          <div>
            <span>Guvenlik</span>
            <strong>{success.provisioning?.state === "disabled_by_flag" ? "Kurulum sirada" : "Hazirlaniyor"}</strong>
          </div>
        </div>
        <button className="button button-secondary" type="button" onClick={() => setSuccess(null)}>
          Yeni kayit ekranina don
        </button>
      </section>
    );
  }

  return (
    <form className="self-serve-direct-form" onSubmit={handleSubmit} noValidate>
      <div className="self-serve-direct-form-head">
        <img src="/branding/celebix-logo.svg" alt="Celebix" className="self-serve-logo self-serve-form-logo" />
        <div>
          <p className="self-serve-direct-kicker">Tek ekranda basla</p>
          <h2>Magaza ve hesap bilgileri</h2>
          <span>
            Bilgilerinizi girin, magaza adresinizi secin ve kurulum talebinizi tek adimda baslatin.
          </span>
        </div>
      </div>

      <div className="self-serve-direct-inline">
        <label>
          <span>{fieldName("firstName")}</span>
          <input
            name="firstName"
            value={form.firstName}
            onChange={handleTextChange("firstName")}
            autoComplete="given-name"
            placeholder="Harun"
            aria-invalid={Boolean(fieldErrors.firstName)}
          />
          {fieldErrors.firstName ? <small>{fieldErrors.firstName}</small> : null}
        </label>
        <label>
          <span>{fieldName("lastName")}</span>
          <input
            name="lastName"
            value={form.lastName}
            onChange={handleTextChange("lastName")}
            autoComplete="family-name"
            placeholder="Yilmaz"
            aria-invalid={Boolean(fieldErrors.lastName)}
          />
          {fieldErrors.lastName ? <small>{fieldErrors.lastName}</small> : null}
        </label>
      </div>

      <label>
        <span>{fieldName("storeName")}</span>
        <input
          name="storeName"
          value={form.storeName}
          onChange={handleTextChange("storeName")}
          autoComplete="organization"
          placeholder="Ornek Magaza"
          aria-invalid={Boolean(fieldErrors.storeName)}
        />
        {fieldErrors.storeName ? <small>{fieldErrors.storeName}</small> : null}
      </label>

      <label>
        <span>{fieldName("storeSlug")}</span>
        <div className="self-serve-slug-field">
          <input
            name="storeSlug"
            value={form.storeSlug}
            onChange={handleTextChange("storeSlug")}
            autoComplete="off"
            placeholder="ornek-magaza"
            aria-invalid={Boolean(fieldErrors.storeSlug)}
          />
          <b>.{domainSuffix}</b>
        </div>
        {fieldErrors.storeSlug ? <small>{fieldErrors.storeSlug}</small> : null}
      </label>

      <div className="self-serve-direct-inline">
        <label>
          <span>{fieldName("phone")}</span>
          <input
            name="phone"
            value={form.phone}
            onChange={handleTextChange("phone")}
            autoComplete="tel"
            inputMode="tel"
            placeholder="+905551112233"
            aria-invalid={Boolean(fieldErrors.phone)}
          />
          {fieldErrors.phone ? <small>{fieldErrors.phone}</small> : null}
        </label>
        <label>
          <span>{fieldName("email")}</span>
          <input
            name="email"
            value={form.email}
            onChange={handleTextChange("email")}
            autoComplete="email"
            inputMode="email"
            placeholder="mail@ornek.com"
            aria-invalid={Boolean(fieldErrors.email)}
          />
          {fieldErrors.email ? <small>{fieldErrors.email}</small> : null}
        </label>
      </div>

      <label>
        <span>{fieldName("password")}</span>
        <div className="self-serve-password-field">
          <input
            name="password"
            value={form.password}
            onChange={handleTextChange("password")}
            autoComplete="new-password"
            type={showPassword ? "text" : "password"}
            placeholder="En az 8 karakter"
            aria-invalid={Boolean(fieldErrors.password)}
          />
          <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Sifreyi goster veya gizle">
            {showPassword ? "Gizle" : "Goster"}
          </button>
        </div>
        {fieldErrors.password ? <small>{fieldErrors.password}</small> : null}
      </label>

      <div className="self-serve-consent-stack">
        <label className="self-serve-direct-consent">
          <input
            type="checkbox"
            checked={form.marketingConsent}
            onChange={(event) => updateField("marketingConsent", event.target.checked)}
          />
          <span>Firsatlar ve bilgilendirmeler icin ticari elektronik ileti almak istiyorum. (Opsiyonel)</span>
        </label>
        <label className="self-serve-direct-consent">
          <input
            type="checkbox"
            checked={form.privacyConsent}
            onChange={(event) => updateField("privacyConsent", event.target.checked)}
            aria-invalid={Boolean(fieldErrors.privacyConsent)}
          />
          <span>KVKK, gizlilik ve acik riza metinlerini okudum; basvuru icin onayliyorum.</span>
        </label>
        {fieldErrors.privacyConsent ? <small>{fieldErrors.privacyConsent}</small> : null}
      </div>

      {globalError ? <p className="form-error self-serve-form-error">{globalError}</p> : null}

      <button className="button button-primary self-serve-direct-submit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Kayit hazirlaniyor..." : "E-Ticaret Sistemi Kur"}
      </button>
    </form>
  );
}
