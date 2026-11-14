"use client";

import { useId, useState } from "react";
import styles from "./newsletter-form.module.css";

export function NewsletterForm({ consentLabel, appearance = "default" }: Readonly<{ consentLabel: string; appearance?: "default" | "footer" }>) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [consentInvalid, setConsentInvalid] = useState(false);
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const labelId = useId();
  const consentErrorId = useId();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent || status === "pending") return;
    setStatus("pending");
    try {
      const response = await fetch("/api/newsletter/subscriptions", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, consent: true }) });
      if (!response.ok) throw new Error("newsletter_unavailable");
      setEmail(""); setConsent(false); setStatus("success");
    } catch { setStatus("error"); }
  }
  const footer = appearance === "footer";
  const EmailField = footer ? "div" : "label";
  return <form className={footer ? styles.form : "retail-newsletter-form"} onSubmit={submit} aria-busy={status === "pending"}>
    <EmailField className={footer ? styles.emailField : undefined}>
      <span id={footer ? labelId : undefined}>E-posta adresi</span>
      <span><input type="email" name="email" aria-labelledby={footer ? labelId : undefined} autoComplete="email" maxLength={254} required placeholder={footer ? "E-posta adresiniz" : undefined} value={email} onChange={(event) => setEmail(event.currentTarget.value)} disabled={status === "pending"} />
        <button type="submit" aria-label={footer ? "E-bültene kaydol" : undefined} disabled={status === "pending"}>{footer ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg> : "Kaydol"}</button>
      </span>
    </EmailField>
    <label className={footer ? styles.consent : "retail-newsletter-consent"}><input
      type="checkbox"
      name="consent"
      required
      checked={consent}
      aria-invalid={consentInvalid}
      aria-describedby={consentInvalid ? consentErrorId : undefined}
      onInvalid={() => setConsentInvalid(true)}
      onChange={(event) => {
        setConsent(event.currentTarget.checked);
        setConsentInvalid(false);
      }}
      disabled={status === "pending"}
    /><span>{consentLabel}</span></label>
    {consentInvalid ? <p id={consentErrorId}>Abone olmak için iletişim iznini onaylayın.</p> : null}
    <p aria-live="polite">{status === "success" ? "Aboneliğiniz kaydedildi." : status === "error" ? "Abonelik şu anda tamamlanamadı." : status === "pending" ? "Kaydediliyor…" : ""}</p>
  </form>;
}
