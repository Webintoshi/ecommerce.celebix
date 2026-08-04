"use client";

import { useState } from "react";

function csrf() { return document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("__Host-celebix_account_csrf="))?.split("=").slice(1).join("=") ?? ""; }

export function AccountLogoutButton({ all = false }: Readonly<{ all?: boolean }>) {
  const [busy, setBusy] = useState(false);
  return <button className={all ? "account-text-action danger" : "account-text-action"} type="button" disabled={busy} onClick={async () => { setBusy(true); try { const response = await fetch(all ? "/api/account/logout-all" : "/api/account/logout", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json", "x-celebix-account-csrf": csrf() }, body: "{}" }); const payload = await response.json().catch(() => null) as { destination?: string } | null; if (!response.ok) throw new Error(); window.location.assign(payload?.destination || "/account/login"); } catch { setBusy(false); } }}>{busy ? "Bekleyin…" : all ? "Tüm cihazlardan çıkış yap" : "Çıkış yap"}</button>;
}
