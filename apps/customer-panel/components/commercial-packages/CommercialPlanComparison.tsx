'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Package, Tags, Users, ShoppingCart, Database, ArrowRight } from 'lucide-react';
import { COMMERCIAL_PACKAGES, STORE_TOOL_OFFERS, commercialPackageHasCapability, getCommercialPackage, getRequiredCommercialPackage, parseCommercialPlanOverview, parseCommercialUpgradeRequest, type CommercialCapability, type CommercialPlanOverview, type CommercialUpgradeRequest } from '@celebix/saas-contracts';
import { COMMERCIAL_CAPABILITY_LABELS } from '@/lib/commercial-packages/route-model';
import { packageCount, packageGrossCents, packageMoney, packageStorage } from './presentation';
import {PlatformCheckoutButton} from './PlatformCheckoutButton';
import { PLAN_PRESENTATION } from './plan-presentation';
import styles from './plan-catalog.module.css';
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
    const checkoutGross=packageGrossCents(checkoutNet);
    const checkoutVat=checkoutGross-checkoutNet;
    const checkoutMoney=packageMoney;
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
    const usageItems = usage ? [
        { label: 'Ürün', used: packageCount(usage.products), limit: current ? packageCount(current.limits.products) : undefined, Icon: Package },
        { label: 'SKU / varyant', used: packageCount(usage.variants), limit: current ? packageCount(current.variantLimit) : undefined, Icon: Tags },
        { label: 'Kullanıcı', used: packageCount(usage.staff), limit: current ? packageCount(current.limits.staff) : undefined, Icon: Users },
        { label: 'Aylık sipariş', used: packageCount(usage.monthlyOrders), limit: current?.limits.monthlyOrders !== undefined ? packageCount(current.limits.monthlyOrders) : undefined, Icon: ShoppingCart },
        { label: 'Depolama', used: packageStorage(usage.storageBytes), limit: current ? packageStorage(current.limits.storageBytes) : undefined, Icon: Database },
    ] : [];
    const selectionLocked = busy || Boolean(operation.current) || (!onlineCheckout && requestPending);
    const selectedPresentation = PLAN_PRESENTATION[selected.code];
    const quotaRows = [
        { label: 'Ürün', value: (plan: typeof selected) => packageCount(plan.limits.products) },
        { label: 'SKU / varyant', value: (plan: typeof selected) => packageCount(plan.variantLimit) },
        { label: 'Kullanıcı', value: (plan: typeof selected) => packageCount(plan.limits.staff) },
        { label: 'Depolama', value: (plan: typeof selected) => packageStorage(plan.limits.storageBytes) },
        { label: 'Aylık sipariş', value: (plan: typeof selected) => packageCount(plan.limits.monthlyOrders ?? 0) },
    ];
    return <div className={styles.comparison}>
        <section className={styles.usageSection} aria-label="Mevcut paket ve kullanım">
            <div className={styles.currentPlan}><span className={styles.eyebrow}>Mevcut paketiniz</span><h2>{current?.name ?? currentPlan.planCode}</h2></div>
            {loading ? <p role="status">Kullanım bilgileri yükleniyor…</p> : loadError ? <div className={styles.usageFeedback} role="alert"><p>Kullanım bilgileri alınamadı.</p><button type="button" className="button button-secondary" onClick={() => setRevision(n => n + 1)}>Yeniden dene</button></div> : usage ? <div className={styles.usageGrid}>
                {usageItems.map(({ label, used, limit, Icon }) => <div className={styles.usageItem} key={label}><Icon size={20} aria-hidden="true"/><div><span>{label}</span><strong>{used}{limit !== undefined ? ` / ${limit}` : ''}</strong></div></div>)}
                {usage.customDomains > 0 ? <div className={styles.usageItem}><div><span>Alan adı bağlantıları</span><strong>{packageCount(usage.customDomains)}{current ? ` / ${packageCount(current.limits.customDomains ?? 0)}` : ''}</strong></div></div> : null}
            </div> : <p>Kullanım bilgilerini mağaza sahibiniz görüntüleyebilir.</p>}
        </section>

        <div className={styles.termToolbar}>
            <div className={styles.termSwitch} role="group" aria-label="Ödeme dönemi">
                <button type="button" aria-label="Aylık ödeme" aria-pressed={checkoutTerm === 'monthly'} disabled={selectionLocked} onClick={() => setCheckoutTerm('monthly')}>Aylık</button>
                <button type="button" aria-label="Yıllık ödeme" aria-pressed={checkoutTerm === 'annual'} disabled={selectionLocked} onClick={() => setCheckoutTerm('annual')}>Yıllık</button>
            </div>
            <p>Yıllık pakette 12 ay kullanın, 10 ay ödeyin.</p>
        </div>

        <fieldset className={styles.planGrid} disabled={selectionLocked}>
            <legend className="sr-only">Paket seçin</legend>
            {COMMERCIAL_PACKAGES.map(plan => {
                const presentation = PLAN_PRESENTATION[plan.code];
                const isSelected = selectedId === plan.id;
                const price = packageGrossCents(checkoutTerm === 'annual' ? plan.annualPriceCents : plan.monthlyPriceCents);
                return <label className={`${styles.planOption} ${isSelected ? styles.selectedPlan : ''}`} key={plan.id} data-plan-id={plan.id}>
                    <img className={styles.productImage} src={presentation.image} alt={`${plan.name} paket görseli`} width={960} height={640}/>
                    <div className={styles.planBody}>
                        <div className={styles.planIdentity}><input type="radio" name="commercial-plan" value={plan.id} aria-label={`${plan.name} paketini seç`} checked={isSelected} onChange={() => { setSelectedId(plan.id); setError(''); }}/><strong>{plan.name}</strong>{current?.code === plan.code ? <small>Mevcut paket</small> : required?.id === plan.id ? <small>Önerilen</small> : null}</div>
                        <div className={styles.priceBlock}><div className={styles.priceLine}><strong data-plan-price>{packageMoney(price)} TL</strong>{price > 0 ? <span>/ {checkoutTerm === 'annual' ? 'yıl' : 'ay'} · KDV dahil</span> : null}</div>
                            {price === 0 ? <p>Süresiz ücretsiz</p> : checkoutTerm === 'annual' ? <p data-plan-equivalent>Aylık {checkoutMoney(price / 12)} TL · KDV dahil</p> : <p>Aylık ödeme</p>}
                        </div>
                        <p className={styles.planDescription}>{presentation.description}</p>
                        <ul className={styles.highlights}>
                            <li><Package size={17} aria-hidden="true"/><span>{packageCount(plan.limits.products)} ürün</span></li>
                            <li><ShoppingCart size={17} aria-hidden="true"/><span>{packageCount(plan.limits.monthlyOrders ?? 0)} sipariş / ay</span></li>
                            <li><presentation.Icon size={17} aria-hidden="true"/><span>{presentation.highlight ?? `${packageCount(plan.limits.staff)} kullanıcı`}</span></li>
                        </ul>
                        <span className={styles.selectControl} aria-hidden="true">{isSelected ? <><Check size={16}/> Seçili paket</> : <>Paketi seç <ArrowRight size={16}/></>}</span>
                    </div>
                </label>;
            })}
        </fieldset>

        <section className={styles.requestSection} aria-label="Paket değişikliği">
            <div className={styles.selectedProduct}><img src={selectedPresentation.image} alt="" width={960} height={640}/><div><h2>{selected.name} · {checkoutTerm === 'annual' ? 'Yıllık' : 'Aylık'}</h2><p>{checkoutNet > 0 ? 'Seçtiğiniz paket için ödeme özeti.' : 'Süresiz ücretsiz paket.'}</p></div></div>
            <dl className={styles.paymentTotals}><div><dt>KDV hariç tutar</dt><dd data-total="net">{checkoutMoney(checkoutNet)} TL</dd></div><div><dt>KDV (%{STORE_TOOL_OFFERS[0]!.vatBps / 100})</dt><dd data-total="vat">{checkoutMoney(checkoutVat)} TL</dd></div><div className={styles.grandTotal}><dt>KDV dahil toplam</dt><dd data-total="total">{checkoutMoney(checkoutGross)} TL</dd></div></dl>
            <div className={styles.requestActions}>
                {!canRequest ? <p>Mağaza sahibinizle paket seçeneklerini inceleyebilirsiniz.</p> : onlineCheckout ? <>
                    <PlatformCheckoutButton storeId={storeId!} kind="package" offerId={selected.id} term={checkoutTerm} disabled={!higher}/>
                    <small>Ödeme doğrulandığında paketiniz seçtiğiniz dönem için açılır. Otomatik yenileme yapılmaz.</small>
                </> : requestPending ? <p className={styles.requestSuccess} role="status">Talebiniz iletildi. Paket değişikliği ekibimiz tarafından değerlendirilecek.</p> : <>
                    <button type="button" className="button button-primary" disabled={!higher || busy || loading || loadError} onClick={() => void submit()}>{busy ? 'Talep iletiliyor…' : error ? 'Aynı talebi yeniden kontrol et' : 'Paket değişikliği talep et'}</button>
                    <small>Talep iletmek ödeme başlatmaz. Paketiniz ekibimizin onayından sonra değişir.</small>
                </>}
            </div>
            {error ? <p className={styles.requestError} role="alert">{error}</p> : null}
        </section>

        <section className={styles.comparisonSection} aria-labelledby="plan-comparison-title">
            <h2 id="plan-comparison-title">Paketleri karşılaştır</h2>
            <div className={styles.featureTable} role="region" aria-label="Paket özellik karşılaştırması" tabIndex={0}><table>
                <thead><tr><th scope="col">Özellik</th>{COMMERCIAL_PACKAGES.map(plan => <th scope="col" key={plan.id} className={selectedId === plan.id ? styles.selectedColumn : undefined}>{plan.name}</th>)}</tr></thead>
                <tbody>
                    {quotaRows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{COMMERCIAL_PACKAGES.map(plan => <td key={plan.id} className={selectedId === plan.id ? styles.selectedColumn : undefined}>{row.value(plan)}</td>)}</tr>)}
                    <tr><th scope="row">Mağaza, ödeme, kargo ve temel analizler</th>{COMMERCIAL_PACKAGES.map(plan => <td key={plan.id} className={selectedId === plan.id ? styles.selectedColumn : undefined}><Check size={16} aria-hidden="true"/><span className="sr-only">Var</span></td>)}</tr>
                    {CAPABILITIES.map(capability => <tr key={capability}><th scope="row">{COMMERCIAL_CAPABILITY_LABELS[capability]}</th>{COMMERCIAL_PACKAGES.map(plan => <td key={plan.id} className={selectedId === plan.id ? styles.selectedColumn : undefined}>{commercialPackageHasCapability(plan, capability) ? <><Check size={16} aria-hidden="true"/><span className="sr-only">Var</span></> : <span aria-label="Üst paketlerde">—</span>}</td>)}</tr>)}
                </tbody>
            </table></div>
            <p className={styles.terms}>Her paket bir mağaza içindir. Yapay zekâ, mesaj, ödeme ve kargo sağlayıcısı ücretleri kullanımınıza göre ayrıca oluşur.</p>
        </section>
    </div>;
}
