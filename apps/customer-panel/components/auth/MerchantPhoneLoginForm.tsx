'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createMerchantPhoneLoginClient, MERCHANT_COMPLETE_PATH, merchantLoginMessage, MerchantPhoneLoginError, normalizeMerchantPhone, type MerchantPhoneLoginClient, type MerchantPhoneLoginState } from './merchant-phone-login-client.ts';
import styles from './MerchantPhoneLoginForm.module.css';
function seconds(value: string | null | undefined, now: number) { return value ? Math.max(0, Math.ceil((Date.parse(value) - now) / 1000)) : 0; }
export function MerchantPhoneLoginForm({ client: provided, clock = Date.now, completionMessage = 'Mağaza erişiminiz hazırlanıyor…', navigate = (path: string) => window.location.assign(path) }: Readonly<{
    client?: MerchantPhoneLoginClient;
    clock?: () => number;
    navigate?: (path: string) => void;
    completionMessage?: string;
}>) {
    const client = useMemo(() => provided ?? createMerchantPhoneLoginClient(), [provided]);
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
            body = action === 'start' ? { phone: normalizeMerchantPhone(phone) } : action === 'resend' ? {} : { code };
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
    return <div className={styles.form} aria-busy={busy}>
  <p className={styles.note}>{verifying ? `${state.maskedPhone ?? 'Telefonunuza'} gönderilen 6 haneli WhatsApp kodunu girin.` : 'Kişisel telefon numaranızla devam edin. Giriş kodunuz WhatsApp üzerinden gönderilecek.'}</p>
  <form onSubmit={event => { event.preventDefault(); void run(verifying ? 'verify' : 'start'); }} className={styles.fields}>
   {verifying ? <label className={styles.field}><span>Doğrulama kodu</span><input ref={input} name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} aria-describedby="merchant-login-feedback" className={styles.code} placeholder="000000" required/></label> : <label className={styles.field}><span>Kişisel telefon numarası</span><input ref={input} name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={64} value={phone} onChange={event => setPhone(event.target.value)} disabled={busy} aria-describedby="merchant-login-feedback" placeholder="0555 111 22 33" required/></label>}
   <button className={styles.primary} type="submit" disabled={busy || (!verifying && wait > 0) || (verifying && (code.length !== 6 || expired))}>{busy ? 'Lütfen bekleyin…' : verifying ? 'Doğrula ve devam et' : wait > 0 ? `Yeni kod için ${wait} sn` : 'WhatsApp kodu gönder'}</button>
  </form>
  {verifying && <div className={styles.actions}><button type="button" data-resend className={styles.secondary} disabled={busy || wait > 0} onClick={() => void run('resend')}>{wait > 0 ? `Tekrar gönder (${wait} sn)` : 'Kodu tekrar gönder'}</button><button type="button" data-change-phone className={styles.text} disabled={busy} onClick={changePhone}>Telefonu değiştir</button></div>}
  <div id="merchant-login-feedback">{expired && !error && <p className={styles.error} role="alert">Kodun süresi doldu. Yeni kod isteyin.</p>}{error && <p className={styles.error} role="alert">{error}</p>}</div>
  {errorCode && ['delivery_uncertain', 'operation_uncertain'].includes(errorCode) && <button className={styles.secondary} type="button" disabled={busy} onClick={() => void read()}>Durumu kontrol et</button>}
 </div>;
}
