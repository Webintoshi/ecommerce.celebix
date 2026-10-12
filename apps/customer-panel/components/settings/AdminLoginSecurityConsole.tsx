"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { createAdminSecurityClient, type AdminSecurityClient } from "../../lib/admin-login-security-ui/client.ts";
import { AdminSecurityUiError, safeSecurityHandoff, submitAdminSecurityHandoff, securityErrorMessage, type AdminSecurityHandoff, type AdminSecurityPublicState } from "../../lib/admin-login-security-ui/model.ts";
import styles from "./AdminLoginSecurityConsole.module.css";
function dateLabel(value: string): string { return new Date(value).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }); }
export function AdminLoginSecurityConsole({ authorityOrigin, panelOrigin, freshLoginUrl, returnMessage, client: suppliedClient, submitHandoff = submitAdminSecurityHandoff }: Readonly<{
  authorityOrigin: string;
  panelOrigin?: string;
  freshLoginUrl?: string;
  returnMessage?: "device_unavailable"|"fresh_login_required";
  client?: AdminSecurityClient;
  submitHandoff?: (handoff:AdminSecurityHandoff) => void;
}>) {
  const client = useMemo(() => suppliedClient ?? createAdminSecurityClient({ authorityOrigin, panelOrigin }), [suppliedClient, authorityOrigin, panelOrigin]);
  const [state, setState] = useState<AdminSecurityPublicState | null>(null);
  const [error, setError] = useState<string | null>(()=>returnMessage==="device_unavailable"||returnMessage==="fresh_login_required"?securityErrorMessage(returnMessage):null);
  const [restartAction,setRestartAction]=useState<{action:string;body:{purpose:"change_phone"|"manage"}}|null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const mounted = useRef(true);
  const pending = useRef(false);
  const readPromise = useRef<Promise<AdminSecurityPublicState> | null>(null);
  const requestKey = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => {
    let active = true; mounted.current = true;
    readPromise.current ??= client.state();
    void readPromise.current.then(next => { if (active) setState(next); }).catch(failure => { if (active) setError(securityErrorMessage(failure instanceof AdminSecurityUiError ? failure.code : "unavailable")); });
    return () => { active = false; mounted.current = false; };
  }, [client]);
  async function reload() {
    if (pending.current) return;
    pending.current = true; setBusy("read"); setError(null);
    try { const next = await client.state(); if (mounted.current) setState(next); }
    catch { if (mounted.current) setError(securityErrorMessage("unavailable")); }
    finally { pending.current = false; if (mounted.current) setBusy(null); }
  }
  async function run(action: string, body: {deviceId?:string;currentDevice?:boolean} | {purpose:"change_phone"|"manage"}) {
    if (pending.current) return;
    pending.current = true; setBusy(action); setError(null); setStatus(null);setRestartAction(null);
    const fingerprint = JSON.stringify([action,body]);
    if (requestKey.current?.fingerprint !== fingerprint) requestKey.current = { fingerprint, key: crypto.randomUUID() };
    try {
      if ("purpose" in body) {
        const handoff = await client.start(body, requestKey.current.key);
        const safe = safeSecurityHandoff(handoff, panelOrigin ?? window.location.origin, "start");
        if (mounted.current) submitHandoff(safe);
      } else {
        const next = await client.forget(body, requestKey.current.key);
        if (mounted.current) {
          if ("transfer" in next) submitHandoff(safeSecurityHandoff(next,panelOrigin??window.location.origin,"forget"));
          else {setState(next);setStatus("Cihaz hatırlaması kaldırıldı.");}
        }
      }
      requestKey.current = null;
    } catch (failure) { if (mounted.current) {
      setError(securityErrorMessage(failure instanceof AdminSecurityUiError ? failure.code : "unavailable"));
      if("purpose" in body&&failure instanceof AdminSecurityUiError&&failure.code==="management_restart_required")setRestartAction({action,body});
    } }
    finally { pending.current = false; if (mounted.current) setBusy(null); }
  }
  function enrollmentLoginUrl(){if(freshLoginUrl)return freshLoginUrl;const url=new URL("/auth/login",panelOrigin??window.location.origin);url.searchParams.set("destination",window.location.hostname);return url.href;}
  return <section className={styles.console} aria-labelledby="admin-security-heading" aria-busy={!!busy}>
    <h2 id="admin-security-heading" className={styles.srOnly}>Giriş güvenliği</h2>
    {!state && !error ? <p role="status">Güvenlik bilgileri yükleniyor…</p> : null}
    {state ? <>
      <section className={styles.section} aria-labelledby="admin-security-phone-heading">
        <div className={styles.sectionHead}><ShieldCheck size={20} aria-hidden="true" /><h3 id="admin-security-phone-heading">WhatsApp doğrulaması</h3><span className={styles.state}>{state.enabled ? state.maskedPhone ? "Açık" : "Doğrulanmadı" : "Kapalı"}</span></div>
        <p>{state.maskedPhone ?? "Telefon numarası henüz doğrulanmadı."}</p>
        {state.enabled ? <div className={styles.actions}>{state.maskedPhone ? <button type="button" className="button button-primary" data-change-phone disabled={!!busy || !!restartAction} onClick={() => void run("phone", { purpose: "change_phone" })}>Telefon numarasını değiştir</button> : <a className="button button-primary" data-enroll-login href={enrollmentLoginUrl()}>Telefonu doğrulamak için giriş yap</a>}</div> : <p className={styles.hint}>Giriş güvenliği, bu mağaza için etkinleştirildiğinde kullanılabilir.</p>}
      </section>
      <section className={styles.section} aria-labelledby="admin-security-backup-heading">
        <h3 id="admin-security-backup-heading">Yedek kodlar</h3><p>{state.backupCodesRemaining} yedek kod kullanılabilir</p>
        <p className={styles.hint}>Yeni kodlar oluşturmak için şifren ve mevcut doğrulaman istenir. Önceki kodlar geçersiz olur.</p>
        <div className={styles.actions}><button type="button" className="button button-secondary" data-regenerate-backups disabled={!!busy || !!restartAction || !state.enabled || !state.maskedPhone} onClick={() => void run("backups", { purpose: "manage" })}>Yeni yedek kodlar oluştur</button></div>
      </section>
      <section className={styles.section} aria-labelledby="admin-security-devices-heading">
        <h3 id="admin-security-devices-heading">Hatırlanan cihazlar</h3>
        <p className={styles.hint}>Hatırlamayı kaldırınca cihazın sonraki girişinde doğrulama istenir.</p>
        <div className={styles.actions}>
          <button type="button" className="button button-secondary" data-forget-current disabled={!!busy} onClick={() => void run("current", { currentDevice: true })}>Bu cihazı unut</button>
          <button type="button" className="button button-text" data-forget-all disabled={!!busy || !state.trustedDevices.length} onClick={() => void run("all", {})}>Tüm cihazları unut</button>
        </div>
        {!state.trustedDevices.length ? <p className={styles.empty}>Hatırlanan cihaz yok.</p> : <ul className={styles.devices} aria-label="Hatırlanan cihazlar">{state.trustedDevices.map((device, index) => <li key={device.deviceId}>
          <div><h4>Cihaz {index + 1}</h4><dl><div><dt>Hatırlandı</dt><dd><time dateTime={device.createdAt}>{dateLabel(device.createdAt)}</time></dd></div><div><dt>Sona erer</dt><dd><time dateTime={device.expiresAt}>{dateLabel(device.expiresAt)}</time></dd></div></dl></div>
          <button type="button" className="button button-text" data-forget-device disabled={!!busy} aria-label={`Cihaz ${index + 1} hatırlamasını kaldır`} onClick={() => void run(`device:${device.deviceId}`, { deviceId: device.deviceId })}>Unut</button>
        </li>)}</ul>}
      </section>
    </> : null}
    {restartAction ? <button type="button" className="button button-primary" data-restart-management disabled={!!busy} onClick={()=>{const restart=restartAction;requestKey.current=null;void run(restart.action,restart.body);}}>Giriş adımını yeniden başlat</button> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {status ? <p role="status" className={styles.status}>{status}</p> : null}
    {!state && error ? <button type="button" data-security-retry className="button button-primary" disabled={!!busy} onClick={() => void reload()}>Tekrar dene</button> : null}
  </section>;
}
