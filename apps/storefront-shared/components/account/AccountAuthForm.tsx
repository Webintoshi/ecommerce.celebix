"use client";

import { useState } from "react";

import { favoritesStorageKey, parseFavoriteProductIds } from "@/lib/favorites.ts";

type PublicResponse = Readonly<{ destination?: string; returnTo?: string; message?: string }>;

export function AccountAuthForm({ mode, returnTo }: Readonly<{ mode: "email" | "code"; returnTo: string }>) {
  const [value, setValue] = useState(""); const [status, setStatus] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy(true); setStatus("");
    try {
      const path = mode === "email" ? "/api/account/auth/start" : "/api/account/auth/verify";
      const body = mode === "email" ? { email: value, returnTo } : { code: value, returnTo };
      const response = await fetch(path, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => null) as PublicResponse | null;
      if (!response.ok || !payload) throw new Error(payload?.message || "İşlem tamamlanamadı.");
      if (mode === "email") window.location.assign(`/account/verify?returnTo=${encodeURIComponent(payload.returnTo || returnTo)}`);
      else {
        try {
          const token = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("__Host-celebix_account_csrf="))?.slice("__Host-celebix_account_csrf=".length) ?? "";
          const ids = parseFavoriteProductIds(window.localStorage.getItem(favoritesStorageKey(window.location.hostname)));
          await Promise.all(ids.map((productId) => fetch("/api/account/favorites", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json", "x-celebix-account-csrf": token }, body: JSON.stringify({ operationId: crypto.randomUUID(), productId, enabled: true }) }).catch(() => null)));
        } catch {}
        window.location.assign(payload.destination || "/account");
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : "İşlem tamamlanamadı."); setBusy(false); }
  }
  return <form className="account-auth-form" onSubmit={submit} noValidate>
    {mode === "email" ? <label><span>E-posta</span><input type="email" autoComplete="email" inputMode="email" required value={value} onChange={(event) => setValue(event.currentTarget.value)} placeholder="ornek@eposta.com" /></label> : <label><span>6 haneli kod</span><input type="text" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={value} onChange={(event) => setValue(event.currentTarget.value.replace(/\D/gu, "").slice(0, 6))} placeholder="000000" /></label>}
    <button className="store-button" type="submit" disabled={busy}>{busy ? "Bekleyin…" : mode === "email" ? "Kod gönder" : "Giriş yap"}</button>
    <p className="account-form-status" role="status" aria-live="polite">{status}</p>
  </form>;
}
