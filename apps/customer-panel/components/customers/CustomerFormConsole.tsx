"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  PanelPageHeader,
  PanelPageShell,
} from "@/components/panel/PanelPageShell";
import { CustomerApiError, customerApi } from "@/lib/customer-ui/client";
import styles from "./customer-console.module.css";

type CustomerFormField = "firstName" | "lastName" | "email" | "country";

export function CustomerFormConsole() {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [fieldErrors, setFieldErrors] = useState<
      Partial<Record<CustomerFormField, string>>
    >({});

  function clearFieldError(field: CustomerFormField) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = e.currentTarget,
      f = new FormData(form),
      firstName = String(f.get("firstName") ?? "").trim(),
      lastName = String(f.get("lastName") ?? "").trim(),
      email = String(f.get("email") ?? "")
        .trim()
        .toLowerCase(),
      phone = String(f.get("phone") ?? "").trim(),
      line1 = String(f.get("line1") ?? "").trim(),
      city = String(f.get("city") ?? "").trim(),
      postalCode = String(f.get("postalCode") ?? "").trim(),
      country = String(f.get("country") ?? "TR")
        .trim()
        .toUpperCase();
    const emailInput = form.elements?.namedItem?.("email") as HTMLInputElement | null,
      countryInput = form.elements?.namedItem?.("country") as HTMLInputElement | null,
      nextErrors: Partial<Record<CustomerFormField, string>> = {};

    if (!firstName) nextErrors.firstName = "Ad alanı gerekli.";
    if (!lastName) nextErrors.lastName = "Soyad alanı gerekli.";
    if (email && emailInput?.validity.typeMismatch) {
      nextErrors.email = "Geçerli bir e-posta adresi girin.";
    }
    if (country && countryInput?.validity.patternMismatch) {
      nextErrors.country = "İki harfli ülke kodu kullanın.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    setBusy(true);
    try {
      const r = await customerApi.create({
        firstName,
        lastName,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        addresses:
          line1 && city
            ? [
                {
                  label: "Varsayılan",
                  recipientName: `${firstName} ${lastName}`,
                  line1,
                  city,
                  ...(postalCode ? { postalCode } : {}),
                  country,
                  isDefault: true,
                },
              ]
            : [],
        consents: [
          {
            channel: "email",
            status: f.get("emailConsent") === "on" ? "granted" : "denied",
          },
          {
            channel: "phone",
            status: f.get("phoneConsent") === "on" ? "granted" : "denied",
          },
          {
            channel: "whatsapp",
            status: f.get("whatsappConsent") === "on" ? "granted" : "denied",
          },
        ],
      });
      router.push(`/customers/${r.id}`);
    } catch (x) {
      setError(
        x instanceof CustomerApiError ? x.message : "Müşteri oluşturulamadı.",
      );
      setBusy(false);
    }
  }
  return (
    <PanelPageShell>
      <PanelPageHeader
        title="Yeni Müşteri"
        description="Müşteri bilgilerini, varsayılan adresini ve iletişim tercihlerini tek kayıtta oluşturun."
      />
      <form
        className={styles.createCustomerWorkspace}
        onSubmit={submit}
        noValidate
      >
        {error ? (
          <p className={styles.createCustomerApiError} role="alert">
            {error}
          </p>
        ) : null}
        <section className={styles.createCustomerSection}>
          <header className={styles.createCustomerSectionHeader}>
            <h2>Müşteri bilgileri</h2>
            <p>Müşterinin temel kimlik ve iletişim bilgilerini girin.</p>
          </header>
          <div className={styles.createCustomerGrid}>
            <label className={styles.createCustomerField}>
              <span>Ad</span>
              <input
                name="firstName"
                autoComplete="given-name"
                required
                maxLength={100}
                aria-invalid={fieldErrors.firstName ? "true" : undefined}
                aria-describedby="create-customer-first-name-help"
                onChange={() => clearFieldError("firstName")}
              />
              <small
                id="create-customer-first-name-help"
                className={fieldErrors.firstName ? styles.createCustomerFieldError : styles.createCustomerFieldHint}
                aria-live="polite"
              >
                {fieldErrors.firstName || "Müşteri kaydında görünecek ad."}
              </small>
            </label>
            <label className={styles.createCustomerField}>
              <span>Soyad</span>
              <input
                name="lastName"
                autoComplete="family-name"
                required
                maxLength={100}
                aria-invalid={fieldErrors.lastName ? "true" : undefined}
                aria-describedby="create-customer-last-name-help"
                onChange={() => clearFieldError("lastName")}
              />
              <small
                id="create-customer-last-name-help"
                className={fieldErrors.lastName ? styles.createCustomerFieldError : styles.createCustomerFieldHint}
                aria-live="polite"
              >
                {fieldErrors.lastName || "Müşteri kaydında görünecek soyad."}
              </small>
            </label>
            <label className={styles.createCustomerField}>
              <span>E-posta <small>Opsiyonel</small></span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="ornek@firma.com"
                maxLength={320}
                aria-invalid={fieldErrors.email ? "true" : undefined}
                aria-describedby="create-customer-email-help"
                onChange={() => clearFieldError("email")}
              />
              <small
                id="create-customer-email-help"
                className={fieldErrors.email ? styles.createCustomerFieldError : styles.createCustomerFieldHint}
                aria-live="polite"
              >
                {fieldErrors.email || "Sipariş ve iletişim süreçlerinde kullanılabilir."}
              </small>
            </label>
            <label className={styles.createCustomerField}>
              <span>Telefon <small>Opsiyonel</small></span>
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="Örn. +905551112233"
                maxLength={16}
              />
              <small className={styles.createCustomerFieldHint}>Ülke koduyla birlikte girin.</small>
            </label>
          </div>
        </section>
        <section className={styles.createCustomerSection}>
          <header className={styles.createCustomerSectionHeader}>
            <h2>Varsayılan adres</h2>
            <p>İsteğe bağlıdır. Bu adres müşteri kaydının varsayılan teslimat adresi olarak kullanılır.</p>
          </header>
          <div className={styles.createCustomerAddressGrid}>
            <label className={`${styles.createCustomerField} ${styles.createCustomerAddressLine}`}>
              <span>Adres <small>Opsiyonel</small></span>
              <input name="line1" autoComplete="street-address" maxLength={300} />
              <small className={styles.createCustomerFieldHint}>Sokak, cadde, bina ve daire bilgisi.</small>
            </label>
            <label className={`${styles.createCustomerField} ${styles.createCustomerCity}`}>
              <span>Şehir</span>
              <input name="city" autoComplete="address-level2" maxLength={100} />
            </label>
            <label className={`${styles.createCustomerField} ${styles.createCustomerPostalCode}`}>
              <span>Posta kodu</span>
              <input name="postalCode" inputMode="numeric" autoComplete="postal-code" maxLength={20} />
            </label>
            <label className={`${styles.createCustomerField} ${styles.createCustomerCountry}`}>
              <span>Ülke kodu</span>
              <input
                name="country"
                autoComplete="country"
                defaultValue="TR"
                pattern="[A-Z]{2}"
                maxLength={2}
                aria-invalid={fieldErrors.country ? "true" : undefined}
                aria-describedby="create-customer-country-help"
                onChange={() => clearFieldError("country")}
              />
              <small
                id="create-customer-country-help"
                className={fieldErrors.country ? styles.createCustomerFieldError : styles.createCustomerFieldHint}
                aria-live="polite"
              >
                {fieldErrors.country || "ISO ülke kodu, örn. TR."}
              </small>
            </label>
          </div>
        </section>
        <section className={styles.createCustomerSection}>
          <header className={styles.createCustomerSectionHeader}>
            <h2>İletişim izinleri</h2>
            <p>Müşterinin iletişim kurulmasına izin verdiği kanalları seçin.</p>
          </header>
          <div className={styles.createCustomerConsents}>
            <label className={styles.createCustomerConsent}>
              <input name="emailConsent" type="checkbox" />
              <span><strong>E-posta</strong><small>E-posta iletişimine izin ver</small></span>
            </label>
            <label className={styles.createCustomerConsent}>
              <input name="phoneConsent" type="checkbox" />
              <span><strong>Telefon</strong><small>Telefon iletişimine izin ver</small></span>
            </label>
            <label className={styles.createCustomerConsent}>
              <input name="whatsappConsent" type="checkbox" />
              <span><strong>WhatsApp</strong><small>WhatsApp iletişimine izin ver</small></span>
            </label>
          </div>
        </section>
        <footer className={styles.createCustomerActions}>
          <button
            className={styles.createCustomerCancel}
            type="button"
            onClick={() => router.push("/customers")}
          >
            Vazgeç
          </button>
          <button className={styles.createCustomerSubmit} disabled={busy}>
            {busy ? "Kaydediliyor…" : "Müşteri oluştur"}
          </button>
        </footer>
      </form>
    </PanelPageShell>
  );
}
