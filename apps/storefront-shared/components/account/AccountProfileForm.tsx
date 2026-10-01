"use client";

import { useRef, useState } from "react";

function csrf(): string {
  for (const part of document.cookie.split(";")) { const selected = part.trim(); if (selected.startsWith("__Host-celebix_account_csrf=")) return selected.slice("__Host-celebix_account_csrf=".length); }
  return "";
}

export function AccountProfileForm({ mode, initial, version = 1 }: Readonly<{ mode: "complete" | "update"; initial?: Readonly<{ firstName: string; lastName: string; phone?: string; phoneVerified?: boolean }>; version?: number }>) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? ""); const [lastName, setLastName] = useState(initial?.lastName ?? ""); const [phone, setPhone] = useState(initial?.phone ?? ""); const [busy, setBusy] = useState(false); const [status, setStatus] = useState("");
  const [currentVersion, setCurrentVersion] = useState(version);
  const requestPending = useRef(false);
  const phoneVerified = initial?.phoneVerified === true;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestPending.current) return;
    requestPending.current = true;
    setBusy(true); setStatus("");
    try {
      const response = await fetch(mode === "complete" ? "/api/account/profile/complete" : "/api/account/profile", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json", "x-celebix-account-csrf": csrf() }, body: JSON.stringify({ operationId: crypto.randomUUID(), firstName, lastName, ...(!phoneVerified && phone ? { phone } : {}), ...(mode === "update" ? { expectedVersion: currentVersion } : {}) }) });
      const payload = await response.json().catch(() => null) as { message?: string; destination?: string; version?: number } | null;
      if (!response.ok) throw new Error(payload?.message || "Bilgiler kaydedilemedi.");
      if (mode === "complete") window.location.assign(payload?.destination || "/account"); else {
        if (typeof payload?.version === "number" && Number.isSafeInteger(payload.version) && payload.version > 0) setCurrentVersion(payload.version);
        setStatus("Bilgileriniz kaydedildi."); requestPending.current = false; setBusy(false);
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : "Bilgiler kaydedilemedi."); requestPending.current = false; setBusy(false); }
  }
  return <form className="account-profile-form" onSubmit={submit} aria-busy={busy}>
    <div><label><span>Ad</span><input autoComplete="given-name" required disabled={busy} value={firstName} onChange={(event) => setFirstName(event.currentTarget.value)} /></label><label><span>Soyad</span><input autoComplete="family-name" required disabled={busy} value={lastName} onChange={(event) => setLastName(event.currentTarget.value)} /></label></div>
    <label><span>Telefon <small>{phoneVerified ? "Doğrulanmış" : "İsteğe bağlı"}</small></span><input type="tel" autoComplete="tel" inputMode="tel" readOnly={phoneVerified} disabled={busy} aria-describedby={phoneVerified ? "account-verified-phone" : undefined} value={phone} onChange={(event) => setPhone(event.currentTarget.value)} placeholder="+905551112233" /></label>
    {phoneVerified ? <p className="account-form-status" id="account-verified-phone">Bu numara WhatsApp ile doğrulanmıştır ve hesabınıza giriş için kullanılır.</p> : null}
    <button className="store-button" disabled={busy} type="submit">{busy ? "Kaydediliyor…" : mode === "complete" ? "Hesabımı tamamla" : "Kaydet"}</button>
    <p className="account-form-status" role="status" aria-live="polite">{status}</p>
  </form>;
}
