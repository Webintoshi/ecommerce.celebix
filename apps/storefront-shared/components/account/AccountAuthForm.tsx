"use client";

import { useEffect, useRef, useState } from "react";

import { PHONE_COUNTRIES, composePhoneNumber, splitPhoneNumber } from "../../lib/checkout-phone.ts";
import { AccountAuthRequestError, postAccountAuth, startAccountPhoneChallenge } from "./account-auth-client.ts";
import { accountPhoneStartBody, accountRetryDeadline, accountRetryRemaining, maskAccountEmail, maskAccountPhone } from "./account-auth-view-model.ts";
import styles from "./account-auth.module.css";

type AccountAuthFormProps = Readonly<{ mode: "phone" | "email"; returnTo: string }> | Readonly<{ mode: "verify"; returnTo: string; ticket: string }>;

function ActionArrow() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}

function AccountSignInForm({ phoneEnabled, returnTo }: Readonly<{ phoneEnabled: boolean; returnTo: string }>) {
  const [channel, setChannel] = useState<"phone" | "email">(phoneEnabled ? "phone" : "email");
  const [country, setCountry] = useState(PHONE_COUNTRIES[0]!);
  const [nationalNumber, setNationalNumber] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const requestPending = useRef(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const emailConfirmationRef = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef<"phone" | "email" | null>(null);
  const phone = composePhoneNumber(country.country, nationalNumber);
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
    if (sent && channel === "phone" && !busy) codeRef.current?.focus();
    else if (sent && channel === "email" && !busy) emailConfirmationRef.current?.focus();
    else if (focusNext.current) {
      const target = focusNext.current === "phone" ? phoneRef : emailRef;
      target.current?.focus();
      focusNext.current = null;
    }
  }, [sent, channel, busy]);

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
      const payload = channel === "phone"
        ? await startAccountPhoneChallenge(accountPhoneStartBody({ phone, returnTo }))
        : await postAccountAuth("/api/account/auth/start", { email, returnTo });
      setSent(true);
      if (channel === "phone" && !sent) setCode("");
      cooldown(payload.retryAfterSeconds ?? 60);
      setStatus(channel === "phone" ? "Doğrulama kodu WhatsApp üzerinden gönderildi." : "Bağlantı gönderildi.");
    } catch (error) { showError(error); }
    finally { requestPending.current = false; setBusy(false); }
  }

  async function verifyPhone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestPending.current || code.length !== 6) return;
    requestPending.current = true;
    setBusy(true); setStatus("");
    try {
      const payload = await postAccountAuth("/api/account/auth/verify", { code, returnTo });
      window.location.assign(payload.destination);
    } catch (error) { showError(error); requestPending.current = false; setBusy(false); }
  }

  function changeChannel(next: "phone" | "email") {
    focusNext.current = next;
    setChannel(next); setSent(false); setCode(""); setStatus("");
  }

  if (channel === "email") {
    if (sent) return <div className={`${styles.form} ${styles.sent}`} aria-busy={busy}>
      <span className={styles.confirmation} aria-hidden="true">✓</span>
      <div className={styles.stepIntro}><h1 ref={emailConfirmationRef} tabIndex={-1}>E-postanı kontrol et</h1><p>{maskAccountEmail(email)}</p></div>
      <form method="post" onSubmit={send}><button className={styles.secondaryButton} type="submit" disabled={busy || retry > 0}>{busy ? "Gönderiliyor…" : retry > 0 ? `Tekrar gönder (${retry})` : "Tekrar gönder"}</button></form>
      <button className={styles.textButton} type="button" disabled={busy} onClick={() => { focusNext.current = "email"; setSent(false); setStatus(""); }}>E-postayı değiştir</button>
      {phoneEnabled ? <button className={styles.textButton} type="button" disabled={busy} onClick={() => changeChannel("phone")}>WhatsApp ile devam et</button> : null}
      <p className={styles.status} role="status" aria-live="polite">{status}</p>
    </div>;
    return <form className={styles.form} method="post" onSubmit={send} aria-busy={busy}>
      <div className={styles.stepIntro}><h1>E-posta ile giriş</h1><p>Giriş bağlantını e-postana gönderelim.</p></div>
      <label className={styles.field}><span>E-posta</span><input ref={emailRef} className={styles.input} type="email" autoComplete="email" inputMode="email" required disabled={busy} value={email} onChange={(event) => setEmail(event.currentTarget.value)} placeholder="ornek@eposta.com" /></label>
      <button className={styles.primaryButton} type="submit" disabled={busy || retry > 0}>{busy ? "Gönderiliyor…" : "Bağlantı gönder"}</button>
      {retry > 0 ? <p className={styles.status}>Tekrar göndermek için {retry} sn bekleyin.</p> : null}
      {phoneEnabled ? <button className={styles.textButton} type="button" disabled={busy} onClick={() => changeChannel("phone")}>WhatsApp ile devam et</button> : null}
      <p className={styles.status} role="status" aria-live="polite">{status}</p>
    </form>;
  }

  if (sent) return <div className={`${styles.form} ${styles.phoneVerify}`} aria-busy={busy}>
    <div className={styles.stepIntro}><h1>WhatsApp kodunu gir</h1><p>{maskAccountPhone(phone)} numarasına gönderilen 6 haneli kodu gir.</p></div>
    <form className={styles.form} method="post" onSubmit={verifyPhone}>
      <label className={styles.field}><span>Doğrulama kodu</span><input ref={codeRef} className={`${styles.input} ${styles.codeInput}`} name="code" type="text" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required disabled={busy} value={code} onChange={(event) => setCode(event.currentTarget.value.replace(/\D/gu, "").slice(0, 6))} placeholder="000000" aria-describedby="account-code-help" /></label>
      <p className={styles.transport} id="account-code-help">Kodu mesajdan yapıştırabilir veya otomatik doldurabilirsiniz.</p>
      <button className={styles.primaryButton} type="submit" disabled={busy || code.length !== 6}>{busy ? "Doğrulanıyor…" : "Doğrula ve devam et"}</button>
    </form>
    <form method="post" onSubmit={send}><button className={styles.secondaryButton} type="submit" disabled={busy || retry > 0}>{busy ? "Lütfen bekleyin…" : retry > 0 ? `Tekrar gönder (${retry} sn)` : "Tekrar gönder"}</button></form>
    <button className={styles.textButton} type="button" data-auth-change="phone" disabled={busy} onClick={() => { focusNext.current = "phone"; setSent(false); setStatus(""); }}>Telefonu değiştir</button>
    <p className={styles.status} role="status" aria-live="polite">{status}</p>
  </div>;

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
    <div className={styles.divider} aria-hidden="true"><span>veya</span></div>
    <button className={styles.emailAlternative} type="button" disabled={busy} onClick={() => changeChannel("email")}>E-posta ile giriş yap</button>
    <p className={styles.status} role="status" aria-live="polite">{status}</p>
  </form>;
}

function EmailTicketVerify({ returnTo, ticket }: Readonly<{ returnTo: string; ticket: string }>) {
  const [code, setCode] = useState("");
  return <div className={`${styles.form} ${styles.verify}`}>
    <div className={styles.stepIntro}><h1>Girişi onayla</h1><p>Hesabına devam etmek için girişini onayla.</p></div>
    {ticket ? <form method="post" action="/api/account/auth/verify-browser">
      <input type="hidden" name="ticket" value={ticket} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button className={styles.primaryButton} type="submit">Devam et</button>
    </form> : null}
    <details open={!ticket}>
      <summary>Kod ile giriş</summary>
      <form method="post" action="/api/account/auth/verify-browser" noValidate>
        <input type="hidden" name="returnTo" value={returnTo} />
        <label className={styles.field}><span>6 haneli kod</span><input className={styles.input} name="code" type="text" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.currentTarget.value.replace(/\D/gu, "").slice(0, 6))} placeholder="000000" /></label>
        <button className={styles.secondaryButton} type="submit" disabled={code.length !== 6}>Giriş yap</button>
      </form>
    </details>
  </div>;
}

export function AccountAuthForm(props: AccountAuthFormProps) {
  return props.mode === "verify" ? <EmailTicketVerify returnTo={props.returnTo} ticket={props.ticket} /> : <AccountSignInForm phoneEnabled={props.mode === "phone"} returnTo={props.returnTo} />;
}
