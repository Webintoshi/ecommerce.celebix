"use client";

import { useRef, useState } from "react";

import { completeAccountProfile, createAccountProfileAttempt, type AccountProfileAttempt } from "./account-profile-client.ts";
import styles from "./account-auth.module.css";

function csrf(): string {
  for (const part of document.cookie.split(";")) {
    const selected = part.trim();
    if (selected.startsWith("__Host-celebix_account_csrf=")) return selected.slice("__Host-celebix_account_csrf=".length);
  }
  return "";
}

type Props = Readonly<{
  mode: "complete" | "update";
  initial?: Readonly<{ firstName: string; lastName: string; phone?: string; phoneVerified?: boolean }>;
  version?: number;
  returnTo?: string;
}>;

export function AccountProfileForm({ mode, initial, version = 1, returnTo }: Props) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [reverifyHref, setReverifyHref] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState(version);
  const requestPending = useRef(false);
  const completionAttempt = useRef<AccountProfileAttempt | null>(null);
  const phoneVerified = initial?.phoneVerified === true;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestPending.current) return;
    requestPending.current = true;
    setBusy(true);
    setStatus("");
    setReverifyHref(null);
    try {
      if (mode === "complete") {
        const attempt = createAccountProfileAttempt(completionAttempt.current, { firstName: firstName.trim(), lastName: lastName.trim(), returnTo }, () => crypto.randomUUID());
        completionAttempt.current = attempt;
        const result = await completeAccountProfile(attempt, csrf(), fetch);
        if (result.kind === "redirect") window.location.assign(result.destination);
        else if (result.kind === "reverify") {
          setReverifyHref(result.href);
          setStatus("Oturumunuz sona erdi. Devam etmek için telefonunuzu yeniden doğrulayın.");
        } else setStatus(result.message);
        return;
      }

      const response = await fetch("/api/account/profile", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json", "x-celebix-account-csrf": csrf() },
        body: JSON.stringify({ operationId: crypto.randomUUID(), firstName: firstName.trim(), lastName: lastName.trim(), ...(!phoneVerified && phone ? { phone } : {}), expectedVersion: currentVersion }),
      });
      const payload = await response.json().catch(() => null) as { message?: string; version?: number } | null;
      if (!response.ok) throw new Error(payload?.message || "Bilgiler kaydedilemedi.");
      if (typeof payload?.version === "number" && Number.isSafeInteger(payload.version) && payload.version > 0) setCurrentVersion(payload.version);
      setStatus("Bilgileriniz kaydedildi.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Bilgiler kaydedilemedi.");
    } finally {
      requestPending.current = false;
      setBusy(false);
    }
  }

  return <form className={mode === "complete" ? styles.form : "account-profile-form"} method="post" onSubmit={submit} aria-busy={busy}>
    {mode === "complete" ? <div className={styles.stepIntro}><h2>Hesabınızı tamamlayın</h2><p>Devam etmek için adınızı ve soyadınızı girin.</p></div> : null}
    <div className={mode === "complete" ? styles.nameFields : undefined}>
      <label className={mode === "complete" ? styles.field : undefined}><span>Ad</span><input className={mode === "complete" ? styles.input : undefined} autoComplete="given-name" required disabled={busy} value={firstName} onChange={(event) => setFirstName(event.currentTarget.value)} /></label>
      <label className={mode === "complete" ? styles.field : undefined}><span>Soyad</span><input className={mode === "complete" ? styles.input : undefined} autoComplete="family-name" required disabled={busy} value={lastName} onChange={(event) => setLastName(event.currentTarget.value)} /></label>
    </div>
    {mode === "update" ? <>
      <label><span>Telefon <small>{phoneVerified ? "Doğrulanmış" : "İsteğe bağlı"}</small></span><input type="tel" autoComplete="tel" inputMode="tel" readOnly={phoneVerified} disabled={busy} aria-describedby={phoneVerified ? "account-verified-phone" : undefined} value={phone} onChange={(event) => setPhone(event.currentTarget.value)} placeholder="+905551112233" /></label>
      {phoneVerified ? <p className="account-form-status" id="account-verified-phone">Bu numara WhatsApp ile doğrulanmıştır ve hesabınıza giriş için kullanılır.</p> : null}
    </> : null}
    <button className={mode === "complete" ? styles.primaryButton : "store-button"} disabled={busy} type="submit">{busy ? "Kaydediliyor…" : mode === "complete" ? "Kaydet ve devam et" : "Kaydet"}</button>
    <p className={mode === "complete" ? styles.status : "account-form-status"} role="status" aria-live="polite">{status}</p>
    {reverifyHref ? <a className={styles.textButton} href={reverifyHref}>Telefonu yeniden doğrula</a> : null}
  </form>;
}
