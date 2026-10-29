"use client";

import { PanelInitialDataGate } from "@/components/panel/PanelInitialDataGate";
import { hasStoreToolLicense, parseStoreToolWorkspace, STORE_TOOL_KEYS, type StoreToolKey, type StoreToolOffer, type StoreToolWorkspace } from '@celebix/saas-contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelPageHeader, PanelPageShell } from '@/components/panel/PanelPageShell';
import { clearPendingPurchase, persistPendingPurchase, purchaseMatchesPending, readPendingPurchase, storeToolsUi, StoreToolsUiError, type PendingToolPurchase } from '@/lib/store-tools-ui/client';
import type { EngagementPermissions } from '../promotions/PopupStudio';
import { StoreToolsConsole } from './StoreToolsConsole';
import { ToolProductCard } from './ToolProductCard';
import catalog from './tool-product-catalog.module.css';
import {PlatformCheckoutButton} from '../commercial-packages/PlatformCheckoutButton';
import styles from './store-tools.module.css';
import local from './store-tools-purchasing.module.css';

const money = (cents: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(cents / 100);
const failureMessage = (error: unknown) => error instanceof StoreToolsUiError ? error.message : 'Araçların güncel durumu yüklenemedi. Yeniden deneyin.';
type Props = EngagementPermissions & Readonly<{ storeId: string; checkoutEnabled?:boolean }>;

export function StoreToolsPurchasingConsole({ storeId, canManage, canReadCoupons, canCreateCoupon, checkoutEnabled=false }: Props) {
  const [workspace, setWorkspace] = useState<StoreToolWorkspace | null>(null);
  const [pending, setPending] = useState<PendingToolPurchase | null>(null);
  const [busy, setBusy] = useState(false), [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [journalBlocked, setJournalBlocked] = useState(false);
  const mounted = useRef(false), working = useRef(false), sequence = useRef(0), pendingRef = useRef<PendingToolPurchase | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const revision = ++sequence.current;
    setRefreshing(true); setError('');
    try {
      const next = parseStoreToolWorkspace(await storeToolsUi.read(signal));
      if (next.storeId !== storeId) throw Error('store_mismatch');
      if (!mounted.current || revision !== sequence.current || signal?.aborted) return;
      setWorkspace(next);
      try {
        const saved = readPendingPurchase(window.sessionStorage, window.location.hostname, storeId);
        const confirmed = saved && next.purchases.find(purchase => purchaseMatchesPending(purchase, saved));
        if (confirmed) {
          clearPendingPurchase(window.sessionStorage, window.location.hostname, storeId);
          pendingRef.current = null; setPending(null);
          setMessage('Önceki talebiniz doğrulandı. Güncel durumu aşağıda görebilirsiniz.');
        } else { pendingRef.current = saved; setPending(saved); }
        setJournalBlocked(false);
      } catch {
        setJournalBlocked(true);
        setError('Bu tarayıcıda talep bilgileri güvenle okunamadı. Yeni talep oluşturulmadı. Tarayıcı depolamasını kontrol ederek durumu yenileyin.');
      }
    } catch (failure) {
      if (mounted.current && revision === sequence.current && !signal?.aborted) setError(failureMessage(failure));
    } finally { if (mounted.current && revision === sequence.current) setRefreshing(false); }
  }, [storeId]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController(); void load(controller.signal);
    return () => { mounted.current = false; sequence.current++; controller.abort(); };
  }, [load]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (working.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  async function submit(offer?: StoreToolOffer) {
    if (working.current || refreshing || journalBlocked || !workspace || workspace.storeId !== storeId || !canManage || !workspace.canRequestPurchase) return;
    // Reuse the complete original intent after any uncertain response, including after a reload.
    if (pendingRef.current && offer) return;
    working.current = true; const revision = ++sequence.current; setBusy(true); setError(''); setMessage('');
    let attempt = pendingRef.current;
    try {
      if (!attempt) {
        if (!offer || !workspace.offers.some(current => current.quoteFingerprint === offer.quoteFingerprint && current.id === offer.id) || offer.toolKeys.some(tool => hasStoreToolLicense(workspace, tool) || workspace.purchases.some(purchase => purchase.toolKeys.includes(tool)))) return;
        attempt = { schemaVersion: 1, storeId, intent: { operationId: storeToolsUi.newId(), offerId: offer.id, quoteFingerprint: offer.quoteFingerprint }, offer };
      }
      try { persistPendingPurchase(window.sessionStorage, window.location.hostname, attempt); }
      catch { setJournalBlocked(true); setError('Talep bilgileri bu tarayıcıda güvenle saklanamadı. Satın alma talebi gönderilmedi. Depolamayı kontrol ederek durumu yenileyin.'); return; }
      pendingRef.current = attempt; setPending(attempt);
      const purchase = await storeToolsUi.request(attempt);
      if (!mounted.current || revision !== sequence.current) return;
      // A receipt records a request/payment; only a fresh server license can open an editor.
      setWorkspace(current => current ? { ...current, purchases: [purchase, ...current.purchases.filter(item => item.id !== purchase.id)].slice(0, 100) } : current);
      clearPendingPurchase(window.sessionStorage, window.location.hostname, storeId);
      pendingRef.current = null; setPending(null);
      setMessage(purchase.status === 'settled' ? 'Ödeme doğrulandı. Araçların güncel durumunu yenileyin.' : 'Talebiniz alındı. Ödeme doğrulandıktan sonra araçlarınız açılır.');
    } catch (failure) {
      if (!mounted.current || revision !== sequence.current) return;
      if (failure instanceof StoreToolsUiError && failure.knownSafe) {
        try { clearPendingPurchase(window.sessionStorage, window.location.hostname, storeId); pendingRef.current = null; setPending(null); }
        catch { setJournalBlocked(true); }
      }
      setError(failure instanceof StoreToolsUiError ? failure.message : 'Talebin sonucu doğrulanamadı. Aynı talebi doğrulayarak devam edin.');
    } finally { working.current = false; if (mounted.current) setBusy(false); }
  }

  if (!workspace || workspace.storeId !== storeId) return <PanelInitialDataGate pending={!error}>{<PanelPageShell><PanelPageHeader title="Mağaza araçları" /><div className={styles.workspace}>
    {error ? <div className={styles.feedback}><div><p role="alert">{error}</p><button className="button button-secondary" type="button" disabled={refreshing} onClick={() => void load()}>Yeniden dene</button></div></div> : <p className={styles.status} role="status">Mağaza araçları yükleniyor…</p>}
  </div></PanelPageShell>}</PanelInitialDataGate>;

  const toolAccess = Object.fromEntries(STORE_TOOL_KEYS.map(tool => [tool, hasStoreToolLicense(workspace, tool)])) as Record<StoreToolKey, boolean>;
  function offerCard(offer: StoreToolOffer, bundle = false) {
    const requested = workspace!.purchases.find(purchase => purchase.toolKeys.some(tool => offer.toolKeys.includes(tool)));
    const blocked = busy || refreshing || journalBlocked || Boolean(pending) || !canManage || !workspace!.canRequestPurchase || Boolean(requested);
    const matchingRequest = requested?.offerId === offer.id;
    const mayCheckout = checkoutEnabled && workspace!.canRequestPurchase && (!requested || matchingRequest && requested.status === 'pending');
    return <ToolProductCard key={offer.id} offer={offer} canManage={canManage}>
      {requested ? <div className={catalog.pending} role="status"><strong>{requested.offerName}</strong><p>{money(requested.totalCents)} (KDV dahil) · {requested.status === 'settled' ? 'Ödeme doğrulandı. Araçların güncel durumunu yenileyin.' : 'Ödeme doğrulaması bekleniyor.'}</p>{!matchingRequest && requested.status === 'pending' ? <p>Bu aracı içeren farklı bir talep bekliyor. Yeni satın alma başlatmadan mevcut talebi kontrol edin.</p> : null}</div> : null}
      {!workspace!.canRequestPurchase ? <p className={catalog.state}>Satın almayı mağaza sahibi veya yöneticisi yapabilir.</p> : mayCheckout ? <PlatformCheckoutButton storeId={storeId} kind="tool" offerId={offer.id} term="once" className={`button ${bundle ? 'button-primary' : 'button-secondary'}`} disabled={busy || refreshing || journalBlocked || Boolean(pending) || !canManage} label={matchingRequest ? 'Mevcut satın almaya devam et' : 'Güvenli ödemeye geç'}/> : !requested ? <button className={`button ${bundle ? 'button-primary' : 'button-secondary'}`} type="button" disabled={blocked} onClick={() => void submit(offer)}>Satın alma talebi oluştur<span className={styles.srOnly}> · {offer.name}</span></button> : null}
    </ToolProductCard>;
  }
  const bundle = workspace.offers.find(offer => offer.id === 'all_tools');
  const showBundle = bundle && workspace.licenses.length === 0 && (checkoutEnabled||workspace.purchases.length === 0);
  const summary = <div className={catalog.toolbar}>
    <div className={local.terms}><p>Tek seferlik ödeme · Yıllık yenileme yok. Araç haklarınız paket değişikliklerinde korunur.</p><button className="button button-secondary" type="button" disabled={busy || refreshing} onClick={() => void load()}>{refreshing ? 'Yenileniyor…' : 'Durumu yenile'}</button></div>
    <p className={local.activation}>{checkoutEnabled?'Ödemenizi Celebix’in güvenli sayfasında tamamlayın. Araçlar ödeme doğrulandığında açılır.':'Talep oluşturmak tahsilat yapmaz. Araçlar, ödeme Celebix tarafından doğrulandığında açılır.'}</p>
    {message ? <p className={styles.status} role="status">{message}</p> : null}
    {error ? <p className={local.error} role="alert">{error}</p> : null}
    {pending ? <div className={local.recovery} role="status"><div><strong>{pending.offer.name} · {money(pending.offer.totalCents)} (KDV dahil)</strong><p>Talebin sonucu henüz doğrulanamadı. Yeni talep oluşturmadan aynı talebi doğrulayın.</p></div><button className="button button-secondary" type="button" disabled={busy || refreshing || journalBlocked || !workspace.canRequestPurchase} onClick={() => void submit()}>{busy ? 'Doğrulanıyor…' : 'Talebi doğrula'}</button></div> : null}
    {workspace.purchases.filter(purchase => purchase.status === 'pending').map(purchase => <div className={catalog.pending} role="status" key={purchase.id}><strong>Bekleyen talep: {purchase.offerName}</strong><p>{money(purchase.totalCents)} (KDV dahil) · Ödeme doğrulaması bekleniyor. Bu taleple çakışan yeni bir satın alma başlatılamaz.</p></div>)}
    {!showBundle && workspace.licenses.length > 0 ? <p className={catalog.bundleNotice}>Tüm mağaza araçları paketi, henüz araç hakkı olmayan mağazalar içindir. Mevcut haklarınız korunur; eksik araçları ayrı ayrı edinebilirsiniz.</p> : null}
  </div>;
  return <StoreToolsConsole canManage={canManage} canReadCoupons={canReadCoupons} canCreateCoupon={canCreateCoupon} timezone={workspace.timezone} toolAccess={toolAccess} catalogClassName={catalog.catalog} purchaseSummary={<>{summary}{showBundle ? offerCard(bundle, true) : null}</>} renderToolSummary={(tool, state) => {
    const offer = workspace.offers.find(item => item.id === tool)!;
    return <ToolProductCard offer={offer} summary={state} canManage={canManage}/>;
  }} renderLockedTool={tool => {
    const offer = workspace.offers.find(item => item.id === tool);
    return offer ? offerCard(offer) : null;
  }} />;
}
