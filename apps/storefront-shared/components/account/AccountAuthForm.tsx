"use client";

import { useEffect, useState } from "react";

import { maskAccountEmail } from "./account-auth-view-model.ts";
import styles from "./account-auth.module.css";

type PublicResponse = Readonly<{ returnTo?: string; message?: string; retryAfterSeconds?: number }>;
type AccountAuthFormProps = Readonly<{ mode: "email"; returnTo: string }> | Readonly<{ mode: "verify"; returnTo: string; ticket: string }>;

async function publicPost(path: string, body: unknown): Promise<PublicResponse> {
  const response = await fetch(path, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null) as PublicResponse | null;
  if (!response.ok || !payload) throw new Error(payload?.message || "İşlem tamamlanamadı.");
  return payload;
}

export function AccountAuthForm(props: AccountAuthFormProps) {
  const { mode, returnTo } = props;
  const [email, setEmail] = useState(""); const [code, setCode] = useState("");
  const [sent, setSent] = useState(false); const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (retry < 1) return;
    const timer = window.setInterval(() => setRetry((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [retry > 0]);

  async function sendLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || retry > 0) return; setBusy(true); setStatus("");
    try {
      const payload = await publicPost("/api/account/auth/start", { email, returnTo });
      setSent(true); setRetry(payload.retryAfterSeconds ?? 60); setStatus("Bağlantı gönderildi.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "İşlem tamamlanamadı."); }
    finally { setBusy(false); }
  }

  if (mode === "email") {
    if (sent) return <div className={`${styles.form} ${styles.sent}`}>
      <span className={styles.confirmation} aria-hidden="true">✓</span>
      <div><strong>E-postanı kontrol et</strong><p>{maskAccountEmail(email)}</p></div>
      <form onSubmit={sendLink}><button className={styles.secondaryButton} type="submit" disabled={busy || retry > 0}>{busy ? "Gönderiliyor…" : retry > 0 ? `Tekrar gönder (${retry})` : "Tekrar gönder"}</button></form>
      <button className={styles.textButton} type="button" onClick={() => { setSent(false); setRetry(0); setStatus(""); }}>E-postayı değiştir</button>
      <p className={styles.status} role="status" aria-live="polite">{status}</p>
    </div>;
    return <form className={styles.form} onSubmit={sendLink} noValidate>
      <label className={styles.field}><span>E-posta</span><input className={styles.input} type="email" autoComplete="email" inputMode="email" required value={email} onChange={(event) => setEmail(event.currentTarget.value)} placeholder="ornek@eposta.com" /></label>
      <button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? "Gönderiliyor…" : "Bağlantı gönder"}</button>
      <p className={styles.trust}>Şifre gerekmez</p>
      <p className={styles.status} role="status" aria-live="polite">{status}</p>
    </form>;
  }

  const ticket = props.ticket;
  return <div className={`${styles.form} ${styles.verify}`}>
    {ticket ? <form method="post" action="/api/account/auth/verify-browser">
      <input type="hidden" name="ticket" value={ticket} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button className={styles.primaryButton} type="submit">Devam et</button>
    </form> : null}
    <details open={!ticket}>
      <summary>Kod ile giriş</summary>
      <form method="post" action="/api/account/auth/verify-browser" noValidate>
        <input type="hidden" name="returnTo" value={returnTo} />
        <label className={styles.field}><span>6 haneli kod</span><input className={styles.input} name="code" type="text" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.currentTarget.value.replace(/\D/gu, "").slice(0, 6))} placeholder="000000" /></label>
        <button className={styles.secondaryButton} type="submit" disabled={code.length !== 6}>Giriş yap</button>
      </form>
    </details>
    <p className={styles.status} role="status" aria-live="polite">{status}</p>
  </div>;
}
