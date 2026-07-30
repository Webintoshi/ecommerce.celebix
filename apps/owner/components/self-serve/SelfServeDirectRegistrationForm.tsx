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
  plannedStoreUrl?: string | null;
  plannedAdminUrl?: string | null;
  persistenceMode?: string;
  provisioning?: {
    freeStarterStoreEnabled?: boolean;
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
  privacyConsent: true,
};

const fieldLabels: Record<keyof SelfServeRegistrationInput, string> = {
  firstName: "Ad",
  lastName: "Soyad",
  storeName: "Mağaza adı",
  storeSlug: "Mağaza adresi",
  phone: "Telefon",
  email: "E-posta",
  password: "Şifre",
  marketingConsent: "Ticari iletişim onayı",
  privacyConsent: "KVKK ve gizlilik onayı",
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
    // Local storage is a convenience mirror for the control-plane monitor; API state remains authoritative.
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

  const domainSuffix = flags.defaultDomainSuffix || "celebix.site";

  function updateField<K extends keyof SelfServeRegistrationInput>(field: K, value: SelfServeRegistrationInput[K]) {
    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "storeName" && typeof value === "string") {
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
      if (field === "storeName") {
        delete next.storeSlug;
      }
      return next;
    });
    setGlobalError(null);
  }

  function handleTextChange(field: keyof SelfServeRegistrationInput) {
    return (event: ChangeEvent<HTMLInputElement>) => {
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
    } catch {
      setGlobalError("Kayit servisine ulasilamadi. Lutfen kisa bir sure sonra tekrar deneyin.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (success) {
    const plannedStoreUrl =
      success.plannedStoreUrl ??
      success.request.store.plannedStoreUrl ??
      `https://${success.request.store.proposedDomain ?? `${success.request.store.slug}.${domainSuffix}`}`;
    const plannedAdminUrl =
      success.plannedAdminUrl ?? success.request.store.plannedAdminUrl ?? `https://admin-${success.request.store.slug}.${domainSuffix}`;

    return (
      <section className="self-serve-direct-success" aria-live="polite">
        <span className="self-serve-direct-success-icon">✓</span>
        <h2>Ücretsiz mağazanız hazırlanıyor.</h2>
        <p>
          {success.request.store.storeName} için Celebix başlangıç mağazası sıraya alındı. Hazır olduğunda doğrudan
          yönetim panelinize yönlendirileceksiniz.
        </p>
        <div className="self-serve-direct-status-grid">
          <div>
            <span>Mağaza</span>
            <strong>{plannedStoreUrl}</strong>
          </div>
          <div>
            <span>Admin panel</span>
            <strong>{plannedAdminUrl}</strong>
          </div>
          <div>
            <span>Durum</span>
            <strong>Mağaza oluşturuluyor</strong>
          </div>
        </div>
        <button className="button button-secondary" type="button" onClick={() => setSuccess(null)}>
          Yeni kayıt ekranına dön
        </button>
      </section>
    );
  }

  return (
    <form className="self-serve-direct-form" onSubmit={handleSubmit} noValidate>
      <div className="self-serve-direct-inline">
        <label>
          <span className="self-serve-register-sr-only">{fieldName("firstName")}</span>
          <input
            name="firstName"
            value={form.firstName}
            onChange={handleTextChange("firstName")}
            autoComplete="given-name"
            placeholder="Ad"
            aria-invalid={Boolean(fieldErrors.firstName)}
          />
          {fieldErrors.firstName ? <small>{fieldErrors.firstName}</small> : null}
        </label>
        <label>
          <span className="self-serve-register-sr-only">{fieldName("lastName")}</span>
          <input
            name="lastName"
            value={form.lastName}
            onChange={handleTextChange("lastName")}
            autoComplete="family-name"
            placeholder="Soyad"
            aria-invalid={Boolean(fieldErrors.lastName)}
          />
          {fieldErrors.lastName ? <small>{fieldErrors.lastName}</small> : null}
        </label>
      </div>

      <label>
        <span className="self-serve-register-sr-only">{fieldName("storeName")}</span>
        <div
          className={`self-serve-store-name-field${fieldErrors.storeName || fieldErrors.storeSlug ? " has-error" : ""}`}
        >
          <input
            name="storeName"
            value={form.storeName}
            onChange={handleTextChange("storeName")}
            autoComplete="organization"
            placeholder="Mağazanızın Adı"
            aria-invalid={Boolean(fieldErrors.storeName || fieldErrors.storeSlug)}
          />
          <b>.{domainSuffix}</b>
        </div>
        {fieldErrors.storeName || fieldErrors.storeSlug ? (
          <small>{fieldErrors.storeName ?? fieldErrors.storeSlug}</small>
        ) : null}
      </label>

      <label>
        <span className="self-serve-register-sr-only">{fieldName("phone")}</span>
        <div className={`self-serve-phone-field${fieldErrors.phone ? " has-error" : ""}`}>
          <span className="self-serve-phone-prefix" aria-hidden="true">
            🇹🇷
          </span>
          <span className="self-serve-phone-control">
            <span className="self-serve-phone-label" aria-hidden="true">
              Telefon
            </span>
            <input
              name="phone"
              value={form.phone}
              onChange={handleTextChange("phone")}
              autoComplete="tel"
              inputMode="tel"
              aria-invalid={Boolean(fieldErrors.phone)}
            />
          </span>
        </div>
        {fieldErrors.phone ? <small>{fieldErrors.phone}</small> : null}
      </label>

      <label>
        <span className="self-serve-register-sr-only">{fieldName("email")}</span>
        <input
          name="email"
          value={form.email}
          onChange={handleTextChange("email")}
          autoComplete="email"
          inputMode="email"
          placeholder="E-posta"
          aria-invalid={Boolean(fieldErrors.email)}
        />
        {fieldErrors.email ? <small>{fieldErrors.email}</small> : null}
      </label>

      <label>
        <span className="self-serve-register-sr-only">{fieldName("password")}</span>
        <div className={`self-serve-password-field${fieldErrors.password ? " has-error" : ""}`}>
          <input
            name="password"
            value={form.password}
            onChange={handleTextChange("password")}
            autoComplete="new-password"
            type={showPassword ? "text" : "password"}
            placeholder="Şifre"
            aria-invalid={Boolean(fieldErrors.password)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
              <circle cx="12" cy="12" r="2.7" />
              {showPassword ? <path d="m4 4 16 16" /> : null}
            </svg>
          </button>
        </div>
        {fieldErrors.password ? <small>{fieldErrors.password}</small> : null}
      </label>

      {globalError ? <p className="form-error self-serve-form-error">{globalError}</p> : null}

      <button className="button button-primary self-serve-direct-submit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Kayıt hazırlanıyor..." : "E-Ticaret Sistemi Kur"}
      </button>

      <p className="self-serve-register-legal">
        E-Ticaret Sistemi Kur&apos;a tıklayarak <em>Kullanım sözleşmesi</em>&apos;ni onaylıyorum.
      </p>
      <div className="self-serve-register-trust-row" aria-label="Kayıt avantajları">
        <span>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 2.8 14 4l2.3-.1 1.1 2 2.1 1 .1 2.3 1.3 1.8-1.3 1.8-.1 2.3-2.1 1-1.1 2L14 20l-2 1.2L10 20l-2.3.1-1.1-2-2.1-1-.1-2.3L3.1 13l1.3-1.8.1-2.3 2.1-1 1.1-2L10 4l2-1.2Z" />
            <path d="m8.7 12.1 2.1 2.1 4.5-4.7" />
          </svg>
          Ömür boyu ücretsiz
        </span>
        <i aria-hidden="true" />
        <span>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <rect x="2.8" y="5.2" width="18.4" height="12.5" rx="2" />
            <path d="M3 9h18M16.8 14.2l4.4 4.4m0-4.4-4.4 4.4" />
          </svg>
          Kredi kartı gerektirmez
        </span>
      </div>
    </form>
  );
}
