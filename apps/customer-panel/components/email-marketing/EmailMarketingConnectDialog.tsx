"use client";

import {useEffect, useRef, useState} from 'react';
import type {EmailMarketingAudiencePreview, EmailMarketingConnection, EmailMarketingList, EmailMarketingProvider, EmailMarketingSelection} from '@celebix/saas-contracts';
import {OrderActionDialog} from '@/components/orders/OrderActionDialog';
import type {EmailMarketingApi, EmailMarketingApply, EmailMarketingCandidate} from '@/lib/email-marketing-ui/client';
import {emailMarketingCode, emailMarketingCount, emailMarketingErrorMessage, serviceName} from '@/lib/email-marketing-ui/state';
import styles from './email-marketing.module.css';

export type EmailMarketingAttempt =
  | Readonly<{kind: 'apply'; input: EmailMarketingApply}>
  | Readonly<{kind: 'rotate'; input: {operationId: string; candidateId: string; expectedVersion: number}}>
  | Readonly<{kind: 'disconnect' | 'recheck'; input: {operationId: string; expectedVersion: number}}>;
type Props = Readonly<{
  provider: EmailMarketingProvider; connection?: EmailMarketingConnection; api: EmailMarketingApi;
  providerAvailable?: boolean;
  pending?: EmailMarketingAttempt; onPending(attempt: EmailMarketingAttempt | undefined): void;
  onSaved(connection: EmailMarketingConnection): void; onClose(): void;
}>;

export function EmailMarketingConnectDialog({provider, connection, api, providerAvailable = true, pending, onPending, onSaved, onClose}: Props) {
  const [apiKey, setApiKey] = useState('');
  const [candidate, setCandidate] = useState<EmailMarketingCandidate | null>(null);
  const [listItems, setListItems] = useState<readonly EmailMarketingList[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [selection, setSelection] = useState<EmailMarketingSelection | null>(pending?.kind === 'apply' ? pending.input.selection : null);
  const [preview, setPreview] = useState<EmailMarketingAudiencePreview | null>(null);
  const [error, setError] = useState(pending ? 'outcome_unknown' : '');
  const [busy, setBusy] = useState(false);
  const [renewKey, setRenewKey] = useState(false);
  const [remove, setRemove] = useState(pending?.kind === 'disconnect');
  const guard = useRef(false);
  const alive = useRef(true);
  const discovery = useRef(0);
  const attempt = useRef<EmailMarketingAttempt | undefined>(pending);
  const active = !!connection && connection.status !== 'disconnected';
  const cleanupRecovery = !providerAvailable && connection?.status === 'draining';
  const canValidateKey = providerAvailable || cleanupRecovery;
  const showKey = canValidateKey && !candidate && (!active || renewKey || connection.status === 'needs_reconnect') && !attempt.current;
  const locked = busy || !!attempt.current || !providerAvailable;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; discovery.current++; };
  }, []);
  function close() { if (!guard.current) { setApiKey(''); discovery.current++; onClose(); } }
  function remember(value?: EmailMarketingAttempt) { attempt.current = value; onPending(value); }
  async function loadPreview(value: EmailMarketingSelection, current: EmailMarketingCandidate) {
    if(!providerAvailable)return;
    const ticket = ++discovery.current;
    setPreview(null);
    setError('');
    try {
      const result = await api.preview(current.candidateId, value.kind === 'existing' ? value.listId : undefined);
      if (alive.current && ticket === discovery.current) setPreview(result);
    } catch (caught) { if (alive.current && ticket === discovery.current) setError(emailMarketingCode(caught)); }
  }
  async function validate() {
    if (guard.current || !canValidateKey || !apiKey.trim()) return;
    guard.current = true; setBusy(true); setError('');
    const ticket = ++discovery.current;
    try {
      const result = await api.validate({provider, apiKey: apiKey.trim(), operationId: crypto.randomUUID(),...(cleanupRecovery ? {connectionId:connection.id} : {})});
      if (!alive.current || ticket !== discovery.current) return;
      if (result.provider !== provider) throw {code: 'provider_invalid_response'};
      const page = active ? {items:[] as readonly EmailMarketingList[],nextCursor:undefined} : await api.lists(result.candidateId);
      if (!alive.current || ticket !== discovery.current) return;
      setCandidate(result); setApiKey(''); setListItems(page.items); setNextCursor(page.nextCursor);
      if (selection) void loadPreview(selection, result);
    } catch (caught) { if (alive.current && ticket === discovery.current) setError(emailMarketingCode(caught)); }
    finally { guard.current = false; if (alive.current) setBusy(false); }
  }
  function chooseList(value: string) {
    if (locked) return;
    const chosen: EmailMarketingSelection | null = value === '__create__' ? {kind: 'create', name: 'Celebix'} : value ? {kind: 'existing', listId: value} : null;
    setSelection(chosen); setPreview(null); setError('');
    if (chosen && candidate) void loadPreview(chosen, candidate);
    else discovery.current++;
  }
  async function moreLists() {
    if (!candidate || !nextCursor || guard.current || !providerAvailable) return;
    guard.current = true; setBusy(true); setError('');
    const ticket = ++discovery.current;
    try {
      const page = await api.lists(candidate.candidateId, nextCursor);
      if (!alive.current || ticket !== discovery.current) return;
      setListItems(items => [...new Map([...items, ...page.items].map(item => [item.id, item])).values()]);
      setNextCursor(page.nextCursor);
    } catch (caught) { if (alive.current && ticket === discovery.current) setError(emailMarketingCode(caught)); }
    finally { guard.current = false; if (alive.current) setBusy(false); }
  }
  async function perform(kind: EmailMarketingAttempt['kind']) {
    if (guard.current || !providerAvailable && kind !== 'disconnect' && !(cleanupRecovery && kind === 'rotate')) return;
    let current = attempt.current;
    if (!current) {
      const operationId = crypto.randomUUID(), expectedVersion = connection?.version ?? 0;
      if (kind === 'apply') {
        if (!candidate || !selection || !preview) return;
        current = {kind, input: {operationId, candidateId: candidate.candidateId, expectedVersion, selection}};
      } else if (kind === 'rotate') {
        if (!candidate) return;
        current = {kind, input: {operationId, candidateId: candidate.candidateId, expectedVersion}};
      } else current = {kind, input: {operationId, expectedVersion}};
      remember(current);
    }
    guard.current = true; setBusy(true); setError('');
    try {
      const result = current.kind === 'apply' ? await api.apply(current.input)
        : current.kind === 'rotate' ? await api.rotate(current.input)
        : await api[current.kind](current.input);
      if (!alive.current) return;
      remember(); setApiKey(''); onSaved(result); onClose();
    } catch (caught) {
      if (!alive.current) return;
      const code = emailMarketingCode(caught);
      // Definitive rejection releases this intent. Uncertain responses keep its
      // exact identifier and body, including after closing/reopening the dialog.
      if (['candidate_expired', 'version_conflict', 'operation_conflict', 'invalid_input', 'account_in_use', 'account_mismatch', 'forbidden', 'unauthorized', 'provider_unauthorized', 'provider_forbidden', 'not_configured'].includes(code)) {
        remember();
        if (code === 'candidate_expired' || code === 'provider_unauthorized') setCandidate(null);
      }
      setError(code);
    } finally { guard.current = false; if (alive.current) setBusy(false); }
  }
  const selectedValue = selection?.kind === 'create' ? '__create__' : selection?.kind === 'existing' ? selection.listId : '';
  const applyingKind = attempt.current?.kind ?? (remove ? 'disconnect' : active ? 'rotate' : 'apply');
  const ready = (providerAvailable || applyingKind === 'disconnect' || cleanupRecovery && applyingKind === 'rotate') && (!!attempt.current || remove || (!!candidate && (active || (!!selection && !!preview))));
  return <OrderActionDialog open title={`${serviceName(provider)} bağlantısı`} onClose={close} busy={busy} className={styles.dialog}
    footer={<><button className="button button-secondary" disabled={busy} onClick={close}>Vazgeç</button>
      {ready ? <button className="button button-primary" disabled={busy} onClick={() => void perform(applyingKind)}>{busy ? 'Kontrol ediliyor…' : attempt.current ? 'Tekrar uygula' : 'Uygula'}</button> : null}</>}>
    <div className={styles.form}>
      <p className={styles.hint}>Bağlantı kurmak müşterileri aktarmaz. Bağladıktan sonra Eşitle ile tek seferlik aktarım başlatabilirsiniz.</p>
      {!providerAvailable ? <p className={styles.notice}>{cleanupRecovery ? 'Temizliği tamamlamak için aynı servis hesabına ait yeni API anahtarını kullanabilirsiniz.' : 'Bağlantı hazırlığı sürüyor. Mevcut bağlantıyı kaldırabilirsiniz.'}</p> : null}
      {error ? <p className={styles.notice} role="alert">{emailMarketingErrorMessage(error)}</p> : null}
      {active ? <dl className={styles.details}><dt>Servis hesabı</dt><dd>{connection.accountName ?? 'Bilinmiyor'}</dd><dt>Aktarım listesi</dt><dd>{connection.listName ?? 'Bilinmiyor'}</dd>
        <dt>Gönderici doğrulaması</dt><dd>{connection.senderStatus === 'verified' ? 'Doğrulanmış' : connection.senderStatus === 'pending' ? 'Bekliyor' : 'Bilinmiyor'}</dd></dl> : null}
      {remove ? <p className={styles.notice}>Celebix aktarımı duracak ve yönetilen liste üyelikleri temizlenecek. Serviste önceden planlanmış kampanyalar devam edebilir; onları servis hesabınızdan durdurun.</p> : null}
      {showKey ? <><label className={styles.field}>API anahtarı<input aria-label="API anahtarı" type="password" autoComplete="off" spellCheck={false} maxLength={4096} value={apiKey} disabled={busy} onChange={event => setApiKey(event.target.value)} /></label>
        <p className={styles.hint}>Anahtarı servis hesabınızdan alın. Sunucuda şifrelenir; tarayıcıya kaydedilmez.</p>
        <button className="button button-secondary" disabled={busy || !apiKey.trim()} onClick={() => void validate()}>{busy ? 'Kontrol ediliyor…' : 'Anahtarı kontrol et'}</button></> : null}
      {candidate ? <><dl className={styles.details}><dt>Servis hesabı</dt><dd>{candidate.accountName}</dd></dl>
        {active ? <p className={styles.hint}>Yeni anahtar mevcut hesap ve listeyi koruyarak uygulanacak.</p> : <>
          <label className={styles.field}>Aktarım listesi<select aria-label="Aktarım listesi" disabled={locked} value={selectedValue} onChange={event => chooseList(event.target.value)}>
            <option value="">Liste seçin</option>{(provider === 'brevo' ? [] : listItems).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            {provider !== 'brevo' && selection?.kind === 'existing' && !listItems.some(i => i.id === selection.listId) ? <option value={selection.listId}>Seçiminiz korundu</option> : null}
            <option value="__create__">Yeni liste oluştur</option></select></label>
          {provider !== 'brevo' && nextCursor ? <button className="button button-secondary" disabled={locked} onClick={() => void moreLists()}>Diğer listeleri getir</button> : null}
          {selection?.kind === 'create' ? <label className={styles.field}>Liste adı<input aria-label="Liste adı" maxLength={160} value={selection.name} disabled={locked} onChange={event => setSelection({kind: 'create', name: event.target.value})} /></label> : null}
          {selection && !preview && error ? <button className="button button-secondary" disabled={locked} onClick={() => void loadPreview(selection, candidate)}>Kişi sayısını yeniden kontrol et</button> : null}
        </>}
      </> : null}
      {pending?.kind === 'apply' && !candidate ? <p className={styles.hint}>Kaydedilen liste seçimi korunuyor. Tekrar uygula aynı bağlantı işlemini kontrol eder.</p> : null}
      {preview ? <div className={styles.preview} aria-live="polite"><strong>Aktarılacak müşteriler: {emailMarketingCount(preview.eligible)}</strong>
        <dl className={styles.details}><dt>İzin vermeyen</dt><dd>{emailMarketingCount(preview.denied)}</dd><dt>İzin kanıtı eksik</dt><dd>{emailMarketingCount(preview.missingEvidence)}</dd><dt>İzin yenilemesi gereken</dt><dd>{emailMarketingCount(preview.needsRenewal)}</dd>
          <dt>Serviste engelli kişi</dt><dd>{emailMarketingCount(preview.providerBlocked)}</dd><dt>Paket sınırını aşan</dt><dd>{emailMarketingCount(preview.overLimit)}</dd></dl>
        <p className={styles.notice}>Listeye eklenen müşteriler için servisteki otomasyonlar tetiklenebilir. Eşitlemeden önce karşılama ve diğer otomasyonları servis hesabınızdan kontrol edin.</p>
        <p className={styles.hint}>Yalnızca pazarlama izni kanıtlanan müşteriler aktarılır. Satın alma veya sözleşme onayı pazarlama izni sayılmaz.</p>
        <p className={styles.hint}>Yalnız e-posta, ad ve izin bilgileri aktarılır. Servisin engelleme kayıtları korunur.</p></div> : null}
      {active && !candidate && !showKey && !remove && (!attempt.current || !providerAvailable) && connection.status !== 'draining' ? <div className={styles.actions}>
        {providerAvailable ? <><button className="button button-secondary" disabled={busy} onClick={() => setRenewKey(true)}>API anahtarını değiştir</button>
        <button className="button button-secondary" disabled={busy} onClick={() => void perform('recheck')}>Yeniden kontrol et</button></> : null}
        <button className="button button-secondary" disabled={busy} onClick={() => {if(!providerAvailable && attempt.current?.kind !== 'disconnect')remember();setRemove(true);}}>Bağlantıyı kaldır</button></div> : null}
      {cleanupRecovery && !candidate && !showKey && !attempt.current ? <button className="button button-secondary" disabled={busy} onClick={() => setRenewKey(true)}>Temizlik için API anahtarını yenile</button> : null}
      {connection?.status === 'draining' ? <p className={styles.notice}>Temizlik ve önceki işlemlerin doğrulaması sürüyor. Bu sırada yeni bağlantı kurulamaz.</p> : null}
      {provider === 'brevo' && !active ? <p className={styles.disclosure}>Bu Celebix bağlantısı Brevo tarafından incelenmiş, test edilmiş, onaylanmış veya desteklenmiş değildir. Bağlantıyı kendi sorumluluğunuzla kullanırsınız.</p> : null}
    </div>
  </OrderActionDialog>;
}
