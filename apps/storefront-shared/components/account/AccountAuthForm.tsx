"use client";

import { useEffect, useState } from "react";

import { favoritesStorageKey, parseFavoriteProductIds } from "@/lib/favorites.ts";

type PublicResponse = Readonly<{ destination?: string; returnTo?: string; message?: string; retryAfterSeconds?: number }>;
type AccountAuthFormProps = Readonly<{ mode: "email"; returnTo: string }> | Readonly<{ mode: "verify"; returnTo: string; ticket: string }>;

async function publicPost(path: string, body: unknown): Promise<PublicResponse> {
  const response = await fetch(path, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null) as PublicResponse | null;
  if (!response.ok || !payload) throw new Error(payload?.message || "İşlem tamamlanamadı.");
  return payload;
}

async function syncFavorites(): Promise<void> {
  try {
    const token = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("__Host-celebix_account_csrf="))?.slice("__Host-celebix_account_csrf=".length) ?? "";
    const ids = parseFavoriteProductIds(window.localStorage.getItem(favoritesStorageKey(window.location.hostname)));
    await Promise.all(ids.map((productId) => fetch("/api/account/favorites", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json", "x-celebix-account-csrf": token }, body: JSON.stringify({ operationId: crypto.randomUUID(), productId, enabled: true }) }).catch(() => null)));
  } catch {}
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
      setSent(true); setRetry(payload.retryAfterSeconds ?? 60); setStatus(payload.message || "Giriş bağlantısı gönderildi.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "İşlem tamamlanamadı."); }
    finally { setBusy(false); }
  }

  async function verify(body: Readonly<{ ticket: string } | { code: string }>) {
    if (busy) return; setBusy(true); setStatus("");
    try {
      const payload = await publicPost("/api/account/auth/verify", { ...body, returnTo });
      await syncFavorites(); window.location.assign(payload.destination || "/account");
    } catch (error) { setStatus(error instanceof Error ? error.message : "İşlem tamamlanamadı."); setBusy(false); }
  }

  if (mode === "email") {
    if (sent) return <div className="account-auth-form account-auth-sent">
      <span className="account-auth-confirmation" aria-hidden="true">✓</span>
      <div><strong>Bağlantı gönderildi</strong><p><b>{email}</b> adresindeki bağlantıyı açın.</p></div>
      <form onSubmit={sendLink}><button className="account-auth-secondary" type="submit" disabled={busy || retry > 0}>{busy ? "Gönderiliyor…" : retry > 0 ? `Tekrar gönder (${retry})` : "Tekrar gönder"}</button></form>
      <button className="account-auth-text" type="button" onClick={() => { setSent(false); setRetry(0); setStatus(""); }}>E-posta adresini değiştir</button>
      <p className="account-form-status" role="status" aria-live="polite">{status}</p>
    </div>;
    return <form className="account-auth-form" onSubmit={sendLink} noValidate>
      <label><span>E-posta adresi</span><input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(event) => setEmail(event.currentTarget.value)} placeholder="ornek@eposta.com" /></label>
      <button className="store-button" type="submit" disabled={busy}>{busy ? "Gönderiliyor…" : "Giriş bağlantısı gönder"}</button>
      <p className="account-auth-trust">Şifre gerekmez <i aria-hidden="true">·</i> Bağlantı 10 dakika geçerlidir</p>
      <p className="account-form-status" role="status" aria-live="polite">{status}</p>
    </form>;
  }

  const ticket = props.ticket;
  return <div className="account-auth-form account-auth-verify">
    {ticket ? <form onSubmit={(event) => { event.preventDefault(); void verify({ ticket: ticket }); }}>
      <button className="store-button" type="submit" disabled={busy}>{busy ? "Giriş yapılıyor…" : "Güvenli giriş yap"}</button>
    </form> : null}
    <details open={!ticket}>
      <summary>Kod ile devam et</summary>
      <form onSubmit={(event) => { event.preventDefault(); void verify({ code }); }} noValidate>
        <label><span>6 haneli kod</span><input type="text" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.currentTarget.value.replace(/\D/gu, "").slice(0, 6))} placeholder="000000" /></label>
        <button className="account-auth-secondary" type="submit" disabled={busy || code.length !== 6}>Kodla giriş yap</button>
      </form>
    </details>
    <p className="account-form-status" role="status" aria-live="polite">{status}</p>
  </div>;
}
