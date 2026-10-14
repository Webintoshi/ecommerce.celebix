'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createMerchantPhoneLoginClient, MERCHANT_COMPLETE_PATH, merchantLoginMessage, MerchantPhoneLoginError, normalizeMerchantPhone, type MerchantPhoneLoginClient, type MerchantPhoneLoginState } from './merchant-phone-login-client.ts';
import { PHONE_COUNTRIES, composePhoneNumber, splitPhoneNumber } from '../../../storefront-shared/lib/checkout-phone.ts';
import styles from './MerchantPhoneLoginForm.module.css';
function seconds(value: string | null | undefined, now: number) { return value ? Math.max(0, Math.ceil((Date.parse(value) - now) / 1000)) : 0; }
export function MerchantPhoneLoginForm({ client: provided, clock = Date.now, completionMessage = 'Mağaza erişiminiz hazırlanıyor…', navigate = (path: string) => window.location.assign(path), inline = false }: Readonly<{
    client?: MerchantPhoneLoginClient;
    clock?: () => number;
    navigate?: (path: string) => void;
    completionMessage?: string;
    inline?: boolean;
}>) {
    const client = useMemo(() => provided ?? createMerchantPhoneLoginClient(), [provided]);
    const [country, setCountry] = useState(PHONE_COUNTRIES[0]!);
    const [state, setState] = useState<MerchantPhoneLoginState | Readonly<{
        phase: 'complete';
    }> | null>(null), [phone, setPhone] = useState(''), [code, setCode] = useState(''), [error, setError] = useState<string | null>(null), [errorCode, setErrorCode] = useState<string | null>(null), [busy, setBusy] = useState(false), [now, setNow] = useState(clock), [retryAt, setRetryAt] = useState<number | null>(null);
    const input = useRef<HTMLInputElement>(null), pending = useRef(false), mounted = useRef(false), initial = useRef<Promise<MerchantPhoneLoginState> | null>(null), attempt = useRef<{
        fingerprint: string;
        operationId: string;
    } | null>(null), completed = useRef(false);
    useEffect(() => { let active = true; mounted.current = true; initial.current ??= client.state(); void initial.current.then(value => { if (active)
        setState(value); }).catch(() => { if (active) {
        setError(merchantLoginMessage('unavailable'));
        setErrorCode('unavailable');
    } }); return () => { active = false; mounted.current = false; }; }, [client]);
    useEffect(() => { if (state?.phase === 'complete' && !completed.current) {
        completed.current = true;
        navigate(MERCHANT_COMPLETE_PATH);
    } }, [state?.phase, navigate]);
    useEffect(() => { if (state && !busy)
        input.current?.focus(); }, [state?.phase, busy]);
    useEffect(() => { if (!state || state.phase === 'complete')
        return; const update = () => setNow(clock()); update(); const timer = window.setInterval(update, 1000); document.addEventListener('visibilitychange', update); return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update); }; }, [state?.phase, clock]);
    const wait = Math.max(retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0, seconds(state && 'resendAt' in state ? state.resendAt : undefined, now)), expired = state?.phase === 'code' && state.expiresAt !== undefined && seconds(state.expiresAt, now) === 0;
    function fail(error: unknown) { const code = error instanceof MerchantPhoneLoginError ? error.code : 'unavailable'; setErrorCode(code); setError(merchantLoginMessage(code)); if (error instanceof MerchantPhoneLoginError && error.retryAfterSeconds) {
        setNow(clock());
        setRetryAt(clock() + error.retryAfterSeconds * 1000);
    } }
    async function read() { if (pending.current)
        return; pending.current = true; setBusy(true); setError(null); try {
        const value = await client.state();
        if (mounted.current) {
            setState(value);
            setErrorCode(null);
        }
    }
    catch (error) {
        if (mounted.current)
            fail(error);
    }
    finally {
        pending.current = false;
        if (mounted.current)
            setBusy(false);
    } }
    async function run(action: 'start' | 'resend' | 'verify') {
        if (!state || state.phase === 'complete' || pending.current || ((action === 'start' || action === 'resend') && wait > 0))
            return;
        let body: {
            phone: string;
        } | {
            code: string;
        } | Record<string, never>;
        try {
            body = action === 'start' ? { phone: normalizeMerchantPhone(inline ? composePhoneNumber(country.country, phone) : phone) } : action === 'resend' ? {} : { code };
            if (action === 'verify' && (!/^[0-9]{6}$/.test(code) || expired))
                throw new MerchantPhoneLoginError(expired ? 'challenge_expired' : 'invalid_code');
        }
        catch (error) {
            fail(error);
            return;
        }
        const fingerprint = JSON.stringify([action, body, state.phase, state.expiresAt]);
        if (attempt.current?.fingerprint !== fingerprint)
            attempt.current = { fingerprint, operationId: crypto.randomUUID() };
        pending.current = true;
        setBusy(true);
        setError(null);
        setErrorCode(null);
        try {
            const value = action === 'start' ? await client.start({ ...body as {
                    phone: string;
                }, operationId: attempt.current.operationId }) : action === 'resend' ? await client.resend({ operationId: attempt.current.operationId }) : await client.verify({ ...body as {
                    code: string;
                }, operationId: attempt.current.operationId });
            if (mounted.current) {
                setState(value);
                setRetryAt(null);
                if (action === 'start' || action === 'resend')
                    setNow(clock());
                attempt.current = null;
            }
        }
        catch (error) {
            if (mounted.current)
                fail(error);
        }
        finally {
            pending.current = false;
            if (mounted.current)
                setBusy(false);
        }
    }
    function changePhone() { if (pending.current)
        return; setState(value => value ? { ...value, phase: 'phone' as const, expiresAt: undefined } : null); setError(null); setErrorCode(null); attempt.current = null; }
    if (state?.phase === 'complete')
        return <p className={styles.note} role="status">{completionMessage}</p>;
    if (!state)
        return <div className={styles.form}>{error ? <><p role="alert" className={styles.error}>{error}</p><button type="button" className={styles.secondary} disabled={busy} onClick={() => void read()}>Yeniden dene</button></> : <p role="status" className={styles.note}>Giriş hazırlanıyor…</p>}</div>;
    const verifying = state.phase === 'code';
    const internationalEntry = phone.startsWith('+');
    const submitLabel = busy ? 'Lütfen bekleyin…' : verifying ? 'Doğrula ve devam et' : wait > 0 ? `Yeni kod için ${wait} sn` : 'WhatsApp kodu gönder';
    return <div className={`${styles.form} ${inline ? styles.inline : ''}`} aria-busy={busy}>
  {verifying ? <p className={styles.note}>{state.maskedPhone ?? 'Telefonunuza'} gönderilen 6 haneli WhatsApp kodunu girin.</p> : inline ? <p id="merchant-login-transport" className={styles.srOnly}>Giriş kodunuz WhatsApp üzerinden gönderilecek.</p> : <p className={styles.note}>Kişisel telefon numaranızla devam edin. Giriş kodunuz WhatsApp üzerinden gönderilecek.</p>}
  <form onSubmit={event => { event.preventDefault(); void run(verifying ? 'verify' : 'start'); }} className={styles.fields}>
   {inline ? <div className={styles.phoneFrame} data-invalid={errorCode === (verifying ? 'invalid_code' : 'invalid_phone') || verifying && expired ? 'true' : undefined}>
    {verifying ? <input ref={input} name="code" type="text" inputMode="numeric" autoComplete="one-time-code" aria-label="Doğrulama kodu" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} aria-invalid={errorCode === 'invalid_code' || expired || undefined} aria-describedby="merchant-login-feedback" className={`${styles.phoneNumber} ${styles.code}`} placeholder="000000" required/> : <>
     <div className={styles.country}>
      <span className={styles.countryVisual} aria-hidden="true"><span className={styles.flag}>{!internationalEntry && country.country === 'TR' ? <svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#E30A17" /><circle cx="13" cy="16" r="8" fill="white" /><circle cx="15.3" cy="16" r="6.5" fill="#E30A17" /><path d="m23 10 1.4 4.2h4.4l-3.6 2.6 1.4 4.2-3.6-2.6-3.6 2.6 1.4-4.2-3.6-2.6h4.4Z" fill="white" /></svg> : internationalEntry ? '🌐' : country.flag}</span><svg viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4" /></svg></span>
      <select aria-label="Telefon ülke kodu" title={`${country.name} (${country.dialCode})`} value={internationalEntry ? 'international' : country.country} disabled={busy} onChange={event => {
       const next = PHONE_COUNTRIES.find(item => item.country === event.currentTarget.value);
       if (!next) return;
       setCountry(next); if (internationalEntry) setPhone('');
      }}>
       {internationalEntry ? <option value="international" disabled>🌐 Uluslararası</option> : null}
       {PHONE_COUNTRIES.map(item => <option key={item.country} value={item.country}>{item.flag} {item.dialCode} {item.name}</option>)}
      </select>
     </div>
     {!internationalEntry ? <span className={styles.dialCode} aria-hidden="true">{country.dialCode}</span> : null}
     <input ref={input} name="phone" type="tel" autoComplete="tel-national" inputMode="tel" aria-label="Telefon numarası" maxLength={64} value={phone} onChange={event => {
      const value = event.currentTarget.value;
      if (value.startsWith('+') || value.startsWith('00')) { const split = splitPhoneNumber(value, country.country); setCountry(split.country); setPhone(split.nationalNumber); }
      else setPhone(value);
     }} disabled={busy} aria-invalid={errorCode === 'invalid_phone' || undefined} aria-describedby="merchant-login-transport merchant-login-feedback" className={styles.phoneNumber} placeholder={country.country === 'TR' ? '555 111 22 33' : 'Telefon numarası'} required/>
    </>}
    <button className={styles.send} type="submit" aria-label={submitLabel} title={submitLabel} disabled={busy || (!verifying && wait > 0) || (verifying && (code.length !== 6 || expired))}>
     {busy ? <svg className={styles.spinner} aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" /></svg> : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M4 12h16m-7-7 7 7-7 7" /></svg>}
    </button>
   </div> : <>
    {verifying ? <label className={styles.field}><span>Doğrulama kodu</span><input ref={input} name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} aria-describedby="merchant-login-feedback" className={styles.code} placeholder="000000" required /></label> : <label className={styles.field}><span>Kişisel telefon numarası</span><input ref={input} name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={64} value={phone} onChange={event => setPhone(event.target.value)} disabled={busy} aria-describedby="merchant-login-feedback" placeholder="0555 111 22 33" required /></label>}
    <button className={styles.primary} type="submit" disabled={busy || (!verifying && wait > 0) || (verifying && (code.length !== 6 || expired))}>{submitLabel}</button>
   </>}
   {!verifying && wait > 0 ? <p className={styles.note} role="status">Yeni kod için {wait} sn bekleyin.</p> : null}
  </form>
  {verifying && <div className={styles.actions}><button type="button" data-resend className={styles.secondary} disabled={busy || wait > 0} onClick={() => void run('resend')}>{wait > 0 ? `Tekrar gönder (${wait} sn)` : 'Kodu tekrar gönder'}</button><button type="button" data-change-phone className={styles.text} disabled={busy} onClick={changePhone}>{['fresh_login_required', 'phone_conflict', 'not_ready'].includes(errorCode ?? '') ? 'Girişi yeniden başlat' : 'Telefonu değiştir'}</button></div>}
  <div id="merchant-login-feedback" className={styles.feedback}>{expired && !error && <p className={styles.error} role="alert">Kodun süresi doldu. Yeni kod isteyin.</p>}{error && <p className={styles.error} role="alert">{error}</p>}</div>
  {errorCode && ['delivery_uncertain', 'operation_uncertain'].includes(errorCode) && <button className={styles.secondary} type="button" disabled={busy} onClick={() => void read()}>Durumu kontrol et</button>}
 </div>;
}
