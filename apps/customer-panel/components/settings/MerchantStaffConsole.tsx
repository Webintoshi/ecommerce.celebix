'use client';
import { CommercialFeatureLink } from "@/components/commercial-packages/CommercialFeatureLink";

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createMerchantStaffClient, type MerchantStaffClient } from '../../lib/merchant-staff-ui/client.ts';
import { MerchantStaffError, STAFF_ROLES, STAFF_ROLE_LABELS, staffErrorMessage, staffName, staffPhone, type MerchantStaff, type MerchantStaffState, type StaffRole } from '../../lib/merchant-staff-ui/model.ts';
import styles from './MerchantStaffConsole.module.css';
import { CashierSalesPermissions, type CashierSalesPermissionsClient } from './CashierSalesPermissions';
type Edit = Readonly<{
    mode: 'create' | 'update' | 'revoke' | 'delete';
    staff?: MerchantStaff;
    expectedVersion: number;
    existingMembershipId?: string;
}>;
export function MerchantStaffConsole({ client: provided, salesClient, cashierAvailable = true }: Readonly<{
    cashierAvailable?: boolean;
    client?: MerchantStaffClient;
    salesClient?: CashierSalesPermissionsClient;
}>) {
    const client = useMemo(() => provided ?? createMerchantStaffClient(), [provided]);
    const [state, setState] = useState<MerchantStaffState | null>(null), [edit, setEdit] = useState<Edit | null>(null), [phone, setPhone] = useState(''), [name, setName] = useState(''), [role, setRole] = useState<StaffRole>('editor'), [error, setError] = useState<string | null>(null), [errorCode, setErrorCode] = useState<string | null>(null), [busy, setBusy] = useState(false), [status, setStatus] = useState<string | null>(null), [conflictReloaded, setConflictReloaded] = useState(false);
    const dialog = useRef<HTMLDialogElement>(null), pending = useRef(false), mounted = useRef(false), readPromise = useRef<Promise<MerchantStaffState> | null>(null), requestKey = useRef<{
        fingerprint: string;
        operationId: string;
    } | null>(null), trigger = useRef<HTMLElement | null>(null), titleId = useId();
    const deleteUnavailable = edit?.mode === 'delete' && state?.staff.find(row => row.staffId === edit.staff?.staffId)?.enabled !== false;
    const [salesMembershipId, setSalesMembershipId] = useState<string | null>(null);
    const salesStaff = state?.staff.find(row => row.membershipId === salesMembershipId);
    useEffect(() => { let active = true; mounted.current = true; readPromise.current ??= client.state(); void readPromise.current.then(value => { if (active)
        setState(value); }).catch(() => { if (active)
        setError(staffErrorMessage('unavailable')); }); return () => { active = false; mounted.current = false; }; }, [client]);
    useEffect(() => { if (edit)
        dialog.current?.showModal();
    else
        dialog.current?.close(); }, [edit]);
    function open(next: Edit) { if (pending.current)
        return; trigger.current = document.activeElement as HTMLElement; setEdit(next); setPhone(''); setName(next.staff?.displayName ?? ''); setRole(next.staff?.role ?? 'editor'); setError(null); setErrorCode(null); setStatus(null); setConflictReloaded(false); requestKey.current = null; }
    function close() { if (pending.current)
        return; setEdit(null); setError(null); setErrorCode(null); queueMicrotask(() => trigger.current?.focus()); }
    async function reload() { if (pending.current)
        return; pending.current = true; setBusy(true); try {
        const value = await client.state();
        if (mounted.current) {
            setState(value);
            setError(null);
            setConflictReloaded(errorCode === 'version_conflict');
        }
    }
    catch {
        if (mounted.current)
            setError(staffErrorMessage('unavailable'));
    }
    finally {
        pending.current = false;
        if (mounted.current)
            setBusy(false);
    } }
    function useCurrentVersion() { if (!edit || !state || !conflictReloaded || deleteUnavailable)
        return; const version = edit.mode === 'create' ? state.version : state.staff.find(row => row.staffId === edit.staff?.staffId)?.version; if (version === undefined)
        return; setEdit({ ...edit, expectedVersion: version }); requestKey.current = null; setError(null); setErrorCode(null); }
    async function save(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!edit || !state?.enabled || pending.current || deleteUnavailable)
            return;
        if (!cashierAvailable && role === "cashier" && (edit.mode === "create" || edit.mode === "update")) { setError("Kasiyer için indirimli paketi inceleyebilirsiniz."); return; }
        let body: Record<string, unknown>;
        try {
            body = edit.mode === 'revoke' || edit.mode === 'delete' ? { expectedVersion: edit.expectedVersion } : edit.mode === 'create' ? { phone: staffPhone(phone), displayName: staffName(name), role, expectedVersion: edit.expectedVersion, ...(edit.existingMembershipId ? { existingMembershipId: edit.existingMembershipId } : {}) } : { displayName: staffName(name), role, expectedVersion: edit.expectedVersion };
        }
        catch (error) {
            setError(staffErrorMessage(error instanceof MerchantStaffError ? error.code : 'invalid_input'));
            return;
        }
        const fingerprint = JSON.stringify([edit.mode, edit.staff?.staffId, body]);
        if (requestKey.current?.fingerprint !== fingerprint)
            requestKey.current = { fingerprint, operationId: crypto.randomUUID() };
        const operationId = requestKey.current.operationId;
        pending.current = true;
        setBusy(true);
        setError(null);
        setErrorCode(null);
        try {
            const value = edit.mode === 'create' ? await client.create({ ...body, operationId } as Parameters<MerchantStaffClient['create']>[0]) : edit.mode === 'update' ? await client.update(edit.staff!.staffId, { ...body, operationId } as Parameters<MerchantStaffClient['update']>[1]) : edit.mode === 'delete' ? await client.delete(edit.staff!.staffId, { operationId, expectedVersion: edit.expectedVersion }) : await client.revoke(edit.staff!.staffId, { operationId, expectedVersion: edit.expectedVersion });
            if (mounted.current) {
                setState(value);
                setEdit(null);
                setStatus(edit.mode === 'delete' ? 'Personel kaydı silindi.' : edit.mode === 'revoke' ? 'Personelin mağaza erişimi kaldırıldı.' : 'Personel bilgileri kaydedildi.');
                requestKey.current = null;
                queueMicrotask(() => { if (trigger.current?.isConnected) trigger.current.focus(); else dialog.current?.parentElement?.querySelector<HTMLButtonElement>('[data-add-staff]')?.focus(); });
            }
        }
        catch (error) {
            if (mounted.current) {
                const code = error instanceof MerchantStaffError ? error.code : 'unavailable';
                setErrorCode(code);
                setConflictReloaded(false);
                setError(staffErrorMessage(code));
            }
        }
        finally {
            pending.current = false;
            if (mounted.current)
                setBusy(false);
        }
    }
    function keyboard(event: React.KeyboardEvent<HTMLDialogElement>) { if (event.key !== 'Tab')
        return; const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]')), first = controls[0], last = controls.at(-1); if (first && last && (event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
    } }
    return <section className={styles.console}>
  <header className={styles.header}><div><h1>Personel</h1><p>Mağaza erişimi için kişisel telefon numarası ve rol tanımlayın.</p></div>{state?.enabled ? <button type="button" className={styles.primary} data-add-staff disabled={busy} onClick={() => open({ mode: 'create', expectedVersion: state.version })}>Personel ekle</button> : !state && !error ? <span className={styles.actionPlaceholder} aria-hidden="true" /> : null}</header>
  <div className={styles.toolbar}><p>{state ? `${state.staff.filter(row => row.enabled).length} personel erişimi açık` : error ? 'Personel listesi' : 'Personel bilgileri yükleniyor…'}</p><button type="button" className={styles.secondary} disabled={busy} onClick={() => void reload()}>Listeyi yenile</button></div>
  {state && !state.enabled && <p className={styles.note} role="status">Personel yönetimi bu mağazada henüz etkin değil.</p>}
  {error && !edit && <p className={styles.error} role="alert">{error}</p>}{status && <p className={styles.note} role="status">{status}</p>}
  {!state && !error && <div role="status" aria-label="Personel bilgileri yükleniyor…" className={styles.listLoading}><span className={styles.srOnly}>Personel bilgileri yükleniyor…</span>{[0,1,2].map(index=><div key={index} aria-hidden="true"><span/><span/><span/><span/></div>)}</div>}
  {state?.staff.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Personel</th><th>Telefon</th><th>Rol</th><th>Durum</th><th><span className={styles.srOnly}>İşlemler</span></th></tr></thead><tbody>{state.staff.map(row => <tr key={row.staffId}><td data-label="Personel"><strong>{row.displayName}</strong></td><td data-label="Telefon">{row.phoneMasked || 'Telefon bağlanmadı'}</td><td data-label="Rol">{STAFF_ROLE_LABELS[row.role]}</td><td data-label="Durum">{!row.enabled ? 'Erişim kapalı' : row.phoneVerified ? 'Etkin' : 'Telefon doğrulaması bekleniyor'}</td><td className={styles.rowActions}>{state.enabled && <><button type="button" className={styles.secondary} data-edit-staff disabled={busy} onClick={() => open({ mode: 'update', staff: row, expectedVersion: row.version })}>Düzenle</button>{cashierAvailable && row.enabled && row.role === 'cashier' && row.membershipId ? <button type="button" className={styles.secondary} data-sales-permissions disabled={busy} onClick={() => { setStatus(null); setSalesMembershipId(row.membershipId!); }}>Satış yetkileri</button> : null}{row.enabled && <button type="button" className={styles.secondary} data-revoke-staff disabled={busy} onClick={() => open({ mode: 'revoke', staff: row, expectedVersion: row.version })}>Erişimi kaldır</button>}{row.enabled === false && <button type="button" className={styles.secondary} data-delete-staff disabled={busy} onClick={() => open({ mode: 'delete', staff: row, expectedVersion: row.version })}>Sil</button>}</>}</td></tr>)}</tbody></table></div> : state && <div className={styles.empty}><h2>Personel kaydı yok</h2><p>Telefon numarası, ad ve rol girerek mağaza erişimi oluşturabilirsiniz.</p></div>}
  {cashierAvailable && salesMembershipId ? <CashierSalesPermissions key={salesMembershipId} membershipId={salesMembershipId} staff={salesStaff} active={state?.enabled === true} client={salesClient} onClose={() => setSalesMembershipId(null)} onSaved={() => { setSalesMembershipId(null); setStatus('Satış yetkileri kaydedildi.'); }}/> : null}
  <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onKeyDown={keyboard} onCancel={event => { event.preventDefault(); close(); }}>
   {edit && <form onSubmit={event => void save(event)} className={styles.form}>
    <header className={styles.dialogHeader}><h2 id={titleId}>{edit.mode === 'delete' ? 'Personeli sil' : edit.mode === 'revoke' ? 'Personel erişimini kaldır' : edit.mode === 'update' ? 'Personeli düzenle' : edit.existingMembershipId ? 'Personelin telefonunu tanımla' : 'Personel ekle'}</h2><button type="button" className={styles.secondary} disabled={busy} onClick={close} aria-label="Pencereyi kapat">Kapat</button></header>
    {edit.mode === 'delete' ? <p className={styles.note}>{edit.staff?.displayName} adlı personel listeden silinsin mi? Geçmiş işlemler korunur.</p> : edit.mode === 'revoke' ? <p className={styles.note}>{edit.staff?.displayName} adlı kişinin mağaza yönetimine erişimi kaldırılır.</p> : <>
     <label className={styles.field}><span>Ad soyad</span><input autoFocus name="displayName" autoComplete="name" maxLength={100} required disabled={busy} value={name} onChange={event => setName(event.target.value)}/></label>
     {edit.mode === 'create' ? <label className={styles.field}><span>Kişisel telefon numarası</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={64} required disabled={busy} value={phone} onChange={event => setPhone(event.target.value)} placeholder="0555 111 22 33"/><small>Personel ilk girişinde bu numarayı WhatsApp koduyla doğrular.</small></label> : <p className={styles.note}>Telefon: {edit.staff?.phoneMasked || 'Tanımlanmadı'}</p>}
     <label className={styles.field}><span>Rol</span><select name="role" value={role} disabled={busy} onChange={event => setRole(event.target.value as StaffRole)}>{STAFF_ROLES.map(value => <option key={value} value={value} disabled={value === "cashier" && !cashierAvailable}>{STAFF_ROLE_LABELS[value]}</option>)}</select></label>
    </>}
    {!cashierAvailable && edit.mode !== "revoke" && edit.mode !== "delete" ? <CommercialFeatureLink capability="cashier"/> : null}
    {error && <div role="alert" className={styles.error}>{error}</div>}
    {errorCode === 'version_conflict' && <div className={styles.conflict}><button className={styles.secondary} type="button" disabled={busy} onClick={() => void reload()}>Güncel listeyi yükle</button><button className={styles.secondary} type="button" disabled={busy || !conflictReloaded || deleteUnavailable} onClick={useCurrentVersion}>Güncel sürümü kullan</button></div>}
    <footer className={styles.dialogFooter}><button type="button" className={styles.secondary} disabled={busy} onClick={close}>Vazgeç</button><button className={styles.primary} type="submit" disabled={busy || errorCode === 'version_conflict' || deleteUnavailable}>{busy ? edit.mode === 'delete' ? 'Siliniyor…' : 'Kaydediliyor…' : edit.mode === 'delete' ? 'Sil' : edit.mode === 'revoke' ? 'Erişimi kaldır' : 'Kaydet'}</button></footer>
   </form>}
  </dialog>
 </section>;
}
