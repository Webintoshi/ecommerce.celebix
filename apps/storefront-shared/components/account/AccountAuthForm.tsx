"use client";

import { useEffect, useRef, useState } from "react";

import { PHONE_COUNTRIES, composePhoneNumber, splitPhoneNumber } from "../../lib/checkout-phone.ts";
import { AccountAuthRequestError, postAccountAuth, startAccountPhoneChallenge } from "./account-auth-client.ts";
import { accountPhoneStartBody, accountRetryDeadline, accountRetryRemaining, maskAccountPhone } from "./account-auth-view-model.ts";
import styles from "./account-auth.module.css";

type AccountAuthFormProps = Readonly<{ mode: "phone" | "unavailable"; returnTo: string }>
  | Readonly<{ mode: "phone-binding"; returnTo: string; initialPhone: string }>
  | Readonly<{ mode: "verify"; returnTo: string; ticket: string }>;

function ActionArrow() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}

function AccountSignInForm({ returnTo, bindingPhone }: Readonly<{ returnTo: string; bindingPhone?: string }>) {
  const [country, setCountry] = useState(PHONE_COUNTRIES[0]!);
  const [nationalNumber, setNationalNumber] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const requestPending = useRef(false);
  const sendOperation=useRef<string|null>(null),verifyOperation=useRef<string|null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const focusNext = useRef<"phone" | null>(null);
  const phone = bindingPhone ?? composePhoneNumber(country.country, nationalNumber);
  const internationalEntry = nationalNumber.startsWith("+");
  const retry = accountRetryRemaining(deadline, now);

  useEffect(() => {
    if (!deadline) return;
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1_000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [deadline]);

  useEffect(() => {
    if (sent && !busy) codeRef.current?.focus();
    else if (focusNext.current) {
      phoneRef.current?.focus();
      focusNext.current = null;
    }
  }, [sent, busy]);

  function cooldown(seconds: number | undefined) {
    const time = Date.now();
    setNow(time);
    setDeadline(accountRetryDeadline(seconds, time));
  }

  function showError(error: unknown) {
    if (error instanceof AccountAuthRequestError && error.retryAfterSeconds !== undefined) cooldown(error.retryAfterSeconds);
    setStatus(error instanceof Error ? error.message : "İşlem tamamlanamadı.");
  }

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestPending.current || accountRetryRemaining(deadline, Date.now()) > 0) return;
    requestPending.current = true;
    setBusy(true); setStatus("");
    try {
      const payload = await startAccountPhoneChallenge({ ...accountPhoneStartBody({ phone, returnTo }),operationId:sendOperation.current??=crypto.randomUUID(), ...(bindingPhone ? { bindPhone: true as const } : {}) });
      sendOperation.current=null;verifyOperation.current=null;
      setSent(true);
      if (!sent) setCode("");
      cooldown(payload.retryAfterSeconds ?? 60);
      setStatus("Doğrulama kodu WhatsApp üzerinden gönderildi.");
    } catch (error) {if(error instanceof AccountAuthRequestError&&error.code==="delivery_uncertain")sendOperation.current=null;showError(error); }
    finally { requestPending.current = false; setBusy(false); }
  }

  async function verifyPhone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestPending.current || code.length !== 6) return;
    requestPending.current = true;
    setBusy(true); setStatus("");
    try {
      const payload = await postAccountAuth("/api/account/auth/verify", { code, returnTo,operationId:verifyOperation.current??=crypto.randomUUID() });
      window.location.assign(payload.destination);
    } catch (error) { showError(error); requestPending.current = false; setBusy(false); }
  }

  if (sent) return <div className={`${styles.form} ${styles.phoneVerify}`} aria-busy={busy}>
    <div className={styles.stepIntro}><h1>WhatsApp kodunu gir</h1><p>{maskAccountPhone(phone)} numarasına gönderilen 6 haneli kodu gir.</p></div>
    <form className={styles.form} method="post" onSubmit={verifyPhone}>
      <label className={styles.field}><span>Doğrulama kodu</span><input ref={codeRef} className={`${styles.input} ${styles.codeInput}`} name="code" type="text" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required disabled={busy} value={code} onChange={(event) => setCode(event.currentTarget.value.replace(/\D/gu, "").slice(0, 6))} placeholder="000000" aria-describedby="account-code-help" /></label>
      <p className={styles.transport} id="account-code-help">Kodu mesajdan yapıştırabilir veya otomatik doldurabilirsiniz.</p>
      <button className={styles.primaryButton} type="submit" disabled={busy || code.length !== 6}>{busy ? "Doğrulanıyor…" : "Doğrula ve devam et"}</button>
    </form>
    <form method="post" onSubmit={send}><button className={styles.secondaryButton} type="submit" disabled={busy || retry > 0}>{busy ? "Lütfen bekleyin…" : retry > 0 ? `Tekrar gönder (${retry} sn)` : "Tekrar gönder"}</button></form>
    {!bindingPhone ? <button className={styles.textButton} type="button" data-auth-change="phone" disabled={busy} onClick={() => { focusNext.current = "phone";sendOperation.current=null;verifyOperation.current=null;setSent(false);setStatus(""); }}>Telefonu değiştir</button> : null}
    <p className={styles.status} role="status" aria-live="polite">{status}</p>
  </div>;

  if (bindingPhone) return <form className={styles.form} method="post" onSubmit={send} aria-busy={busy}>
    <div className={styles.stepIntro}><h1>Telefonunu doğrula</h1><p>Hesabındaki numarayı WhatsApp ile giriş için doğrula.</p></div>
    <label className={styles.field}><span>Telefon numarası</span><input className={styles.input} name="phone" type="tel" autoComplete="tel" readOnly disabled={busy} value={phone} aria-describedby="account-phone-transport" /></label>
    <p className={styles.transport} id="account-phone-transport">Doğrulama kodun bu numaraya WhatsApp üzerinden gönderilecek.</p>
    <button className={styles.primaryButton} type="submit" disabled={busy || retry > 0}>{busy ? "Gönderiliyor…" : "Kod gönder"}</button>
    {retry > 0 ? <p className={styles.status}>Tekrar göndermek için {retry} sn bekleyin.</p> : null}
    <p className={styles.status} role="status" aria-live="polite">{status}</p>
  </form>;

  return <form className={`${styles.form} ${styles.entryForm}`} method="post" onSubmit={send} aria-busy={busy}>
    <div className={styles.stepIntro}><h1 className={styles.welcomeTitle}>HOŞ GELDİN.</h1><p>Telefon numaranla giriş yap veya üye ol.</p></div>
    <div className={styles.field}><label htmlFor="account-phone-number">Telefon numarası</label><div className={styles.phoneFrame}>
      <div className={styles.phoneCountry}>
        <span className={styles.phoneCountryVisual} aria-hidden="true"><span>{internationalEntry ? "🌐" : country.flag}</span><svg viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4" /></svg></span>
        <select aria-label="Telefon ülke kodu" title={`${country.name} (${country.dialCode})`} value={internationalEntry ? "international" : country.country} disabled={busy} onChange={(event) => {
          const next = PHONE_COUNTRIES.find((item) => item.country === event.currentTarget.value);
          if (!next) return;
          setCountry(next); setNationalNumber(internationalEntry ? "" : nationalNumber); setStatus("");
        }}>
          {internationalEntry ? <option value="international" disabled>🌐 Uluslararası</option> : null}
          {PHONE_COUNTRIES.map((item) => <option key={item.country} value={item.country}>{item.flag} {item.dialCode} {item.name}</option>)}
        </select>
      </div>
      {!internationalEntry ? <span className={styles.phoneDialCode} aria-hidden="true">{country.dialCode}</span> : null}
      <input ref={phoneRef} id="account-phone-number" className={styles.phoneNumber} name="phone" type="tel" autoComplete="tel-national" inputMode="tel" required maxLength={30} disabled={busy} value={nationalNumber} onChange={(event) => {
        const next = event.currentTarget.value;
        if (next.startsWith("+") || next.startsWith("00")) { const split = splitPhoneNumber(next, country.country); setCountry(split.country); setNationalNumber(split.nationalNumber); }
        else setNationalNumber(next);
        setStatus("");
      }} placeholder={country.country === "TR" ? "5xx xxx xx xx" : "Telefon numarası"} aria-describedby="account-phone-transport" />
    </div></div>
    <p className={styles.transport} id="account-phone-transport">Giriş kodun WhatsApp’a gönderilecek.</p>
    <button className={styles.primaryButton} type="submit" disabled={busy || retry > 0}><span>{busy ? "Gönderiliyor…" : "KOD GÖNDER"}</span><ActionArrow /></button>
    {retry > 0 ? <p className={styles.status}>Tekrar göndermek için {retry} sn bekleyin.</p> : null}
    <p className={styles.status} role="status" aria-live="polite">{status}</p>
  </form>;
}

export function AccountAuthForm(props: AccountAuthFormProps) {
  if (props.mode === "verify") return <div className={styles.form}><h1>Telefonunla giriş yap</h1><p>E-posta giriş bağlantıları artık kullanılmıyor.</p><a className={styles.primaryButton} href="/account/login">Girişe dön</a></div>;
  if (props.mode === "unavailable") return <div className={styles.form}><h1>Giriş şu anda kullanılamıyor</h1><p>WhatsApp bağlantısı hazır olduğunda telefon numaranızla devam edebilirsiniz.</p></div>;
  if (props.mode === "phone-binding") return <AccountSignInForm returnTo={props.returnTo} bindingPhone={props.initialPhone} />;
  return <AccountSignInForm returnTo={props.returnTo} />;
}
