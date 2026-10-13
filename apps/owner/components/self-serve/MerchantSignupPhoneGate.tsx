'use client';
import { Children, cloneElement, isValidElement, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode, type FormEvent } from 'react';
import { createMerchantSignupClient, MerchantSignupError, signupMessage, signupPhone, type MerchantSignupClient, type MerchantSignupState } from './merchant-signup-client.ts';
type RegistrationFormProps = {
    children: ReactNode;
    onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
    ref?: React.Ref<HTMLFormElement>;
};
function seconds(value: string | undefined, now: number) { return value ? Math.max(0, Math.ceil((Date.parse(value) - now) / 1000)) : 0; }
export function MerchantSignupPhoneGate({ enabled, children, client: provided, clock = Date.now, submitRegistration = (form: HTMLFormElement) => HTMLFormElement.prototype.submit.call(form) }: Readonly<{
    enabled: boolean;
    children: ReactElement<RegistrationFormProps>;
    client?: MerchantSignupClient;
    clock?: () => number;
    submitRegistration?: (form: HTMLFormElement) => void;
}>) {
    const client = useMemo(() => provided ?? createMerchantSignupClient(), [provided]);
    const [state, setState] = useState<MerchantSignupState | Readonly<{
        phase: 'verified';
    }> | null>(enabled ? null : { phase: 'phone' }), [phone, setPhone] = useState(''), [code, setCode] = useState(''), [error, setError] = useState<string | null>(null), [errorCode, setErrorCode] = useState<string | null>(null), [busy, setBusy] = useState(false), [now, setNow] = useState(clock), [retryAt, setRetryAt] = useState<number | null>(null), [registrationOperation, setRegistrationOperation] = useState('');
    const form = useRef<HTMLFormElement>(null), focus = useRef<HTMLInputElement>(null), mounted = useRef(false), pending = useRef(false), initial = useRef<Promise<MerchantSignupState> | null>(null), attempt = useRef<{
        fingerprint: string;
        operationId: string;
    } | null>(null), submitted = useRef(false);
    function fail(failure: unknown) { const code = failure instanceof MerchantSignupError ? failure.code : 'unavailable'; setErrorCode(code); setError(signupMessage(code)); if (failure instanceof MerchantSignupError && failure.retryAfterSeconds) {
        setNow(clock());
        setRetryAt(clock() + failure.retryAfterSeconds * 1000);
    } }
    useEffect(() => { let active = true; mounted.current = true; if (enabled) {
        initial.current ??= client.state();
        void initial.current.then(value => { if (active)
            setState(value); }).catch(failure => { if (active)
            fail(failure); });
    } return () => { active = false; mounted.current = false; }; }, [client, enabled]);
    useEffect(() => { if (state && state.phase !== 'verified' && !busy)
        focus.current?.focus(); }, [state?.phase, busy]);
    useEffect(() => { if (!enabled || !state || state.phase === 'verified')
        return; const update = () => setNow(clock()); update(); const timer = window.setInterval(update, 1000); document.addEventListener('visibilitychange', update); return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update); }; }, [enabled, state?.phase, clock]);
    function register() { if (!form.current || !registrationOperation)
        return; try {
        submitRegistration(form.current);
    }
    catch {
        setError('Mağaza formu gönderilemedi. Bilgileriniz korunuyor; yeniden deneyin.');
    } }
    useEffect(() => { if (state?.phase === 'verified' && registrationOperation && !submitted.current) {
        submitted.current = true;
        register();
    } }, [state?.phase, registrationOperation]);
    const wait = Math.max(retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0, seconds(state && 'resendAt' in state ? state.resendAt : undefined, now)), expired = state?.phase === 'code' && state.expiresAt !== undefined && seconds(state.expiresAt, now) === 0;
    async function read() { if (!enabled || pending.current)
        return; pending.current = true; setBusy(true); setError(null); try {
        const value = await client.state();
        if (mounted.current) {
            setState(value);
            setErrorCode(null);
        }
    }
    catch (failure) {
        if (mounted.current)
            fail(failure);
    }
    finally {
        pending.current = false;
        if (mounted.current)
            setBusy(false);
    } }
    async function run(action: 'start' | 'resend' | 'verify') {
        if (!enabled || !state || state.phase === 'verified' || pending.current || ((action === 'start' || action === 'resend') && wait > 0))
            return;
        let body: Record<string, string>;
        try {
            body = action === 'start' ? { phone: signupPhone(phone) } : action === 'resend' ? {} : { code };
            if (action === 'verify' && (!/^[0-9]{6}$/.test(code) || expired))
                throw new MerchantSignupError(expired ? 'challenge_expired' : 'invalid_code');
        }
        catch (failure) {
            fail(failure);
            return;
        }
        const fingerprint = JSON.stringify([action, body, state.phase, state.expiresAt]);
        if (attempt.current?.fingerprint !== fingerprint)
            attempt.current = { fingerprint, operationId: crypto.randomUUID() };
        const operationId = attempt.current.operationId;
        pending.current = true;
        setBusy(true);
        setError(null);
        setErrorCode(null);
        try {
            const value = action === 'start' ? await client.start({ phone: body.phone!, operationId }) : action === 'resend' ? await client.resend({ operationId }) : await client.verify({ code: body.code!, operationId });
            if (mounted.current) {
                if (value.phase === 'verified')
                    setRegistrationOperation(previous => previous || crypto.randomUUID());
                setState(value);
                setRetryAt(null);
                setNow(clock());
                attempt.current = null;
            }
        }
        catch (failure) {
            if (mounted.current)
                fail(failure);
        }
        finally {
            pending.current = false;
            if (mounted.current)
                setBusy(false);
        }
    }
    function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (state?.phase === 'verified')
        register();
    else
        void run(state?.phase === 'code' ? 'verify' : 'start'); }
    function changePhone() { if (pending.current)
        return; setState(value => value ? { ...value, phase: 'phone', expiresAt: undefined } : null); setError(null); setErrorCode(null); attempt.current = null; }
    const verifying = state?.phase === 'code', verified = state?.phase === 'verified';
    const original = Children.toArray(children.props.children);
    const fields = original.filter(child => !(isValidElement(child) && child.type === 'button'));
    return cloneElement(children, { onSubmit: submit, ref: form }, <>
  <div style={{ display: verifying ? 'none' : 'grid', gap: 18, minWidth: 0 }}>
   {!verified && <label><span>Kişisel WhatsApp numaranız</span><input ref={focus} data-signup-phone type="tel" inputMode="tel" autoComplete="tel" maxLength={64} required value={phone} onChange={event => setPhone(event.target.value)} disabled={!enabled || busy} placeholder="0555 111 22 33" style={{ fontSize: 16, minWidth: 0 }}/><span>Bu numara mağaza sahibi girişiniz için doğrulanır.</span></label>}
   {fields}
  </div>
  {verifying && <><p>{state.maskedPhone ?? 'Telefonunuza'} gönderilen 6 haneli WhatsApp kodunu girin.</p><label><span>Doğrulama kodu</span><input ref={focus} data-signup-code type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} style={{ fontSize: 16, minWidth: 0 }} placeholder="000000"/></label></>}
  <input type="hidden" name="operationId" value={registrationOperation} readOnly/>
  <button className="button button-primary self-serve-direct-submit" type="submit" disabled={!enabled || busy || !state || (!verifying && !verified && wait > 0) || (verifying && (code.length !== 6 || expired))} aria-disabled={!enabled || busy || !state}>{busy ? 'Lütfen bekleyin…' : verified ? 'Mağazamı kur' : verifying ? 'Doğrula ve mağazamı kur' : wait > 0 ? `Yeni kod için ${wait} sn` : 'WhatsApp kodu gönder'}</button>
  {verifying && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}><button className="button button-secondary" type="button" data-signup-resend disabled={busy || wait > 0} onClick={() => void run('resend')}>{wait > 0 ? `Tekrar gönder (${wait} sn)` : 'Kodu tekrar gönder'}</button><button className="button button-secondary" type="button" disabled={busy} onClick={changePhone}>Telefonu değiştir</button></div>}
  {!state && !error && enabled && <p role="status">Telefon doğrulaması hazırlanıyor…</p>}
  {expired && !error && <p role="alert">Kodun süresi doldu. Yeni kod isteyin.</p>}{error && <p role="alert">{error}</p>}
  {((!state && error) || errorCode === 'delivery_uncertain' || errorCode === 'operation_uncertain') && <button className="button button-secondary" type="button" data-signup-read disabled={busy} onClick={() => void read()}>Durumu kontrol et</button>}
 </>);
}
