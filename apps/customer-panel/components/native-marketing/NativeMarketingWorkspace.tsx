"use client";

import { PanelInitialDataGate } from "@/components/panel/PanelInitialDataGate";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { NativeMarketingSettings, NativeMarketingTemplate } from '@celebix/saas-data';
import { EmailMarketingConnections } from '@/components/email-marketing/EmailMarketingConnections';
import { PanelSkeletonBlock } from '@/components/panel/PanelPageShell';
import { createNativeMarketingApi, type NativeMarketingApi, type NativeMarketingWorkspace as Workspace } from '@/lib/native-marketing-ui/client';
import {nativeMarketingProductIds} from '@celebix/saas-data/native-marketing-document';
import { clearMarketingCheckpoint, marketingSessionStorage, readMarketingCheckpoint, writeMarketingCheckpoint, parseMarketingCommand, marketingErrorCode, marketingErrorMessage, marketingDate, MARKETING_STATUS_LABELS, MARKETING_TEMPLATE_LABELS, type MarketingCommand, type MarketingDraft } from '@/lib/native-marketing-ui/model';
const CampaignComposer = lazy(() => import('./CampaignComposer').then(module => ({default:module.CampaignComposer})));
import { CartReminderSettings } from './CartReminderSettings';
import { CartReminderPreview } from './CartReminderPreview';
import styles from './native-marketing.module.css';

type Tab = 'campaigns' | 'cart' | 'connections';
const TABS: readonly Readonly<{ id: Tab; label: string }>[] = [{ id: 'campaigns', label: 'Kampanyalar' }, { id: 'cart', label: 'Sepet hatırlatmaları' }, { id: 'connections', label: 'Bağlantılar' }];
const DEFINITIVE = new Set(['product_unavailable','image_unavailable','invalid_input', 'invalid_schedule', 'address_required', 'forbidden', 'unauthorized', 'unauthenticated', 'feature_not_enabled', 'quota_exceeded', 'quota_reached', 'version_conflict', 'operation_conflict', 'not_configured', 'no_recipients', 'campaign_not_cancellable', 'already_sent', 'campaign_not_found', 'not_found']);
const number = (value: number) => new Intl.NumberFormat('tr-TR').format(value);
const SKIP_LABELS: Readonly<Record<string, string>> = { missing_email: 'E-posta adresi yok', invalid_email: 'Geçersiz e-posta', no_consent: 'E-posta izni yok', missing_consent: 'E-posta izni yok', unsubscribed: 'Abonelikten çıktı', suppressed: 'Gönderim dışında', duplicate: 'Tekrarlanan adres' };

export function NativeMarketingWorkspace({ canManage, nativeConfigured = false, connectionsConfigured, recoveryScope, api: suppliedApi }: Readonly<{ canManage: boolean; nativeConfigured?: boolean; connectionsConfigured: boolean; recoveryScope: string; api?: NativeMarketingApi }>) {
  const api = useMemo(() => suppliedApi ?? createNativeMarketingApi(), [suppliedApi]);
  const [tab, setTab] = useState<Tab>('campaigns'), [connectionsVisited, setConnectionsVisited] = useState(false);
  const [overview, setOverview] = useState<Workspace | null>(null), [loading, setLoading] = useState(nativeConfigured), [readError, setReadError] = useState('');
  const [draft, setDraft] = useState<MarketingDraft>(), [pending, setPending] = useState<MarketingCommand | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [feedback, setFeedback] = useState('');
  const [recoveryLoaded, setRecoveryLoaded] = useState(false), [cartDirty, setCartDirty] = useState(false);
  const alive = useRef(true), readTicket = useRef(0), mutationGuard = useRef(false), pendingRef = useRef<MarketingCommand | null>(null), draftRef = useRef(draft);
  draftRef.current = draft;

  async function load() {
    if (!nativeConfigured) return;
    const ticket = ++readTicket.current;
    setLoading(true); setReadError('');
    try { const value = await api.overview(); if (alive.current && ticket === readTicket.current) setOverview(value); }
    catch (caught) { if (alive.current && ticket === readTicket.current) setReadError(marketingErrorCode(caught)); }
    finally { if (alive.current && ticket === readTicket.current) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true;
    const storage = marketingSessionStorage();
    const checkpoint = storage ? readMarketingCheckpoint(recoveryScope, storage, Date.now()) : null;
    if (checkpoint) {
      setDraft(checkpoint.draft);
      if (checkpoint.pending) { pendingRef.current = checkpoint.pending; setPending(checkpoint.pending); setError('outcome_unknown'); if (checkpoint.pending.kind === 'cart-settings') setTab('cart'); }
    }
    setRecoveryLoaded(true); void load();
    return () => { alive.current = false; readTicket.current++; };
    // Restoring a checkpoint only reads it. Every effect requires an explicit click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, recoveryScope, nativeConfigured]);
  useEffect(() => {
    if (!recoveryLoaded) return;
    const storage = marketingSessionStorage(); if (!storage) return;
    if (draft || pending) writeMarketingCheckpoint(recoveryScope, { schemaVersion: 1, savedAt: Date.now(), ...(draft ? { draft } : {}), ...(pending ? { pending } : {}) }, storage);
    else clearMarketingCheckpoint(recoveryScope, storage);
  }, [draft, pending, recoveryScope, recoveryLoaded]);
  useEffect(() => {
    if (!draft && !pending && !cartDirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [draft, pending, cartDirty]);

  function start(template?: NativeMarketingTemplate) {
    if (!canManage || !nativeConfigured || pendingRef.current || !overview) return;
    const selected = template ?? overview.templates.find(item => item.id === 'new_products');
    if (!selected || selected.id === 'cart') return;
    setDraft({ ...selected, templateId: selected.id, name: '', productIds: nativeMarketingProductIds(selected), scheduledAt: '', recipient: '' }); setFeedback(''); setError('');
  }
  async function execute(input: MarketingCommand) {
    if (!canManage || !nativeConfigured || mutationGuard.current) return;
    let command: MarketingCommand;
    try { command = pendingRef.current ?? parseMarketingCommand(input); } catch { setError('invalid_input'); return; }
    const storage = marketingSessionStorage();
    if (!storage || !writeMarketingCheckpoint(recoveryScope, { schemaVersion: 1, savedAt: Date.now(), pending: command, ...(draftRef.current ? { draft: draftRef.current } : {}) }, storage)) { setError('storage_unavailable'); return; }
    pendingRef.current = command; setPending(command); mutationGuard.current = true; setBusy(true); setError(''); setFeedback('');
    try {
      const result = await api.execute(command); if (!alive.current) return;
      pendingRef.current = null; setPending(null);
      if (command.kind === 'cart-settings') setOverview(current => current ? { ...current, settings: result as NativeMarketingSettings } : current);
      else if (command.kind === 'send' || command.kind === 'schedule') setDraft(undefined);
      setFeedback(command.kind === 'template' ? 'Şablon kaydedildi.' : command.kind === 'test' ? 'Test e-postası sıraya alındı.' : command.kind === 'cart-settings' ? 'Sepet hatırlatması ayarları uygulandı.' : command.kind === 'cancel' ? 'Kampanya iptal edildi.' : command.kind === 'schedule' ? 'Kampanya planlandı.' : 'Kampanya gönderim için sıraya alındı.');
      await load();
    } catch (caught) {
      if (!alive.current) return;
      const code = marketingErrorCode(caught); setError(code);
      if (DEFINITIVE.has(code)) { pendingRef.current = null; setPending(null); if (['version_conflict', 'campaign_not_cancellable', 'already_sent'].includes(code)) void load(); }
    } finally { mutationGuard.current = false; if (alive.current) setBusy(false); }
  }
  function selectTab(id: Tab) { setTab(id); if (id === 'connections') setConnectionsVisited(true); }
  const locked = busy || !!pending, campaigns = overview?.campaigns ?? [];
  const skips = Object.entries(overview?.skippedReasonCounts ?? {}).filter(([, count]) => count > 0);
  return <PanelInitialDataGate pending={nativeConfigured && loading && !overview && tab !== 'connections'} scopeKey={recoveryScope}>{<section className={styles.workspace} aria-label="E-posta pazarlama">
    <div className={styles.tabs} role="tablist" aria-label="E-posta araçları">{TABS.map(item => <button key={item.id} type="button" role="tab" id={`native-email-tab-${item.id}`} aria-selected={tab === item.id} aria-controls={`native-email-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => selectTab(item.id)} onKeyDown={event => {
      const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!direction && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (TABS.findIndex(value => value.id === item.id) + direction + TABS.length) % TABS.length;
      const next = TABS[index]!; selectTab(next.id); document.getElementById(`native-email-tab-${next.id}`)?.focus();
    }}>{item.label}</button>)}</div>
    {tab !== 'connections' && !canManage ? <p className={styles.note}>Bu alanı salt okunur görüntülüyorsunuz.</p> : null}
    {error && tab !== 'connections' ? <div role="alert" className={styles.notice}><p>{marketingErrorMessage(error)}</p>{pending && canManage ? <button type="button" className="button button-secondary" disabled={busy || !nativeConfigured} onClick={() => void execute(pending)}>{busy ? 'Kontrol ediliyor…' : 'Aynı işlemi kontrol et'}</button> : null}</div> : null}
    {feedback && tab !== 'connections' ? <p role="status" className={styles.notice}>{feedback}</p> : null}
    {!nativeConfigured && tab !== 'connections' ? <p role="status" className={styles.notice}>{marketingErrorMessage('not_configured')} Bağlantılar sekmesinden mevcut e-posta hizmetlerinizi kullanabilirsiniz.</p> : null}
    {readError && tab !== 'connections' ? <div role="alert" className={styles.notice}><p>{marketingErrorMessage(readError)}</p><button className="button button-secondary" type="button" disabled={loading} onClick={() => void load()}>Tekrar dene</button></div> : null}
    {!overview && loading && tab !== 'connections' ? <div className={styles.loading} role="status" aria-label="E-posta bilgileri yükleniyor"><PanelSkeletonBlock /><PanelSkeletonBlock /><PanelSkeletonBlock /></div> : null}
    {overview && nativeConfigured ? <>
      <section id="native-email-panel-campaigns" role="tabpanel" aria-labelledby="native-email-tab-campaigns" hidden={tab !== 'campaigns'} className={styles.panel}>
        <div className={styles.summary}><span>Gönderime uygun <strong>{number(overview.eligibleRecipientCount)}</strong></span><span>Kalan gönderim <strong>{number(overview.quota.remaining)} / {number(overview.quota.limit)}</strong></span><small>Yenilenme: {marketingDate(overview.quota.periodEndsAt)}</small></div>
        <details className={styles.deliveryDetails}><summary>Gönderim bilgileri</summary><p>Gönderen: {overview.branding.storeName} · {overview.senderEmail}</p><p>{number(overview.summary.queued)} sırada · {number(overview.summary.sent)} gönderilen · {number(overview.summary.failed)} başarısız · {number(overview.summary.suppressed)} gönderim dışında</p>{skips.length ? <ul>{skips.map(([reason, count]) => <li key={reason}>{SKIP_LABELS[reason] ?? 'Diğer uygun olmayan adresler'}: {number(count)}</li>)}</ul> : null}</details>
        {draft ? <Suspense fallback={<p role="status" className={styles.note}>E-posta düzenleyicisi yükleniyor…</p>}><CampaignComposer draft={draft} onChange={setDraft} templates={overview.templates} overview={overview} api={api} disabled={!canManage || locked} onCancel={() => { if (!locked) setDraft(undefined); }} onExecute={command => void execute(command)} /></Suspense> : <>
          <div className={styles.toolbar}><h2 className={styles.sectionTitle}>Gönderim geçmişi</h2>{canManage && campaigns.length ? <button className="button button-primary" disabled={locked || loading} onClick={() => start()}>Yeni kampanya</button> : null}<button className="button button-secondary" disabled={loading} onClick={() => void load()}>Yenile</button></div>
          {!campaigns.length ? <div className={styles.empty}><p>Henüz kampanya yok.</p><p className={styles.note}>Hazır bir şablon seçip mağazanızın ürünleriyle e-posta oluşturun.</p>{canManage ? <button className="button button-primary" disabled={locked || loading} onClick={() => start()}>Yeni kampanya</button> : null}</div> : <div className={styles.history}>{campaigns.map(campaign => <article key={campaign.id} className={styles.historyRow}><div><strong>{campaign.name}</strong><small>{MARKETING_TEMPLATE_LABELS[campaign.templateId]}{campaign.isTest ? ' · Test' : ''} · {marketingDate(campaign.scheduledAt)}</small></div><span>{MARKETING_STATUS_LABELS[campaign.status]}</span><span>{number(campaign.sentCount)} gönderilen / {number(campaign.recipientCount)} alıcı{campaign.failedCount ? ` · ${number(campaign.failedCount)} başarısız` : ''}</span>{canManage && ['scheduled', 'queued'].includes(campaign.status) ? <button className="button button-secondary" disabled={locked} aria-label={`${campaign.name} kampanyasını iptal et`} onClick={() => void execute({ kind: 'cancel', operationId: crypto.randomUUID(), campaignId: campaign.id, body: { expectedVersion: campaign.version } })}>İptal et</button> : null}</article>)}</div>}
        </>}
      </section>
      <section id="native-email-panel-cart" role="tabpanel" aria-labelledby="native-email-tab-cart" hidden={tab !== 'cart'} className={styles.panel}><CartReminderSettings settings={overview.settings} canManage={canManage} disabled={locked} onDirtyChange={setCartDirty} onExecute={command => void execute(command)} /><CartReminderPreview api={api} canManage={canManage} disabled={locked} quotaRemaining={overview.quota.remaining} onExecute={command => void execute(command)} /></section>
    </> : null}
    <section id="native-email-panel-connections" role="tabpanel" aria-labelledby="native-email-tab-connections" hidden={tab !== 'connections'}>{connectionsVisited ? <EmailMarketingConnections canManage={canManage} configured={connectionsConfigured} /> : null}</section>
  </section>}</PanelInitialDataGate>;
}
