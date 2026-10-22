"use client";

import { hasStoreToolLicense, parseStoreToolWorkspace, STORE_TOOL_KEYS, type StoreToolKey, type StoreToolOffer, type StoreToolWorkspace } from '@celebix/saas-contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelPageHeader, PanelPageShell } from '@/components/panel/PanelPageShell';
import { clearPendingPurchase, persistPendingPurchase, purchaseMatchesPending, readPendingPurchase, storeToolsUi, StoreToolsUiError, type PendingToolPurchase } from '@/lib/store-tools-ui/client';
import type { EngagementPermissions } from '../promotions/PopupStudio';
import { StoreToolsConsole, ToolArtwork } from './StoreToolsConsole';
import styles from './store-tools.module.css';
import local from './store-tools-purchasing.module.css';

const descriptions: Readonly<Record<StoreToolKey, string>> = {
  contact_widget: 'WhatsApp, telefon ve diğer iletişim kanallarınızı tek balonda sunun.',
  whatsapp_ordering: 'Ürün ve sepet bilgileriyle WhatsApp üzerinden sipariş alın.',
  cart_capture: 'Ziyaretçilerin e-posta veya telefon bilgilerini sepet aşamasında alın.',
  restock: 'Stok bekleyen müşterilere ürün yeniden geldiğinde haber verin.',
  order_bump: 'Sepette ve ödemede tamamlayıcı ürünler önerin.',
};
const money = (cents: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(cents / 100);
const failureMessage = (error: unknown) => error instanceof StoreToolsUiError ? error.message : 'Araçların güncel durumu yüklenemedi. Yeniden deneyin.';
type Props = EngagementPermissions & Readonly<{ storeId: string }>;

export function StoreToolsPurchasingConsole({ storeId, canManage, canReadCoupons, canCreateCoupon }: Props) {
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

  if (!workspace || workspace.storeId !== storeId) return <PanelPageShell><PanelPageHeader title="Mağaza araçları" /><div className={styles.workspace}>
    {error ? <div className={styles.feedback}><div><p role="alert">{error}</p><button className="button button-secondary" type="button" disabled={refreshing} onClick={() => void load()}>Yeniden dene</button></div></div> : <p className={styles.status} role="status">Mağaza araçları yükleniyor…</p>}
  </div></PanelPageShell>;

  const toolAccess = Object.fromEntries(STORE_TOOL_KEYS.map(tool => [tool, hasStoreToolLicense(workspace, tool)])) as Record<StoreToolKey, boolean>;
  function offerCard(offer: StoreToolOffer, bundle = false) {
    const requested = workspace!.purchases.find(purchase => purchase.toolKeys.some(tool => offer.toolKeys.includes(tool)));
    const blocked = busy || refreshing || journalBlocked || Boolean(pending) || !canManage || !workspace!.canRequestPurchase || Boolean(requested);
    return <article className={`${styles.toolRow} ${local.offerRow}`} key={offer.id} data-tool-offer={offer.id}>
      <ToolArtwork store /><div className={styles.toolCopy}><h2>{offer.name}</h2><p>{bundle ? 'Beş aracı tek seferde mağazanıza ekleyin.' : descriptions[offer.toolKeys[0]!]}</p>
        <div className={local.price}><strong>{money(offer.netCents)} + KDV</strong><span>Toplam {money(offer.totalCents)} · KDV {money(offer.vatCents)}</span></div>
        {offer.toolKeys.includes('restock') ? <small className={local.delivery}>E-posta gönderimi hizmetin gönderim koşullarına tabidir; sınırsız gönderim içermez.</small> : null}
        {requested ? <p className={local.requestState} role="status">{requested.status === 'settled' ? 'Ödeme doğrulandı. Araçların güncel durumunu yenileyin.' : 'Talep alındı · Ödeme doğrulaması bekleniyor.'}<span>Talep tutarı: {money(requested.totalCents)} (KDV dahil)</span></p> : !workspace!.canRequestPurchase ? <p className={local.requestState}>Talebi mağaza sahibi veya yöneticisi oluşturabilir.</p> : null}
      </div>
      {!requested && workspace!.canRequestPurchase ? <button className={`button ${bundle ? 'button-primary' : 'button-secondary'}`} type="button" disabled={blocked} onClick={() => void submit(offer)}>Satın alma talebi oluştur<span className={styles.srOnly}> · {offer.name}</span></button> : null}
    </article>;
  }
  const bundle = workspace.offers.find(offer => offer.id === 'all_tools');
  const showBundle = bundle && workspace.licenses.length === 0 && workspace.purchases.length === 0;
  const summary = <div className={local.summary}>
    <div className={local.terms}><p>Tek seferlik ödeme · Yıllık yenileme yok. Araç haklarınız paket değişikliklerinde korunur.</p><button className="button button-secondary" type="button" disabled={busy || refreshing} onClick={() => void load()}>{refreshing ? 'Yenileniyor…' : 'Durumu yenile'}</button></div>
    <p className={local.activation}>Talep oluşturmak tahsilat yapmaz. Araçlar, ödeme Celebix tarafından doğrulandığında açılır.</p>
    {message ? <p className={styles.status} role="status">{message}</p> : null}
    {error ? <p className={local.error} role="alert">{error}</p> : null}
    {pending ? <div className={local.recovery} role="status"><div><strong>{pending.offer.name} · {money(pending.offer.totalCents)} (KDV dahil)</strong><p>Talebin sonucu henüz doğrulanamadı. Yeni talep oluşturmadan aynı talebi doğrulayın.</p></div><button className="button button-secondary" type="button" disabled={busy || refreshing || journalBlocked || !workspace.canRequestPurchase} onClick={() => void submit()}>{busy ? 'Doğrulanıyor…' : 'Talebi doğrula'}</button></div> : null}
    {showBundle ? offerCard(bundle, true) : null}
  </div>;
  return <StoreToolsConsole canManage={canManage} canReadCoupons={canReadCoupons} canCreateCoupon={canCreateCoupon} timezone={workspace.timezone} toolAccess={toolAccess} purchaseSummary={summary} renderLockedTool={tool => {
    const offer = workspace.offers.find(item => item.id === tool);
    return offer ? offerCard(offer) : null;
  }} />;
}
