"use client";

import type { StorefrontAccountDevice } from "@celebix/saas-contracts";
import { useState } from "react";
import { AccountLogoutButton } from "./AccountLogoutButton";

function csrf() { return document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("__Host-celebix_account_csrf="))?.slice("__Host-celebix_account_csrf=".length) ?? ""; }

export function AccountSecurity({ devices }: Readonly<{ devices: readonly StorefrontAccountDevice[] }>) {
  const [busy, setBusy] = useState<string | null>(null); const [status, setStatus] = useState("");
  async function revoke(deviceId: string) { setBusy(deviceId); setStatus(""); try { const response = await fetch("/api/account/devices/revoke", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json", "x-celebix-account-csrf": csrf() }, body: JSON.stringify({ operationId: crypto.randomUUID(), deviceId }) }); if (!response.ok) throw new Error(); window.location.reload(); } catch { setStatus("Cihaz oturumu kapatılamadı."); setBusy(null); } }
  return <div className="account-security"><div className="account-device-list">{devices.map((device) => <article key={device.id}><div><strong>{device.label}</strong><small>{device.current ? "Bu cihaz" : new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(device.lastSeenAt))}</small></div>{device.current ? null : <button className="account-text-action" disabled={busy === device.id} type="button" onClick={() => void revoke(device.id)}>Oturumu kapat</button>}</article>)}</div><div className="account-security-all"><h2>Tüm oturumlar</h2><p>Hesabınızın açık olduğu bütün cihazlardan çıkış yapın.</p><AccountLogoutButton all /></div><p role="status" className="account-form-status">{status}</p></div>;
}
