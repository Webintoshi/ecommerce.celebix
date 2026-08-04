"use client";

import { useState } from "react";

function csrf(): string {
  for (const part of document.cookie.split(";")) { const selected = part.trim(); if (selected.startsWith("__Host-celebix_account_csrf=")) return selected.slice("__Host-celebix_account_csrf=".length); }
  return "";
}

export function AccountProfileForm({ mode, initial, version = 1 }: Readonly<{ mode: "complete" | "update"; initial?: Readonly<{ firstName: string; lastName: string; phone?: string }>; version?: number }>) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? ""); const [lastName, setLastName] = useState(initial?.lastName ?? ""); const [phone, setPhone] = useState(initial?.phone ?? ""); const [busy, setBusy] = useState(false); const [status, setStatus] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus("");
    try {
      const response = await fetch(mode === "complete" ? "/api/account/profile/complete" : "/api/account/profile", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json", "x-celebix-account-csrf": csrf() }, body: JSON.stringify({ operationId: crypto.randomUUID(), firstName, lastName, ...(phone ? { phone } : {}), ...(mode === "update" ? { expectedVersion: version } : {}) }) });
      const payload = await response.json().catch(() => null) as { message?: string; destination?: string } | null;
      if (!response.ok) throw new Error(payload?.message || "Bilgiler kaydedilemedi.");
      if (mode === "complete") window.location.assign(payload?.destination || "/account"); else { setStatus("Bilgileriniz kaydedildi."); setBusy(false); }
    } catch (error) { setStatus(error instanceof Error ? error.message : "Bilgiler kaydedilemedi."); setBusy(false); }
  }
  return <form className="account-profile-form" onSubmit={submit}>
    <div><label><span>Ad</span><input autoComplete="given-name" required value={firstName} onChange={(event) => setFirstName(event.currentTarget.value)} /></label><label><span>Soyad</span><input autoComplete="family-name" required value={lastName} onChange={(event) => setLastName(event.currentTarget.value)} /></label></div>
    <label><span>Telefon <small>İsteğe bağlı</small></span><input type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.currentTarget.value)} placeholder="+905551112233" /></label>
    <button className="store-button" disabled={busy} type="submit">{busy ? "Kaydediliyor…" : mode === "complete" ? "Hesabımı tamamla" : "Kaydet"}</button>
    <p className="account-form-status" role="status" aria-live="polite">{status}</p>
  </form>;
}
