'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MerchantPhoneLoginForm } from '../auth/MerchantPhoneLoginForm.tsx';
import { createMerchantPhoneBindingClient, MerchantPhoneLoginError, merchantLoginMessage, type MerchantPhoneBindingClient, type MerchantPhoneBindingState, type MerchantPhoneLoginClient } from '../auth/merchant-phone-login-client.ts';
import styles from './PhoneSecurityConsole.module.css';
export function PhoneSecurityConsole({ client: provided, clock, navigate }: Readonly<{
    client?: MerchantPhoneBindingClient;
    clock?: () => number;
    navigate?: (path: string) => void;
}>) {
    const client = useMemo(() => provided ?? createMerchantPhoneBindingClient(), [provided]);
    const [state, setState] = useState<MerchantPhoneBindingState | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
    const initial = useRef<Promise<MerchantPhoneBindingState> | null>(null), mounted = useRef(false), pending = useRef(false), formClient = useRef<MerchantPhoneLoginClient | null>(null);
    function accept(value: MerchantPhoneBindingState) { setState(value); setError(null); let first = true; formClient.current = { ...client, state: async () => { if (first) {
            first = false;
            return value;
        } return client.state(); } }; }
    useEffect(() => { let active = true; mounted.current = true; initial.current ??= client.selfState(); void initial.current.then(value => { if (active)
        accept(value); }).catch(failure => { if (active)
        setError(merchantLoginMessage(failure instanceof MerchantPhoneLoginError ? failure.code : 'unavailable')); }); return () => { active = false; mounted.current = false; }; }, [client]);
    async function read() { if (pending.current)
        return; pending.current = true; setBusy(true); try {
        const value = await client.selfState();
        if (mounted.current)
            accept(value);
    }
    catch (failure) {
        if (mounted.current)
            setError(merchantLoginMessage(failure instanceof MerchantPhoneLoginError ? failure.code : 'unavailable'));
    }
    finally {
        pending.current = false;
        if (mounted.current)
            setBusy(false);
    } }
    return <section className={styles.console} aria-labelledby="personal-phone-heading">
  <header><h1 id="personal-phone-heading">Kişisel giriş telefonu</h1><p>Mağaza yönetimine kişisel WhatsApp numaranızla giriş yapın.</p></header>
  {state?.phoneVerified ? <div className={styles.status}><h2>Doğrulandı</h2><p>{state.phoneMasked}</p><p>Bu numara kişisel girişiniz için doğrulandı.</p><p>Numaranıza erişemiyorsanız hesap kurtarma için Celebix desteğine başvurun.</p></div> : state && formClient.current ? <div className={styles.setup}><p>Mağazanızın iletişim telefonu yerine kendi numaranızı doğrulayın.</p><MerchantPhoneLoginForm client={formClient.current} clock={clock} navigate={navigate} completionMessage="Telefonunuz doğrulandı. Güvenlik ekranına dönülüyor…"/></div> : null}
  {!state && !error ? <p role="status">Telefon bilgileri yükleniyor…</p> : null}
  {error ? <><p role="alert" className={styles.error}>{error}</p><button type="button" className="button button-primary" disabled={busy} onClick={() => void read()}>Yeniden dene</button></> : null}
 </section>;
}
