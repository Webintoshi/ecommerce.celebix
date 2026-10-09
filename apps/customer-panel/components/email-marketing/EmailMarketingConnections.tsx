"use client";

import Link from 'next/link';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {EmailMarketingConnection, EmailMarketingOverview, EmailMarketingProvider} from '@celebix/saas-contracts';
import {createEmailMarketingApi, type EmailMarketingApi, type EmailMarketingVersionOperation} from '@/lib/email-marketing-ui/client';
import {EMAIL_SERVICES, emailMarketingCode, emailMarketingCount, emailMarketingDate, emailMarketingErrorMessage, emailMarketingStatus, serviceName} from '@/lib/email-marketing-ui/state';
import {ProviderBrand} from './ProviderBrand';
import {EmailMarketingConnectDialog, type EmailMarketingAttempt} from './EmailMarketingConnectDialog';
import styles from './email-marketing.module.css';

export function EmailMarketingConnections({canManage, configured, api: suppliedApi}: Readonly<{canManage: boolean; configured: boolean; api?: EmailMarketingApi}>) {
  const api = useMemo(() => suppliedApi ?? createEmailMarketingApi(), [suppliedApi]);
  const [overview, setOverview] = useState<EmailMarketingOverview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(configured);
  const [editor, setEditor] = useState<EmailMarketingProvider | null>(null);
  const [syncing, setSyncing] = useState<EmailMarketingProvider | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<Readonly<{provider: EmailMarketingProvider; error?: string; message?: string}> | null>(null);
  const attempts = useRef(new Map<EmailMarketingProvider, EmailMarketingAttempt>());
  const syncAttempts = useRef(new Map<string, EmailMarketingVersionOperation>());
  const syncGuard = useRef(false);
  const alive = useRef(true);
  const loadTicket = useRef(0);
  async function load() {
    const ticket = ++loadTicket.current;
    setLoading(true); setError('');
    try {
      const result = await api.overview();
      if (alive.current && ticket === loadTicket.current) setOverview(result);
    } catch (caught) { if (alive.current && ticket === loadTicket.current) setError(emailMarketingCode(caught)); }
    finally { if (alive.current && ticket === loadTicket.current) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true;
    if (configured) void load();
    return () => { alive.current = false; loadTicket.current++; attempts.current.clear(); syncAttempts.current.clear(); };
    // Exactly one initial local read; provider requests start on a user action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, configured]);
  function saved(connection: EmailMarketingConnection) {
    loadTicket.current++;
    setOverview(current => current ? {...current, connections: [...current.connections.filter(c => c.id !== connection.id), connection]} : current);
  }
  async function sync(connection: EmailMarketingConnection) {
    if (syncGuard.current || !canManage || connection.status !== 'connected') return;
    const attempt = syncAttempts.current.get(connection.id) ?? {operationId: crypto.randomUUID(), expectedVersion: connection.version};
    syncAttempts.current.set(connection.id, attempt);
    syncGuard.current = true; setSyncing(connection.provider); setSyncFeedback(null);
    try {
      const result = await api.sync(attempt);
      if (!alive.current) return;
      syncAttempts.current.delete(connection.id);
      saved(result);
      setSyncFeedback({provider: connection.provider, message: 'Tek seferlik müşteri aktarımı sıraya alındı.'});
      await load();
    } catch (caught) {
      if (!alive.current) return;
      const code = emailMarketingCode(caught);
      // Keep the immutable intent when the batch outcome is uncertain.
      if (['version_conflict', 'operation_conflict', 'invalid_input', 'forbidden', 'unauthorized', 'provider_unauthorized', 'provider_forbidden', 'not_configured'].includes(code)) {
        syncAttempts.current.delete(connection.id);
        if (code === 'version_conflict') void load();
      }
      setSyncFeedback({provider: connection.provider, error: code});
    } finally { syncGuard.current = false; if (alive.current) setSyncing(null); }
  }
  const enabled = configured && overview?.configured && !error;
  const active = overview?.connections.find(c => c.status !== 'disconnected');
  return <section className={styles.workspace} aria-label="E-posta servisleri">
    <h1 className={styles.srOnly}>E-posta bağlantıları</h1>
    <div className={styles.toolbar}><Link href="/marketing/email/history">Önceki kampanya kayıtları</Link>
      {configured ? <button className="button button-secondary" disabled={loading || !!editor} onClick={() => void load()}>Durumu yenile</button> : null}</div>
    {configured ? <p className={styles.hint}>Bağlantı kurmak müşterileri aktarmaz. Eşitle ile o andaki aktarılabilir müşterileri tek seferlik aktarım için sıraya alın.</p> : null}
    {!configured || overview?.configured === false ? <p className={styles.notice}>E-posta bağlantıları henüz kullanıma açılmadı. Önceki kampanya kayıtlarını görüntüleyebilirsiniz.</p> : null}
    {error ? <p role="alert" className={styles.notice}>{emailMarketingErrorMessage(error)}</p> : null}
    {loading ? <p role="status" className={styles.hint}>Bağlantılar kontrol ediliyor…</p> : null}
    {EMAIL_SERVICES.map(service => {
      const connection = overview?.connections.find(c => c.provider === service.provider && c.status !== 'disconnected') ?? overview?.connections.find(c => c.provider === service.provider);
      const other = active && active.provider !== service.provider;
      return <article key={service.provider} className={styles.card} aria-label={service.name}>
        <div className={styles.service}><ProviderBrand provider={service.provider} /><p>{service.description}</p>
          <a href={service.pricingUrl} target="_blank" rel="noopener noreferrer" className={styles.hint}>Ücretsiz plan ve güncel sınırlar ↗</a></div>
        <div className={styles.connection}><span className={styles.status} data-status={connection?.status ?? 'disconnected'}>{emailMarketingStatus(connection)}</span>
          {connection && connection.status !== 'disconnected' ? <><strong>{connection.accountName ?? 'Bilinmiyor'}</strong><span>{connection.listName ?? 'Liste bilinmiyor'}</span>
            <small>Son aktarım: {emailMarketingDate(connection.lastSyncedAt)}</small>
            {connection.errorCode ? <small>{emailMarketingErrorMessage(connection.errorCode)}</small> : null}</> : null}
          {connection?.status === 'connected' ? <small id={`${service.provider}-sync-scope`}>Yalnızca ayrı pazarlama izni kanıtlanan müşteriler aktarılır. Satın alma veya sözleşme onayı bu iznin yerine geçmez. Aktarım, servisteki otomasyonları tetikleyebilir.</small> : null}
          {syncFeedback?.provider === service.provider ? <small role={syncFeedback.error ? 'alert' : 'status'}>{syncFeedback.error === 'outcome_unknown' ? 'Aktarımın sonucu henüz doğrulanamadı. Aynı işlemi tekrar eşitleyerek kontrol edin.' : syncFeedback.error === 'cleanup_pending' ? 'Bu aktarım işlemi sürüyor. Aynı işlemi tekrar eşitleyerek kontrol edin.' : syncFeedback.error ? emailMarketingErrorMessage(syncFeedback.error) : syncFeedback.message}</small> : null}
          {other ? <small>Önce {serviceName(active.provider)} bağlantısını kaldırın.</small> : null}</div>
        <div className={styles.cardActions}>
          {canManage ? <button className={`button ${connection?.status === 'connected' ? 'button-secondary' : 'button-primary'}`} aria-label={`${service.name} bağlantısını yönet`} disabled={!enabled || !!other || syncing === service.provider || !!(connection && syncAttempts.current.has(connection.id))} onClick={() => setEditor(service.provider)}>{connection && connection.status !== 'disconnected' ? 'Yönet' : 'Bağla'}</button> : null}
          {canManage && connection?.status === 'connected' ? <button className="button button-primary" aria-label={`${service.name} müşterilerini eşitle`} aria-describedby={`${service.provider}-sync-scope`} disabled={!enabled || loading || !!editor || syncing !== null} onClick={() => void sync(connection)}>{syncing === service.provider ? 'Eşitleniyor…' : syncAttempts.current.has(connection.id) ? 'Tekrar eşitle' : 'Eşitle'}</button> : null}
          {connection?.status === 'connected' ? <a className="button button-secondary" href={service.campaignUrl} target="_blank" rel="noopener noreferrer">Kampanyaları aç ↗</a>
            : <a href={service.accountUrl} target="_blank" rel="noopener noreferrer">Hesap oluştur ↗</a>}</div>
      </article>;
    })}
    {overview ? <div className={styles.sync} aria-label="Aktarım durumu">
      <span>Bekleyen <strong>{emailMarketingCount(overview.sync.queued)}</strong></span>
      <span>Doğrulanan <strong>{emailMarketingCount(overview.sync.verified)}</strong></span>
      <span>Engellenen <strong>{emailMarketingCount(overview.sync.blocked)}</strong></span>
      <span>Kontrol gereken <strong>{emailMarketingCount(overview.sync.failed + overview.sync.pendingVerification)}</strong></span>
      <small>Son kontrol: {emailMarketingDate(overview.sync.suppressionCheckedAt)}</small></div> : null}
    {editor ? <EmailMarketingConnectDialog key={editor} provider={editor} connection={overview?.connections.find(c => c.provider === editor && c.status !== 'disconnected')}
      api={api} pending={attempts.current.get(editor)} onPending={attempt => { if (attempt) attempts.current.set(editor, attempt); else attempts.current.delete(editor); }}
      onSaved={saved} onClose={() => setEditor(null)} /> : null}
  </section>;
}
