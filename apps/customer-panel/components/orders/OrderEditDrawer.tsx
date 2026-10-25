'use client';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { parseOrderEditIntent, parseOrderEditResult, type OrderAddress, type OrderEditIntent, type OrderEditLine, type OrderEditProduct, type OrderEditPreview, type OrderEditResult, type OrderEditWorkspace } from '@celebix/saas-contracts';
import { clearPendingEdit, orderEditUi, OrderEditUiError, persistPendingEdit, readPendingEdit, type OrderEditStorage, type OrderEditUiClient, type PendingOrderEdit } from '../../lib/order-edit-ui/client.ts';
import { OrderActionDialog } from './OrderActionDialog';
import styles from './OrderEditDrawer.module.css';
type AddressDraft = {
    recipientName: string;
    line1: string;
    line2: string;
    district: string;
    city: string;
    postalCode: string;
    country: string;
};
type DraftLine = {
    lineId: string;
    productId: string | null;
    variantId: string | null;
    productName: string;
    variantName: string | null;
    sku: string | null;
    quantity: string;
    price: string;
    discount: string;
};
type Draft = {
    expectedVersion: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    shippingAddress: AddressDraft | null;
    billingAddress: AddressDraft | null;
    shipping: string;
    discount: string;
    reason: string;
    lines: DraftLine[];
};
const MAX = 8000000000;
const SETTLEMENT_MESSAGE = 'Yeni tutar, daha önce uygulanan tahsilat iskontosundan düşük olamaz.';
const BLOCK: Readonly<Record<string, string>> = { provider_managed: 'Bu sipariş pazar yeri tarafından yönetiliyor. Ürün, fiyat ve durum değişikliklerini ilgili pazar yerinin satıcı panelinden yapın.', order_not_found: 'Sipariş bulunamadı.', currency_unsupported: 'Bu para birimindeki sipariş henüz düzenlenemiyor.', order_archived: 'Arşivlenmiş siparişi düzenlemek için önce arşivden çıkarın.', order_fulfilled: 'Kargolanmış, iptal edilmiş veya iade edilmiş sipariş düzenlenemiyor.', shipment_exists: 'Bu siparişin kargo işlemi var. Kargo durumu kesinleşmeden düzenleme yapılamaz.', return_exists: 'İade veya para iadesi bulunan sipariş düzenlenemiyor.', settlement_discount_exceeds_total: SETTLEMENT_MESSAGE, payment_in_progress_or_refunded: 'Siparişin ödeme işlemi sürüyor veya iade kaydı var. Önce ödeme durumunu kontrol edin.', payment_in_progress: 'Ödeme işlemi sürüyor. Ödeme tamamlandıktan sonra yeniden deneyin.', shipping_in_progress: 'Kargo işlemi sürüyor. Kargo durumunu kontrol edin.' };
const textAmount = (cents: number) => String((cents / 100).toFixed(2)).replace('.', ',');
function amount(value: string): number | null { if (!/^\d{1,10}(?:[.,]\d{1,2})?$/.test(value.trim()))
    return null; const [whole, fraction = ''] = value.trim().replace(',', '.').split('.'); const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0')); return Number.isSafeInteger(result) && result <= MAX ? result : null; }
function quantity(value: string): number | null { if (!/^\d{1,4}$/.test(value))
    return null; const result = Number(value); return result >= 1 && result <= 9999 ? result : null; }
const blankAddress = (): AddressDraft => ({ recipientName: '', line1: '', line2: '', district: '', city: '', postalCode: '', country: 'TR' });
const draftAddress = (value: Readonly<OrderAddress> | null): AddressDraft | null => value ? { ...blankAddress(), ...value } : null;
function readAddress(value: AddressDraft | null): Readonly<OrderAddress> | null { if (!value)
    return null; const optional = (['line2', 'district', 'postalCode'] as const).flatMap(key => value[key].trim() ? [[key, value[key].trim()]] : []); return { recipientName: value.recipientName.trim(), line1: value.line1.trim(), city: value.city.trim(), country: value.country.trim().toUpperCase(), ...Object.fromEntries(optional) }; }
function draftFrom(intent: OrderEditIntent, metadata: readonly OrderEditLine[] = []): Draft { return { expectedVersion: intent.expectedVersion, customerName: intent.customerName ?? '', customerEmail: intent.customerEmail ?? '', customerPhone: intent.customerPhone ?? '', shippingAddress: draftAddress(intent.shippingAddress), billingAddress: draftAddress(intent.billingAddress), shipping: textAmount(intent.shippingCents), discount: textAmount(intent.discountCents), reason: intent.reason, lines: intent.lines.map(line => { const meta = metadata.find(m => m.lineId === line.lineId); return { ...line, productName: meta?.productName ?? 'Sipariş ürünü', variantName: meta?.variantName ?? null, sku: meta?.sku ?? null, quantity: String(line.quantity), price: textAmount(line.unitPriceCents), discount: textAmount(line.discountCents) }; }) }; }
function workspaceDraft(value: OrderEditWorkspace): Draft { return draftFrom({ expectedVersion: value.version, customerName: value.customerName, customerEmail: value.customerEmail, customerPhone: value.customerPhone, shippingAddress: value.shippingAddress, billingAddress: value.billingAddress, shippingCents: value.shippingCents, discountCents: value.discountCents, reason: '', lines: value.lines }, value.lines); }
function totals(draft: Draft) { let subtotal = 0; for (const line of draft.lines) {
    const count = quantity(line.quantity), price = amount(line.price), discount = amount(line.discount);
    if (count === null || price === null || discount === null || count * price > MAX || discount > count * price)
        return null;
    subtotal += count * price - discount;
} const shipping = amount(draft.shipping), discount = amount(draft.discount); if (shipping === null || discount === null || discount > subtotal || subtotal + shipping > MAX || !draft.lines.length)
    return null; return { subtotal, shipping, discount, total: subtotal + shipping - discount }; }
function intentFrom(draft: Draft): OrderEditIntent { return parseOrderEditIntent({ expectedVersion: draft.expectedVersion, customerName: draft.customerName.trim() || null, customerEmail: draft.customerEmail.trim() || null, customerPhone: draft.customerPhone.trim() || null, shippingAddress: readAddress(draft.shippingAddress), billingAddress: readAddress(draft.billingAddress), shippingCents: amount(draft.shipping), discountCents: amount(draft.discount), reason: draft.reason.trim(), lines: draft.lines.map(line => ({ lineId: line.lineId, productId: line.productId, variantId: line.variantId, quantity: quantity(line.quantity), unitPriceCents: amount(line.price), discountCents: amount(line.discount) })) }); }
function errorMessage(failure: unknown) { return failure instanceof OrderEditUiError ? failure.message : 'Alanları ve tutarları kontrol ederek yeniden deneyin.'; }
function AddressFields({ kind, label, value, disabled, onChange }: {
    kind: string;
    label: string;
    value: AddressDraft | null;
    disabled: boolean;
    onChange: (value: AddressDraft | null) => void;
}) {
    const fields: readonly [
        keyof AddressDraft,
        string,
        number
    ][] = [['recipientName', 'Alıcı', 200], ['line1', 'Adres', 500], ['line2', 'Adres devamı', 500], ['district', 'İlçe', 100], ['city', 'İl', 100], ['postalCode', 'Posta kodu', 32], ['country', 'Ülke kodu', 2]];
    return <section className={styles.section}><div className={styles.sectionHeading}><h3>{label}</h3><label className={styles.check}><input type="checkbox" name={`${kind}-enabled`} checked={value !== null} disabled={disabled} onChange={event => onChange(event.target.checked ? blankAddress() : null)}/>Adres ekle</label></div>{value ? <div className={styles.fields}>{fields.map(([key, title, max]) => <label className={key === 'line1' || key === 'line2' ? styles.wide : undefined} key={key}><span>{title}{['recipientName', 'line1', 'city', 'country'].includes(key) ? ' *' : ''}</span><input name={`${kind}-${key}`} value={value[key]} required={['recipientName', 'line1', 'city', 'country'].includes(key)} maxLength={max} disabled={disabled} onChange={event => onChange({ ...value, [key]: event.target.value })}/></label>)}</div> : <p className={styles.muted}>Bu siparişte {label.toLocaleLowerCase('tr-TR')} yok.</p>}</section>;
}
export function OrderEditDrawer({ orderId, onClose, onSaved, client = orderEditUi, storage }: {
    orderId: string;
    onClose: () => void;
    onSaved: (result: OrderEditResult) => void;
    client?: OrderEditUiClient;
    storage?: OrderEditStorage;
}) {
    const [reload, setReload] = useState(0);
    const [workspace, setWorkspace] = useState<OrderEditWorkspace | null>(null), [draft, setDraft] = useState<Draft | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [pending, setPending] = useState<PendingOrderEdit | null>(null), [busy, setBusy] = useState(false), [journalBlocked, setJournalBlocked] = useState(false), [confirmClose, setConfirmClose] = useState(false), [preview, setPreview] = useState<OrderEditPreview | null>(null);
    const [replacing, setReplacing] = useState<string | null>(null), searchInput = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState(''), [products, setProducts] = useState<readonly OrderEditProduct[]>([]), [searchBusy, setSearchBusy] = useState(false), [searchError, setSearchError] = useState(''), [hasMore, setHasMore] = useState(false);
    const initialContacts = useRef<Pick<Draft, 'customerName' | 'customerEmail' | 'customerPhone'> | null>(null);
    const scope = useRef(0), busyRef = useRef(false), pendingRef = useRef<PendingOrderEdit | null>(null), baseline = useRef(''), journal = useRef<{
        storage: OrderEditStorage;
        hostname: string;
    } | null>(null), searchEpoch = useRef(0);
    const formId = useId();
    useEffect(() => {
        const current = ++scope.current, controller = new AbortController();
        let restored: PendingOrderEdit | null = null;
        setLoading(true);
        setDraft(null);
        setWorkspace(null);
        setPending(null);
        pendingRef.current = null;
        setPreview(null);
        setError('');
        setQuery('');
        setReplacing(null);
        setProducts([]);
        setJournalBlocked(false);
        setConfirmClose(false);
        busyRef.current = false;
        setBusy(false);
        try {
            journal.current = { storage: storage ?? window.sessionStorage, hostname: window.location.hostname };
            restored = readPendingEdit(journal.current.storage, journal.current.hostname, orderId);
        }
        catch {
            setJournalBlocked(true);
            setError('Önceki kayıt bilgisi bu tarayıcıda doğrulanamadı. Yeni kayıt başlatmayın; bu pencereyi kapatıp destek alın.');
        }
        void client.workspace(orderId, controller.signal).then(value => { if (current !== scope.current)
            return; setWorkspace(value); initialContacts.current = { customerName: value.customerName ?? '', customerEmail: value.customerEmail ?? '', customerPhone: value.customerPhone ?? '' }; const next = restored ? draftFrom(restored.intent, value.lines) : workspaceDraft(value); setDraft(next); baseline.current = JSON.stringify(next); }).catch(failure => { if (current !== scope.current || controller.signal.aborted)
            return; if (restored)
            setDraft(draftFrom(restored.intent)); setError(!restored && failure instanceof OrderEditUiError && failure.code === 'unavailable' ? 'Sipariş bilgileri yüklenemedi. Yeniden deneyin.' : errorMessage(failure)); }).finally(() => { if (current === scope.current) {
            setLoading(false);
            setPending(restored);
            pendingRef.current = restored;
        } });
        return () => { scope.current++; searchEpoch.current++; controller.abort(); };
    }, [orderId, client, storage, reload]);
    const providerManaged = workspace?.blockReason === 'provider_managed';
    const showEditForm = !providerManaged || pending !== null;
    const locked = busy || pending !== null || journalBlocked || !workspace?.canEdit;
    useEffect(() => { const epoch = ++searchEpoch.current, controller = new AbortController(); setProducts([]); setSearchError(''); setHasMore(false); setSearchBusy(false); if (!query.trim() || locked || loading)
        return () => controller.abort(); setSearchBusy(true); const timer = setTimeout(() => { void client.products(orderId, query.trim(), controller.signal).then(value => { if (epoch !== searchEpoch.current || controller.signal.aborted)
        return; setProducts(value.items); setHasMore(value.hasMore); }).catch(failure => { if (epoch === searchEpoch.current && !controller.signal.aborted)
        setSearchError(errorMessage(failure)); }).finally(() => { if (epoch === searchEpoch.current)
        setSearchBusy(false); }); }, 300); return () => { clearTimeout(timer); controller.abort(); }; }, [query, locked, loading, client, orderId]);
    const dirty = draft !== null && JSON.stringify(draft) !== baseline.current;
    useEffect(() => { if (!dirty && !busy && !pending)
        return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty, busy, pending]);
    function close() { if (busyRef.current && !pendingRef.current)
        return; if (pendingRef.current) {
        onClose();
        return;
    } if (dirty) {
        setConfirmClose(true);
        return;
    } onClose(); }
    function update(change: Partial<Draft>) { if (locked)
        return; setDraft(current => current ? { ...current, ...change } : current); setPreview(null); setConfirmClose(false); }
    function updateLine(lineId: string, change: Partial<DraftLine>) { if (!draft)
        return; update({ lines: draft.lines.map(line => line.lineId === lineId ? { ...line, ...change } : line) }); }
    function addProduct(product: OrderEditProduct) { if (!draft || locked)
        return; if (replacing) {
        const old = draft.lines.find(line => line.lineId === replacing);
        if (old && old.variantId !== product.variantId)
            update({ lines: draft.lines.map(line => line.lineId === replacing ? { lineId: client.newId(), productId: product.productId, variantId: product.variantId, productName: product.productName, variantName: product.variantName, sku: product.sku, quantity: quantity(line.quantity) ? line.quantity : '1', price: textAmount(product.unitPriceCents), discount: '0,00' } : line) });
        setReplacing(null);
        setQuery('');
        return;
    } const existing = draft.lines.find(line => line.variantId === product.variantId); if (existing) {
        const count = quantity(existing.quantity);
        if (count === null || count >= 9999) {
            setError('Ürün adedini kontrol edin.');
            return;
        }
        updateLine(existing.lineId, { quantity: String(count + 1) });
    }
    else {
        if (draft.lines.length >= 100) {
            setError('Sipariş en fazla 100 ürün satırı içerebilir.');
            return;
        }
        update({ lines: [...draft.lines, { lineId: client.newId(), productId: product.productId, variantId: product.variantId, productName: product.productName, variantName: product.variantName, sku: product.sku, quantity: '1', price: textAmount(product.unitPriceCents), discount: '0,00' }] });
    } setQuery(''); }
    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busyRef.current || journalBlocked || !draft || !pendingRef.current && !workspace?.canEdit)
            return;
        if (!pendingRef.current && workspace) {
            const estimated = totals(draft);
            if (estimated && estimated.total < workspace.finance.settlementDiscountCents) {
                setError(SETTLEMENT_MESSAGE);
                return;
            }
        }
        busyRef.current = true;
        setBusy(true);
        setError('');
        setConfirmClose(false);
        const current = scope.current;
        try {
            let operation = pendingRef.current;
            if (!operation) {
                const fresh = await client.workspace(orderId);
                if (current !== scope.current)
                    return;
                if (fresh.version !== draft.expectedVersion)
                    throw new OrderEditUiError('version_conflict', 409);
                if (!fresh.canEdit) {
                    setWorkspace(fresh);
                    throw new OrderEditUiError('invalid_transition', 409, fresh.blockReason ?? undefined);
                }
                const contactDraft = { ...draft };
                for (const key of ['customerName', 'customerEmail', 'customerPhone'] as const)
                    if (draft[key] === initialContacts.current?.[key]) {
                        contactDraft[key] = fresh[key] ?? '';
                        initialContacts.current = { ...initialContacts.current, [key]: contactDraft[key] };
                    }
                setDraft(contactDraft);
                const intent = intentFrom(contactDraft), calculated = await client.preview(orderId, intent);
                if (current !== scope.current)
                    return;
                setPreview(calculated);
                operation = { schemaVersion: 1, orderId, intent, operationId: client.newId(), previewFingerprint: calculated.fingerprint };
                const target = journal.current;
                if (!target)
                    throw Error('journal');
                try {
                    persistPendingEdit(target.storage, target.hostname, orderId, operation);
                }
                catch {
                    setError('Kayıt bilgisi bu tarayıcıda güvenle saklanamadı. Hiçbir değişiklik gönderilmedi; tarayıcı depolamasını kontrol edip yeniden deneyin.');
                    return;
                }
                pendingRef.current = operation;
                setPending(operation);
            }
            let result: OrderEditResult;
            try {
                result = parseOrderEditResult(await client.apply(orderId, { intent: operation.intent, operationId: operation.operationId, previewFingerprint: operation.previewFingerprint }));
                if (result.orderId !== orderId || result.operationId !== operation.operationId || result.preview.fingerprint !== operation.previewFingerprint || result.version !== operation.intent.expectedVersion + 1)
                    throw Error('receipt');
            }
            catch (failure) {
                if (failure instanceof OrderEditUiError)
                    throw failure;
                throw new OrderEditUiError('unavailable', 503);
            }
            if (current !== scope.current)
                return;
            try {
                if (journal.current)
                    clearPendingEdit(journal.current.storage, journal.current.hostname, orderId);
            }
            catch { /* Confirmed result remains safe to replay if storage cleanup fails. */ }
            pendingRef.current = null;
            setPending(null);
            baseline.current = JSON.stringify(draft);
            onSaved(result);
        }
        catch (failure) {
            if (current !== scope.current)
                return;
            let message = !pendingRef.current && failure instanceof OrderEditUiError && failure.code === 'unavailable' ? 'Bilgiler kontrol edilemedi. Henüz kayıt gönderilmedi; yeniden deneyin.' : errorMessage(failure);
            if (failure instanceof OrderEditUiError && failure.knownSafe && pendingRef.current) {
                try {
                    if (!journal.current)
                        throw Error('journal');
                    clearPendingEdit(journal.current.storage, journal.current.hostname, orderId);
                    pendingRef.current = null;
                    setPending(null);
                }
                catch {
                    message = 'Kayıt durumu bu tarayıcıda temizlenemedi. Bilgiler korunuyor; aynı kaydı doğrulayın.';
                }
            }
            setError(message);
        }
        finally {
            if (current === scope.current) {
                busyRef.current = false;
                setBusy(false);
            }
        }
    }
    const local = useMemo(() => draft ? totals(draft) : null, [draft]);
    const currency = workspace?.currency ?? 'TRY', money = (value: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(value / 100);
    const currentFinance = preview ?? workspace?.finance, obligation = local && currentFinance ? Math.max(0, local.total - currentFinance.settlementDiscountCents) : null, due = obligation === null || !currentFinance ? null : Math.max(0, obligation - currentFinance.collectedCents), refund = obligation === null || !currentFinance ? null : Math.max(0, currentFinance.collectedCents - obligation);
    const settlementBlocked = !!local && !!currentFinance && local.total < currentFinance.settlementDiscountCents;
    const canSave = !!draft && !journalBlocked && !busy && (pending !== null || workspace?.canEdit === true && local !== null && !settlementBlocked && !!draft.reason.trim());
    return <OrderActionDialog open title="Siparişi düzenle" className={styles.drawer} busy={busy && !pending} onClose={close} footer={<><span className={styles.footerContext}>{workspace?.orderNumber ?? 'Sipariş'}{pending ? ' · Kayıt doğrulaması bekliyor' : ''}</span><button type="button" className={styles.secondary} disabled={busy && !pending} onClick={close}>Vazgeç</button>{draft && showEditForm ? <button className={styles.primary} type="submit" form={formId} disabled={!canSave}>{busy ? pending ? 'Doğrulanıyor…' : 'Kontrol ediliyor…' : pending ? 'Kaydı doğrula' : 'Kaydet'}</button> : null}</>}>
  {loading ? <div className={styles.loading} role="status"><p>Sipariş bilgileri yükleniyor…</p><div /><div /><div /></div> : null}
  {error ? <p className={styles.error} role="alert">{error}</p> : null}
  {!loading && !draft ? <button type="button" className={styles.secondary} onClick={() => setReload(value => value + 1)}>Yeniden dene</button> : null}
  {pending ? <p className={styles.notice} role="status">Son kayıt sonucu doğrulanmalı. Bilgiler korunuyor; yeni işlem başlatmadan aynı kaydı doğrulayın.</p> : null}
  {workspace && !workspace.canEdit && !pending ? <p className={styles.notice} role="status">{BLOCK[workspace.blockReason ?? ''] ?? 'Bu sipariş şu anda düzenlenemiyor. Siparişin ödeme ve kargo durumunu kontrol edin.'}</p> : null}
  {confirmClose ? <div className={styles.closeGuard} role="alert"><strong>Kaydedilmemiş değişiklikler var.</strong><p>Çıkarsanız bu düzenlemeler kaybolur.</p><div><button className={styles.secondary} type="button" onClick={() => setConfirmClose(false)}>Düzenlemeye devam et</button><button className={styles.secondary} type="button" onClick={onClose}>Değişiklikleri bırak</button></div></div> : null}
  {!loading && draft && showEditForm ? <form id={formId} data-order-edit className={styles.form} onSubmit={save}>
   <div className={styles.main}>
    <section className={styles.section}><div className={styles.sectionHeading}><h3>Ürünler</h3><span className={styles.muted}>{draft.lines.length} satır</span></div>
     <label className={styles.search}><span>{replacing ? "Seçilen satırın yeni ürünü veya varyantı" : "Ürün veya varyant ekle"}</span><div><Search size={16} aria-hidden="true"/><input ref={searchInput} name="productSearch" value={query} maxLength={100} disabled={locked} onChange={event => setQuery(event.target.value)} autoComplete="off" placeholder="Ürün adı veya SKU ara"/></div></label>
     {replacing ? <p className={styles.muted}>Yeni seçilen ürün bu satırın yerini alır. <button type="button" className={styles.textButton} onClick={() => { setReplacing(null); setQuery(''); }}>Değiştirmeyi iptal et</button></p> : null}
     {searchBusy ? <p className={styles.muted} role="status">Ürünler aranıyor…</p> : null}{searchError ? <p role="alert" className={styles.error}>{searchError}</p> : null}
     {products.length ? <ul className={styles.products} aria-label="Bulunan ürün ve varyantlar">{products.map(product => <li key={product.variantId}><button type="button" disabled={locked} onClick={() => addProduct(product)}><span><strong>{product.productName}</strong><small>{product.variantName}{product.sku ? ` · ${product.sku}` : ''}</small></span><span>{money(product.unitPriceCents)}<Plus size={16} aria-hidden="true"/></span></button></li>)}</ul> : query.trim() && !searchBusy && !searchError && !locked ? <p className={styles.muted}>Eşleşen ürün yok.</p> : null}
     {hasMore ? <p className={styles.muted}>Daha fazla sonuç var. Ürün adını veya SKU’yu daraltın.</p> : null}
     <div className={styles.lines}>{draft.lines.map(line => <article className={styles.line} key={line.lineId}><div className={styles.lineHeading}><div><strong>{line.productName}</strong><button type="button" className={styles.textButton} disabled={locked} onClick={() => { setReplacing(line.lineId); setQuery(line.productName.slice(0, 100)); searchInput.current?.focus(); }}>Ürün/varyant değiştir</button><small>{[line.variantName, line.sku].filter(Boolean).join(' · ') || 'Mevcut sipariş satırı'}</small></div><button className={styles.icon} type="button" aria-label={`${line.productName} satırını kaldır`} disabled={locked || draft.lines.length <= 1} onClick={() => update({ lines: draft.lines.filter(row => row.lineId !== line.lineId) })}><Trash2 size={18} aria-hidden="true"/></button></div><div className={styles.lineFields}><label><span>Adet</span><input name={`quantity-${line.lineId}`} data-line-quantity inputMode="numeric" value={line.quantity} maxLength={4} disabled={locked} onChange={event => updateLine(line.lineId, { quantity: event.target.value })}/></label><label><span>Birim fiyat</span><input name={`price-${line.lineId}`} data-line-price inputMode="decimal" value={line.price} disabled={locked || workspace?.canEditPrices !== true} onChange={event => updateLine(line.lineId, { price: event.target.value })}/></label><label><span>Satır indirimi</span><input name={`lineDiscount-${line.lineId}`} inputMode="decimal" value={line.discount} disabled={locked} onChange={event => updateLine(line.lineId, { discount: event.target.value })}/></label></div></article>)}</div>
     {workspace?.canEditPrices === false ? <p className={styles.muted}>Birim fiyatlar yetkiniz doğrultusunda korunur.</p> : null}<p className={styles.muted}>Toplam indirim sınırı: %{(workspace?.discountLimitBps ?? 0) / 100}. Stok ve yetki kayıt sırasında yeniden kontrol edilir.</p>
    </section>
    <section className={styles.section}><h3>Müşteri bilgileri</h3><p className={styles.muted}>Bu siparişin iletişim kopyası güncellenir; müşteri kartı değişmez.</p><div className={styles.fields}>{(['customerName', 'customerEmail', 'customerPhone'] as const).map((key, index) => <label key={key} className={key === 'customerName' ? styles.wide : undefined}><span>{['Ad soyad', 'E-posta', 'Telefon'][index]}</span><input name={key} type={key === 'customerEmail' ? 'email' : key === 'customerPhone' ? 'tel' : 'text'} maxLength={key === 'customerEmail' ? 320 : key === 'customerPhone' ? 32 : 201} value={draft[key]} disabled={locked} onChange={event => update({ [key]: event.target.value })}/></label>)}</div></section>
    <AddressFields kind="shipping" label="Teslimat adresi" value={draft.shippingAddress} disabled={locked} onChange={shippingAddress => update({ shippingAddress })}/>
    <AddressFields kind="billing" label="Fatura adresi" value={draft.billingAddress} disabled={locked} onChange={billingAddress => update({ billingAddress })}/>
   </div>
   <aside className={styles.summary}><h3>Tutar özeti</h3><div className={styles.fields}><label><span>Kargo tutarı</span><input name="shippingCents" inputMode="decimal" value={draft.shipping} disabled={locked} onChange={event => update({ shipping: event.target.value })}/></label><label><span>Sipariş indirimi</span><input name="discountCents" inputMode="decimal" value={draft.discount} disabled={locked} onChange={event => update({ discount: event.target.value })}/></label></div>
    <dl className={styles.totals}><div><dt>Ürünler (satır indirimi sonrası)</dt><dd>{local ? money(local.subtotal) : '—'}</dd></div><div><dt>Kargo</dt><dd>{local ? money(local.shipping) : '—'}</dd></div><div><dt>Sipariş indirimi</dt><dd>{local ? money(local.discount) : '—'}</dd></div><div className={styles.total}><dt>Yeni sipariş tutarı</dt><dd>{local ? money(local.total) : '—'}</dd></div><div><dt>Tahsil edilen</dt><dd>{currentFinance ? money(currentFinance.collectedCents) : '—'}</dd></div><div><dt>Tahsilat indirimi</dt><dd>{currentFinance ? money(currentFinance.settlementDiscountCents) : '—'}</dd></div><div><dt>Kalan borç</dt><dd data-edit-due>{due === null ? '—' : money(due)}</dd></div><div><dt>İade edilecek</dt><dd data-edit-refund>{refund === null ? '—' : money(refund)}</dd></div></dl>
    <p className={styles.muted}>Bu düzenleme tahsilat veya para iadesi yapmaz. Kalan borç ve iade edilecek tutar ayrı takip edilir.</p><label className={styles.reason}><span>Düzenleme nedeni *</span><textarea name="reason" rows={3} maxLength={500} required value={draft.reason} disabled={locked} onChange={event => update({ reason: event.target.value })}/></label>{settlementBlocked && !pending ? <p className={styles.error} role="alert">{SETTLEMENT_MESSAGE}</p> : null}{!local ? <p className={styles.error}>Adet, fiyat ve indirim tutarlarını kontrol edin.</p> : null}
   </aside>
  </form> : null}
 </OrderActionDialog>;
}
