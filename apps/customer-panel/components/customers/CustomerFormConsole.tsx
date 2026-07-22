"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  PanelPageHeader,
  PanelPageShell,
} from "@/components/panel/PanelPageShell";
import { CustomerApiError, customerApi } from "@/lib/customer-ui/client";
import styles from "./customer-console.module.css";
export function CustomerFormConsole() {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget),
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
        description="İletişim ve izin bilgileri kalıcı mağaza kaydına yazılır."
      />
      <form className={styles.form} onSubmit={submit}>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.grid}>
          <label>
            Ad
            <input name="firstName" required maxLength={100} />
          </label>
          <label>
            Soyad
            <input name="lastName" required maxLength={100} />
          </label>
          <label>
            E-posta
            <input name="email" type="email" maxLength={320} />
          </label>
          <label>
            Telefon
            <input
              name="phone"
              type="tel"
              placeholder="+905551112233"
              maxLength={16}
            />
          </label>
        </div>
        <section className={styles.section}>
          <div>
            <h2>Varsayılan adres</h2>
            <p>
              Adres opsiyoneldir; eklendiğinde müşteri kaydına store-scoped
              bağlanır.
            </p>
          </div>
          <div className={styles.grid}>
            <label className={styles.wide}>
              Adres
              <input name="line1" maxLength={300} />
            </label>
            <label>
              Şehir
              <input name="city" maxLength={100} />
            </label>
            <label>
              Posta kodu
              <input name="postalCode" maxLength={20} />
            </label>
            <label>
              Ülke kodu
              <input
                name="country"
                defaultValue="TR"
                pattern="[A-Z]{2}"
                maxLength={2}
              />
            </label>
          </div>
        </section>
        <section className={styles.section}>
          <div>
            <h2>İletişim izinleri</h2>
            <p>Her kanal açıkça izinli veya reddedilmiş olarak kaydedilir.</p>
          </div>
          <div className={styles.checks}>
            <label className={styles.check}>
              <input name="emailConsent" type="checkbox" />
              E-posta
            </label>
            <label className={styles.check}>
              <input name="phoneConsent" type="checkbox" />
              Telefon
            </label>
            <label className={styles.check}>
              <input name="whatsappConsent" type="checkbox" />
              WhatsApp
            </label>
          </div>
        </section>
        <div className={styles.actions}>
          <button
            className={styles.button}
            type="button"
            onClick={() => router.push("/customers")}
          >
            Vazgeç
          </button>
          <button className={styles.primary} disabled={busy}>
            {busy ? "Kaydediliyor…" : "Müşteri Oluştur"}
          </button>
        </div>
      </form>
    </PanelPageShell>
  );
}
