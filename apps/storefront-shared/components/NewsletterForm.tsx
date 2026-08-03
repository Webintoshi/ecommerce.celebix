"use client";

import { useState } from "react";

export function NewsletterForm({ consentLabel }: Readonly<{ consentLabel: string }>) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
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
  return <form className="retail-newsletter-form" onSubmit={submit} noValidate><label><span>E-posta adresi</span><span><input type="email" name="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.currentTarget.value)} disabled={status === "pending"} /><button type="submit" disabled={!consent || status === "pending"}>Kaydol</button></span></label><label className="retail-newsletter-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.currentTarget.checked)} disabled={status === "pending"} /> <span>{consentLabel}</span></label><p aria-live="polite">{status === "success" ? "Aboneliğiniz kaydedildi." : status === "error" ? "Abonelik şu anda tamamlanamadı." : status === "pending" ? "Kaydediliyor…" : ""}</p></form>;
}
