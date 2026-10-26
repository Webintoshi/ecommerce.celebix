'use client';
import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { COMMERCIAL_PACKAGES, STORE_TOOL_OFFERS, commercialPackageHasCapability, getCommercialPackage, getRequiredCommercialPackage, parseCommercialPlanOverview, parseCommercialUpgradeRequest, type CommercialCapability, type CommercialPlanOverview, type CommercialUpgradeRequest } from '@celebix/saas-contracts';
import { COMMERCIAL_CAPABILITY_LABELS } from '@/lib/commercial-packages/route-model';
import { hasAnnualDiscount, packageCount, packageMoney, packageStorage } from './presentation';
import {PlatformCheckoutButton} from './PlatformCheckoutButton';
import styles from './commercial-packages.module.css';
type PlanIdentity = Readonly<{
    planId: string;
    planCode: string;
    version: number;
}>;
const CAPABILITIES = Object.keys(COMMERCIAL_CAPABILITY_LABELS) as CommercialCapability[];
const defaultFetcher = (input: string, init?: RequestInit) => fetch(input, init);
const defaultOperationId = () => crypto.randomUUID();
const packageRank = (plan: {code: string} | undefined) => plan ? COMMERCIAL_PACKAGES.findIndex(candidate => candidate.code === plan.code) : -1;
export function CommercialPlanComparison({ currentPlan, canRequest, feature, storeId, checkoutEnabled=false, fetcher = defaultFetcher, createOperationId = defaultOperationId }: Readonly<{
    currentPlan: PlanIdentity;
    canRequest: boolean;
    storeId?: string;
    checkoutEnabled?: boolean;
    feature?: CommercialCapability;
    fetcher?: typeof defaultFetcher;
    createOperationId?: () => string;
}>) {
    const current = getCommercialPackage(currentPlan), minimum = feature ? getRequiredCommercialPackage(feature) : undefined;
    const currentOffer = current ? COMMERCIAL_PACKAGES.find(plan => plan.code === current.code) : undefined;
    const required = minimum && packageRank(minimum) > packageRank(current) ? minimum : undefined;
    const firstUpgrade = COMMERCIAL_PACKAGES.find(plan => plan.monthlyPriceCents > 0 && packageRank(plan) > packageRank(current));
    const [selectedId, setSelectedId] = useState(required?.id ?? (feature && currentOffer ? currentOffer.id : firstUpgrade?.id) ?? currentOffer?.id ?? COMMERCIAL_PACKAGES[1].id);
    const [overview, setOverview] = useState<CommercialPlanOverview | null>(null), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(''), [request, setRequest] = useState<CommercialUpgradeRequest | null>(null);
    const operation = useRef<{
        planId: string;
        operationId: string;
    } | null>(null), sending = useRef(false);
    const selected = COMMERCIAL_PACKAGES.find(plan => plan.id === selectedId)!;
    const [checkoutTerm,setCheckoutTerm]=useState<'monthly'|'annual'>('annual');
    const onlineCheckout=Boolean(checkoutEnabled&&storeId&&canRequest&&current?.monthlyPriceCents===0);
    const checkoutNet=checkoutTerm==='annual'?selected.annualPriceCents:selected.monthlyPriceCents;
    const checkoutVat=Number((BigInt(checkoutNet)*BigInt(STORE_TOOL_OFFERS[0]!.vatBps)+5000n)/10000n);
    const checkoutMoney=(value:number)=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(value/100);
    const higher = selected.monthlyPriceCents > 0 && packageRank(selected) > packageRank(current);
    const requestPending = request?.status === 'pending';
    function samePlan(value: CommercialPlanOverview) { if (value.plan.planId !== currentPlan.planId || value.plan.planCode !== currentPlan.planCode || value.plan.version !== currentPlan.version)
        throw Error('stale_plan'); return value; }
    useEffect(() => { if (!canRequest) {
        setLoading(false);
        return;
    } const abort = new AbortController(); setLoading(true); setLoadError(false); void fetcher('/api/plan', { cache: 'no-store', signal: abort.signal }).then(async (response) => { if (!response.ok)
        throw Error(); const value = samePlan(parseCommercialPlanOverview(await response.json())); if (!abort.signal.aborted) {
        setOverview(value);
        setRequest(value.request ?? null);
    } }).catch(() => { if (!abort.signal.aborted)
        setLoadError(true); }).finally(() => { if (!abort.signal.aborted)
        setLoading(false); }); return () => abort.abort(); }, [fetcher, canRequest, currentPlan.planId, currentPlan.planCode, currentPlan.version, revision]);
    async function submit() { if (sending.current || !canRequest || !higher || requestPending || loading || loadError)
        return; sending.current = true; setBusy(true); setError(''); try {
        const command = operation.current ?? { planId: selectedId, operationId: createOperationId() };
        operation.current = command;
        const response = await fetcher('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': command.operationId }, body: JSON.stringify(command) });
        if (!response.ok)
            throw Error();
        const value = parseCommercialUpgradeRequest(await response.json());
        if (value.planId !== command.planId)
            throw Error();
        setRequest(value);
        operation.current = null;
    }
    catch {
        let confirmed = false;
        try {
            const response = await fetcher('/api/plan', { cache: 'no-store' });
            if (response.ok) {
                const value = samePlan(parseCommercialPlanOverview(await response.json()));
                setOverview(value);
                const pending = value.request;
                if (pending && pending.planId === operation.current?.planId) {
                    setRequest(pending);
                    operation.current = null;
                    confirmed = true;
                }
            }
        }
        catch { }
        if (!confirmed)
            setError('Talebin sonucu doğrulanamadı. Aynı talebi yeniden kontrol edin.');
    }
    finally {
        sending.current = false;
        setBusy(false);
    } }
    const usage = overview?.usage;
    const usageItems = usage ? [['Ürün', usage.products, current?.limits.products], ['SKU / varyant', usage.variants, current?.variantLimit], ['Kullanıcı', usage.staff, current?.limits.staff], ['Aylık sipariş', usage.monthlyOrders, current?.limits.monthlyOrders]] as const : [];
    return <div className={styles.comparison}>
  <section className={styles.usageSection} aria-label="Mevcut paket ve kullanım"><div><span className={styles.eyebrow}>Mevcut paketiniz</span><h2>{current?.name ?? currentPlan.planCode}</h2></div>{loading ? <p role="status">Kullanım bilgileri yükleniyor…</p> : loadError ? <div role="alert"><p>Kullanım bilgileri alınamadı.</p><button type="button" className="button button-secondary" onClick={() => setRevision(n => n + 1)}>Yeniden dene</button></div> : usage ? <div className={styles.usageGrid}>{usageItems.map(([label, used, limit]) => <div key={label}><span>{label}</span><strong>{packageCount(used)}{limit !== undefined ? ` / ${packageCount(limit)}` : ''}</strong></div>)}<div><span>Depolama</span><strong>{packageStorage(usage.storageBytes)}{current ? ` / ${packageStorage(current.limits.storageBytes)}` : ''}</strong></div>{usage.customDomains > 0 ? <div><span>Alan adı bağlantıları</span><strong>{packageCount(usage.customDomains)}{current ? ` / ${packageCount(current.limits.customDomains ?? 0)}` : ''}</strong></div> : null}</div> : <p>Kullanım bilgilerini mağaza sahibiniz görüntüleyebilir.</p>}</section>
  <fieldset className={styles.planGrid} disabled={busy || Boolean(operation.current) || (!onlineCheckout&&requestPending)}><legend className="sr-only">Paket seçin</legend>{COMMERCIAL_PACKAGES.map(plan => <label className={`${styles.planOption} ${selectedId === plan.id ? styles.selectedPlan : ''}`} key={plan.id}><span className={styles.planRadio}><input type="radio" name="commercial-plan" value={plan.id} checked={selectedId === plan.id} onChange={() => { setSelectedId(plan.id); setError(''); }}/><strong>{plan.name}</strong>{current?.code === plan.code ? <small>Mevcut paket</small> : required?.id === plan.id ? <small>Önerilen</small> : null}</span><span className={styles.planPrice}>{packageMoney(plan.annualPriceCents)} <small>TL / yıl{plan.annualPriceCents > 0 ? ' + KDV' : ''}</small></span><span className={styles.planDetail}>{plan.annualPriceCents > 0 ? 'Yıllık peşin ödeme' : 'Ücretsiz'}</span>{plan.monthlyPriceCents > 0 ? <span className={styles.planDetail}>Aylık: {packageMoney(plan.monthlyPriceCents)} TL + KDV</span> : null}<span className={styles.planQuota}>{packageCount(plan.limits.products)} ürün · {packageCount(plan.variantLimit)} SKU<br />{packageCount(plan.limits.staff)} kullanıcı · {packageStorage(plan.limits.storageBytes)}<br />{packageCount(plan.limits.monthlyOrders ?? 0)} sipariş / ay<br />{plan.limits.customDomains ? '1 özel alan adı' : 'Celebix mağaza adresi'}</span></label>)}</fieldset>
  <div className={styles.featureTable} role="region" aria-label="Paket özellik karşılaştırması" tabIndex={0}><table><thead><tr><th scope="col">Özellik</th>{COMMERCIAL_PACKAGES.map(plan => <th scope="col" key={plan.id}>{plan.name}</th>)}</tr></thead><tbody><tr><th scope="row">Mağaza, ödeme, kargo ve temel analizler</th>{COMMERCIAL_PACKAGES.map(plan => <td key={plan.id}><Check size={16} aria-hidden="true"/><span className="sr-only">Var</span></td>)}</tr>{CAPABILITIES.map(capability => <tr key={capability}><th scope="row">{COMMERCIAL_CAPABILITY_LABELS[capability]}</th>{COMMERCIAL_PACKAGES.map(plan => <td key={plan.id}>{commercialPackageHasCapability(plan, capability) ? <><Check size={16} aria-hidden="true"/><span className="sr-only">Var</span></> : <span aria-label="Üst paketlerde">—</span>}</td>)}</tr>)}</tbody></table></div>
  <section className={styles.requestSection} aria-label="Paket değişikliği"><div><h2>{selected.name}</h2>{hasAnnualDiscount(selected) ? <p>Yıllık pakette 12 ay kullanın, 10 ay ödeyin.</p> : null}<p>Her paket bir mağaza içindir. Yapay zekâ, mesaj, ödeme ve kargo sağlayıcısı ücretleri kullanımınıza göre ayrıca oluşur.</p></div>{!canRequest ? <p>Mağaza sahibinizle paket seçeneklerini inceleyebilirsiniz.</p> : onlineCheckout ? <div className={styles.requestActions}><label>Ödeme dönemi <select aria-label="Ödeme dönemi" value={checkoutTerm} onChange={event=>setCheckoutTerm(event.target.value as 'monthly'|'annual')}><option value="annual">Yıllık peşin</option><option value="monthly">Aylık</option></select></label><small>Net {checkoutMoney(checkoutNet)} TL · KDV {checkoutMoney(checkoutVat)} TL · KDV dahil toplam {checkoutMoney(checkoutNet+checkoutVat)} TL</small><PlatformCheckoutButton storeId={storeId!} kind="package" offerId={selected.id} term={checkoutTerm} disabled={!higher}/><small>Ödeme doğrulandığında paketiniz seçtiğiniz dönem için açılır. Otomatik yenileme yapılmaz.</small></div> : requestPending ? <p className={styles.requestSuccess} role="status">Talebiniz iletildi. Paket değişikliği ekibimiz tarafından değerlendirilecek.</p> : <div className={styles.requestActions}><button type="button" className="button button-primary" disabled={!higher || busy || loading || loadError} onClick={() => void submit()}>{busy ? 'Talep iletiliyor…' : error ? 'Aynı talebi yeniden kontrol et' : 'Paket değişikliği talep et'}</button><small>Talep iletmek ödeme başlatmaz. Paketiniz ekibimizin onayından sonra değişir.</small></div>}{error ? <p className={styles.requestError} role="alert">{error}</p> : null}</section>
 </div>;
}
