'use client';
import { Children, cloneElement, isValidElement, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode, type FormEvent } from 'react';
import { createMerchantSignupClient, MerchantSignupError, signupMessage, signupPhone, type MerchantSignupClient, type MerchantSignupState } from './merchant-signup-client.ts';
import { PHONE_COUNTRIES, composePhoneNumber, splitPhoneNumber } from '../../../storefront-shared/lib/checkout-phone.ts';
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
    const [country, setCountry] = useState(PHONE_COUNTRIES[0]!);
    const [detailsComplete,setDetailsComplete]=useState(false);
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
    useEffect(() => { if (state?.phase === 'code' && !busy) focus.current?.focus(); }, [state?.phase,busy]);
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
            body = action === 'start' ? { phone: signupPhone(composePhoneNumber(country.country,phone)) } : action === 'resend' ? {} : { code };
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
                if(action === 'start') setDetailsComplete(true);
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
        return; setState(value => value ? { ...value, phase: 'phone', expiresAt: undefined } : null); setDetailsComplete(false); setError(null); setErrorCode(null); attempt.current = null; }
    const verifying = state?.phase === 'code', verified = state?.phase === 'verified';
    const original = Children.toArray(children.props.children);
    const fields = original.filter(child => !(isValidElement(child) && child.type === 'button'));
    const names=fields.filter(child=>isValidElement<Record<string,unknown>>(child) && child.props['data-signup-name-fields'] !== undefined);
    const business=fields.filter(child=>!names.includes(child));
    return cloneElement(children, { onSubmit: submit, ref: form }, <>
  <fieldset className="signup-fields" hidden={verifying && detailsComplete} disabled={!enabled || busy}>
   {names}
   {!verified && !verifying && <div className="signup-phone-field">
    <label htmlFor="signup-phone">Telefon numaranız</label>
    <div className="signup-phone-control">
     <div className="signup-country">
      <span aria-hidden="true" className="signup-flag">{country.flag}</span><svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      <select aria-label="Telefon ülke kodu" autoComplete="country" value={country.country} onChange={event=>setCountry(PHONE_COUNTRIES.find(item=>item.country===event.target.value)!)}>
       {PHONE_COUNTRIES.map(item=><option key={item.country} value={item.country}>{item.flag} {item.name} {item.dialCode}</option>)}
      </select>
     </div>
     <span className="signup-dial" aria-hidden="true">{country.dialCode}</span>
     <input ref={focus} id="signup-phone" data-signup-phone type="tel" inputMode="tel" autoComplete="tel-national" maxLength={64} required value={phone} onChange={event=>{const value=event.target.value;if(/^\s*(?:\+|00)/u.test(value)){const parsed=splitPhoneNumber(value,country.country);setCountry(parsed.country);setPhone(parsed.nationalNumber);}else setPhone(value);}} placeholder={country.country==='TR'?'555 111 22 33':'Telefon numaranız'} aria-describedby="self-serve-registration-state"/>
    </div>
   </div>}
   {business}
  </fieldset>
  {verifying && <div className="signup-verification">
   <div className="signup-code-intro"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.3 3 7.5 7.5 9.5 4.5-2 7.5-5.2 7.5-9.5V6L12 3Z" stroke="currentColor" strokeWidth="1.3"/><path d="m8.5 12 2.3 2.3 4.7-4.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg><p>{state.maskedPhone ?? 'Telefonunuza'} gönderilen 6 haneli WhatsApp kodunu girin.</p></div>
   <label htmlFor="signup-code"><span>Doğrulama kodu</span><input ref={focus} id="signup-code" data-signup-code type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,'').slice(0,6))} disabled={busy} placeholder="000000" aria-invalid={errorCode==='invalid_code'||undefined} aria-describedby={error?'signup-error':undefined}/></label>
  </div>}
  <input type="hidden" name="operationId" value={registrationOperation} readOnly/>
  <button className="signup-submit" type="submit" disabled={!enabled || busy || !state || (!verifying && !verified && wait > 0) || (verifying && (code.length !== 6 || expired))} aria-busy={busy}>
   <span>{busy?'Lütfen bekleyin…':verified?'Mağazamı kur':verifying?'Doğrula ve mağazamı aç':wait>0?`Yeni kod için ${wait} sn`:'Devam et'}</span><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h16m-7-7 7 7-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </button>
  {!verifying && !verified && <p className="signup-helper" id="self-serve-registration-state">Doğrulama kodunuz WhatsApp’a gönderilecek.</p>}
  {verified && <p className="signup-helper" id="self-serve-registration-state" role="status">Mağazanız hazırlanıyor…</p>}
  {verifying && <div className="signup-recovery" id="self-serve-registration-state"><button type="button" data-signup-resend disabled={busy || wait>0} onClick={()=>void run('resend')}>{wait>0?`Tekrar gönder (${wait} sn)`:'Kodu tekrar gönder'}</button><button type="button" disabled={busy} onClick={changePhone}>Telefonu değiştir</button></div>}
  {!state && !error && enabled && <p className="signup-helper" role="status">Telefon doğrulaması hazırlanıyor…</p>}
  {expired && !error && <p className="signup-error" role="alert">Kodun süresi doldu. Yeni kod isteyin.</p>}
  {error && <p className="signup-error" id="signup-error" role="alert">{error}</p>}
  {((!state && error) || errorCode==='delivery_uncertain' || errorCode==='operation_uncertain') && <button className="signup-text-button" type="button" data-signup-read disabled={busy} onClick={()=>void read()}>Durumu kontrol et</button>}
 </>);
}
