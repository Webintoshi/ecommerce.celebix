"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ShieldCheck, Download } from "lucide-react";
import { createAdminLoginClient, type AdminLoginClient } from "../../lib/admin-login-security-ui/client.ts";
import { AdminSecurityUiError, normalizeCode, normalizePhone, secondsUntil, securityErrorMessage, validPhone, type AdminLoginPublicState } from "../../lib/admin-login-security-ui/model.ts";
import styles from "./AdminWhatsAppVerification.module.css";

const COMPLETE_PATH = "/auth/admin-login/complete";
const browserNavigate = (url: string) => window.location.assign(url);
function expiredLogin(error:unknown):boolean{return error instanceof AdminSecurityUiError&&["fresh_login_required","pending_expired","unauthorized"].includes(error.code);}
function publicError(error: unknown): string { return securityErrorMessage(error instanceof AdminSecurityUiError ? error.code : "unavailable"); }

export function AdminWhatsAppVerification({ initialState, restartUrl="/login", client: suppliedClient, navigate = browserNavigate }: Readonly<{
  initialState?: AdminLoginPublicState;
  restartUrl?:string;
  client?: AdminLoginClient;
  navigate?: (url: string) => void;
}>) {
  const client = useMemo(() => suppliedClient ?? createAdminLoginClient(), [suppliedClient]);
  const [state, setState] = useState<AdminLoginPublicState | null>(initialState ?? null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restartRequired,setRestartRequired]=useState(false);
  const [checkStatus, setCheckStatus] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const pending = useRef(false);
  const requestKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const readPromise = useRef<Promise<AdminLoginPublicState> | null>(null);
  const resumePromise = useRef<Promise<AdminLoginPublicState> | null>(null);
  const navigated = useRef(false);
  const mounted = useRef(true);
  const formInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    const load = async () => {
      try {
        readPromise.current ??= initialState ? Promise.resolve(initialState) : client.state();
        let next = await readPromise.current;
        if (active) setState(next);
        if (next.enrolled && next.phase === "code" && next.challengeId === null) {
          resumePromise.current ??= client.resume(crypto.randomUUID());
          if (active) setBusy("resume");
          next = await resumePromise.current;
          if (active) setState(next);
        }
      } catch (failure) { if (active) {setError(publicError(failure));setRestartRequired(expiredLogin(failure));} }
      finally { if (active) setBusy(null); }
    };
    void load();
    return () => { active = false; mounted.current = false; };
  }, [client, initialState]);

  useEffect(() => {
    if (state?.phase === "complete" && !navigated.current) { navigated.current = true; navigate(COMPLETE_PATH); }
  }, [state?.phase, navigate]);
  useEffect(() => {
    if (state?.phase !== "code" && !state?.resendAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state?.phase, state?.resendAt]);
  useEffect(() => { formInput.current?.focus(); }, [state?.phase, recovery]);

  async function run(action: string, body: unknown, operation: (key: string) => Promise<AdminLoginPublicState>) {
    if (pending.current || busy) return;
    pending.current = true;
    setBusy(action); setError(null);setCheckStatus(false);
    const fingerprint = JSON.stringify([action, state?.phase, state?.challengeId, body]);
    if (requestKey.current?.fingerprint !== fingerprint) requestKey.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const next = await operation(requestKey.current.key);
      if (mounted.current) { setState(next); setNow(Date.now()); setRecovery(false); setSaved(false); requestKey.current = null; }
    } catch (failure) { if (mounted.current) {setError(publicError(failure));setRestartRequired(expiredLogin(failure));setCheckStatus(failure instanceof AdminSecurityUiError&&(failure.code==="delivery_uncertain"||failure.code==="operation_uncertain"));} }
    finally { pending.current = false; if (mounted.current) setBusy(null); }
  }
  function changed() { requestKey.current = null; setError(null); }
  async function retryRead() {
    if (pending.current) return;
    pending.current = true; setBusy("state"); setError(null);
    try { const next = await client.state(); if (mounted.current) {
      setState(next);setNow(Date.now());setCheckStatus(false);
      // A manual read settles the previous send. The next explicit send is a
      // new request; uncertain verification/recovery keeps its original key.
      if (requestKey.current?.fingerprint.startsWith('["send",')) requestKey.current = null;
    } }
    catch (failure) { if (mounted.current) {setError(publicError(failure));setRestartRequired(expiredLogin(failure));} }
    finally { pending.current = false; if (mounted.current) setBusy(null); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!state || busy || pending.current) return;
    if (recovery) {
      if (!backupCode.trim()) { setError("Kullanılmamış bir yedek kod girin."); return; }
      const body = { backupCode: backupCode.trim() };
      void run("recover", body, key => client.recover(body, key));
    } else if (state.phase === "phone" || state.phase === "new_phone") {
      if (secondsUntil(state.resendAt, now) > 0) return;
      if (!validPhone(phone)) { setError(securityErrorMessage("invalid_phone")); return; }
      const body = { phone: normalizePhone(phone) };
      void run("send", body, key => client.send(body, key));
    } else {
      if (code.length !== 6) { setError("6 haneli doğrulama kodunu girin."); return; }
      if (!state.challengeId || (state.expiresAt && secondsUntil(state.expiresAt, now) === 0)) { setError(securityErrorMessage("challenge_expired")); return; }
      const body = { code, rememberDevice: state.purpose === "login" && rememberDevice };
      void run("verify", body, key => client.verify(body, key));
    }
  }
  function downloadCodes() {
    if (!state?.backupCodes) return;
    const url = URL.createObjectURL(new Blob(["Celebix yedek giriş kodları\nHer kod yalnızca bir kez kullanılabilir.\n\n" + state.backupCodes.join("\n")], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "celebix-yedek-kodlar.txt"; link.click(); URL.revokeObjectURL(url);
  }
  const enrollment = state?.phase === "phone" || state?.phase === "new_phone";
  const resendSeconds = secondsUntil(state?.resendAt ?? null, now);
  const expiresSeconds = secondsUntil(state?.expiresAt ?? null, now);
  const completeLabel = state?.purpose === "login" ? "Panele geç" : "Güvenliğe dön";

  return <main className={`tenant-login-page ${styles.page}`}>
    <header className="tenant-login-header"><img src="/Logo/celebix-koyu-logo.svg" width={200} height={88} alt="Celebix" /></header>
    <section className={`tenant-login-entry ${styles.entry}`} aria-labelledby="admin-verification-name">
      <div className={`tenant-login-content ${styles.content}`}>
        <div className={styles.identity}><ShieldCheck size={28} aria-hidden="true" /><h1 id="admin-verification-name">{state?.displayName ?? "Güvenli giriş"}</h1><p>WhatsApp doğrulaması</p></div>
        <div className={styles.task} aria-busy={!!busy}>
          {!state && !error ? <p role="status">Giriş bilgileri yükleniyor…</p> : null}
          {state?.phase === "complete" ? <p role="status">Doğrulandı. Devam ediliyor…</p> : null}
          {state?.phase === "backup_codes" ? <>
            <h2>Yedek kodlarını kaydet</h2>
            {state.backupCodes ? <>
              <p>Telefonuna erişemediğinde her kodu bir kez kullanabilirsin.</p>
              <ul className={styles.codes} aria-label="Yedek giriş kodları">{state.backupCodes.map(value => <li data-backup-code key={value}><code>{value}</code></li>)}</ul>
              <button type="button" className="button button-secondary" data-download-backups onClick={downloadCodes}><Download size={16} aria-hidden="true" /> Kodları indir</button>
              <label className={styles.checkbox}><input name="savedBackupCodes" type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} />Kodları güvenli bir yere kaydettim</label>
            </> : <p>Yedek kodlar yalnızca oluşturulduğunda gösterilir. Güvenlik ayarlarından yeni kodlar oluşturabilirsin.</p>}
            <button type="button" className="button button-primary" data-complete disabled={!!state.backupCodes && !saved} onClick={() => { if (!navigated.current) { navigated.current = true; navigate(COMPLETE_PATH); } }}>{completeLabel}</button>
          </> : null}
          {state && !restartRequired && (enrollment || state.phase === "code") ? <>
            <h2>{recovery ? "Yedek kodla doğrula" : enrollment ? state.phase === "new_phone" ? "Yeni telefon numaran" : "Telefon numaranı doğrula" : "WhatsApp kodunu gir"}</h2>
            <p>{recovery ? "Kullanılmamış bir yedek kod gir." : enrollment ? "WhatsApp kullandığın numarayı ülke koduyla gir." : `${state.maskedPhone ?? "Kayıtlı numarana"} için gönderilen 6 haneli kod.`}</p>
            <form onSubmit={submit} noValidate className={styles.form}>
              {recovery ? <label htmlFor="admin-backup-code">Yedek kod<input id="admin-backup-code" name="backupCode" ref={formInput} value={backupCode} onChange={event => { changed(); setBackupCode(event.target.value); }} disabled={!!busy} autoComplete="off" maxLength={80} spellCheck={false} aria-invalid={!!error} aria-describedby={error ? "admin-verification-error" : undefined} /></label>
                : enrollment ? <label htmlFor="admin-phone">Telefon numarası<input id="admin-phone" name="phone" ref={formInput} type="tel" inputMode="tel" autoComplete="tel" placeholder="+90 532 123 45 67" value={phone} onChange={event => { changed(); setPhone(event.target.value); }} disabled={!!busy} maxLength={32} aria-invalid={!!error} aria-describedby={error ? "admin-verification-error" : undefined} /></label>
                : <label htmlFor="admin-code">Doğrulama kodu<input id="admin-code" name="code" ref={formInput} className={styles.code} type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => { changed(); setCode(normalizeCode(event.target.value)); }} disabled={!!busy} aria-invalid={!!error} aria-describedby={error ? "admin-verification-error" : "admin-code-expiry"} /></label>}
              {!enrollment && !recovery && state.expiresAt ? <p id="admin-code-expiry" className={styles.hint}>{expiresSeconds > 0 ? `Kod ${Math.floor(expiresSeconds / 60)}:${String(expiresSeconds % 60).padStart(2,"0")} sonra sona erer.` : "Kodun süresi doldu. Yeni kod iste."}</p> : null}
              {!enrollment && !recovery && state.purpose === "login" ? <label className={styles.checkbox}><input name="rememberDevice" type="checkbox" checked={rememberDevice} disabled={!!busy} onChange={event => { changed(); setRememberDevice(event.target.checked); }} />Bu cihazı 30 gün hatırla</label> : null}
              <button type="submit" className="button button-primary" disabled={!!busy || !!enrollment && !recovery && resendSeconds > 0}>{busy ? "İşlem sürüyor…" : enrollment && !recovery ? resendSeconds > 0 ? `Tekrar gönder · ${resendSeconds} sn` : "WhatsApp kodu gönder" : "Doğrula"}</button>
            </form>
            {!enrollment && !recovery ? <button type="button" className="button button-text" data-resend disabled={!!busy || resendSeconds > 0} onClick={() => void run("send", {}, key => client.send({}, key))}>{resendSeconds > 0 ? `Tekrar gönder · ${resendSeconds} sn` : "Kodu tekrar gönder"}</button> : null}
            {state.enrolled ? <button type="button" className="button button-text" data-use-backup disabled={!!busy} onClick={() => { changed(); setRecovery(!recovery); }}>{recovery ? "WhatsApp koduna dön" : "Yedek kod kullan"}</button> : null}
          </> : null}
          {error ? <p id="admin-verification-error" className={styles.error} role="alert">{error}</p> : null}
          {checkStatus ? <button type="button" className="button button-secondary" data-check-status disabled={!!busy} onClick={() => void retryRead()}>Durumu kontrol et</button> : null}
          {restartRequired ? <a className="button button-primary" data-restart-login href={restartUrl}>Girişi yeniden başlat</a> : null}
          {!state && error && !restartRequired ? <button className="button button-primary" type="button" disabled={!!busy} onClick={() => void retryRead()}>Tekrar dene</button> : null}
        </div>
        <p className={`tenant-login-trust ${styles.trust}`}><ShieldCheck size={18} aria-hidden="true" /><span>Güvenli, mağazaya özel erişim</span></p>
      </div>
    </section>
    <div className={`tenant-login-artwork ${styles.artwork}`} aria-hidden="true"><img className="tenant-login-illustration" src="/illustrations/login-helper-960.webp" srcSet="/illustrations/login-helper-480.webp 480w, /illustrations/login-helper-960.webp 960w, /illustrations/login-helper-1393.webp 1393w" sizes="(max-width: 760px) 100vw, calc(56vw + 128px)" width={1393} height={1129} alt="" decoding="async" /></div>
  </main>;
}
