"use client";
import { createDefaultStoreEngagementConfig, parseStoreEngagementConfig, type StoreEngagementCampaign, type StoreEngagementCampaignKind, type StoreEngagementConfig, type StoreEngagementImageReference, type PromotionAdminListItem } from '@celebix/saas-contracts';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { PanelPageHeader, PanelPageShell } from '@/components/panel/PanelPageShell';
import { usePanelChromeModel } from '@/components/panel/PanelLayoutClient';
import { scopedStoreEngagementApi, type CampaignInput } from '@/lib/store-engagement-ui/client';
import { promotionApi, promotionErrorMessage } from '@/lib/promotion-ui/client';
import { createPromotionDraft, updatePromotionDraft } from '@/lib/promotion-ui/model';
import { Monitor, ShoppingBag, Smartphone } from 'lucide-react';
import { storefrontDesignApi } from '@/lib/storefront-design-ui/client';
import { DesignSettingsModal } from '../settings/design/DesignSettingsDrawer';
import { DesignImageField, type DesignImageOption } from '../settings/design/DesignImageField';
import styles from './popup-studio.module.css';
export interface EngagementPermissions {
    readonly canManage: boolean;
    readonly canReadCoupons?: boolean;
    readonly canCreateCoupon?: boolean;
    readonly timezone?: string;
}
const TABS = [['design', 'Tasarım'], ['content', 'İçerik'], ['visibility', 'Gösterim'], ['coupon', 'Kupon']] as const;
const CART_TABS = [['content', 'İçerik'], ['design', 'Görünüm'], ['visibility', 'Gösterim'], ['coupon', 'Kupon']] as const;
type Tab = (typeof TABS)[number][0];
const TEMPLATES = [['minimal', 'Sade'], ['image_left', 'Görselli'], ['discount', 'Kupon']] as const;
const keyOf = (image?: StoreEngagementImageReference) => image ? (image.kind === 'media' ? 'media:' + image.mediaId : 'asset:' + image.assetId) : '';
const referenceOf = (key: string): StoreEngagementImageReference | undefined => key.startsWith('media:') ? {
    kind: 'media', mediaId: key.slice(6)
} : key.startsWith('asset:') ? {
    kind: 'asset', assetId: key.slice(6)
} : undefined;
type Coupon = Readonly<{
    id: string;
    name: string;
    code: string;
}>;
function code(error: unknown) {
    return error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unavailable';
}
function message(error: unknown) {
    return error instanceof Error ? error.message : 'İşlem tamamlanamadı. Tekrar deneyin.';
}
function title(kind: StoreEngagementCampaignKind) {
    return kind === 'popup' ? 'Popup' : 'Sepet yakalama';
}
export function EngagementPreview({ config, imageUrl, couponCode, kind, mobile = false }: Readonly<{
    config: StoreEngagementConfig;
    imageUrl?: string;
    couponCode?: string;
    kind: StoreEngagementCampaignKind;
    mobile?: boolean;
}>) {
    return <div className={[styles.previewFrame, mobile ? styles.mobilePreview : '', kind === 'cart_capture' ? styles.cartPreviewFrame : ''].filter(Boolean).join(' ')} data-engagement-preview aria-label="Canlı önizleme">
    {kind === 'cart_capture' ? <div className={styles.storePreviewHeader} aria-hidden="true"><span /><i /><ShoppingBag size={16} /></div> : null}
    <div className={styles.previewBackdrop}>
    <article className={styles.previewCard + ' ' + styles[config.template]}>
    <span className={styles.previewClose} aria-hidden="true">
    ×
    </span>
    {config.template === 'image_left' ? <div className={styles.previewImage}>
    {imageUrl ? <img src={imageUrl} alt=""/> : <span>
    Görsel
    </span>}
    </div> : null}
    <div className={styles.previewCopy}>
    {config.template === 'discount' ? <span className={styles.previewBadge}>
    Size özel fırsat
    </span> : null}
    <h3>
    {config.heading || 'Başlık'}
    </h3>
    {config.body ? <p>
    {config.body}
    </p> : null}
    {couponCode ? <strong className={styles.couponCode}>
    {couponCode}
    </strong> : null}
        {kind === 'cart_capture' ? <>
        <span className={styles.previewInput}>
        {config.collectMode === 'phone' ? 'Telefon numaranız' : config.collectMode === 'email' ? 'E-posta adresiniz' : 'E-posta veya telefon'}
        </span>
        {config.marketingOptInLabel ? <small>
        □
        {config.marketingOptInLabel}
        </small> : null}
        </> : null}
    <span className={styles.previewButton}>
    {config.buttonLabel || 'Devam et'}
    </span>
    {kind === 'cart_capture' ? <span className={styles.previewLater}>
    Şimdi değil
    </span> : null}
    </div>
    </article>
    </div>
    </div>;
}
export function EngagementEditor({ kind, campaign, recoveryInput, canManage, canReadCoupons = false, canCreateCoupon = false, timezone = 'Europe/Istanbul', onSaved, onClose, returnFocusRef }: EngagementPermissions & Readonly<{
    kind: StoreEngagementCampaignKind;
    campaign: StoreEngagementCampaign | null;
    recoveryInput?: CampaignInput;
    onSaved: (campaign: StoreEngagementCampaign) => void;
    onClose: () => void;
    returnFocusRef: RefObject<HTMLElement | null>;
}>) {
    const { storeSlug } = usePanelChromeModel(), api = useMemo(() => scopedStoreEngagementApi(storeSlug), [storeSlug]);
    const initial = useRef<CampaignInput>(recoveryInput??{
        ...(campaign ? {
            campaignId: campaign.id, expectedVersion: campaign.version
        } : {}), kind, name: campaign?.name ?? (kind === 'popup' ? 'Yeni popup' : 'Sepet yakalama'), enabled: campaign?.enabled ?? true, config: campaign?.config ?? createDefaultStoreEngagementConfig(kind)
    });
    const tabs = kind === 'cart_capture' ? CART_TABS : TABS;
    const [draft, setDraft] = useState(initial.current), [tab, setTab] = useState<Tab>(kind === 'cart_capture' ? 'content' : 'design'), [mobile, setMobile] = useState(false), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(Boolean(recoveryInput)), [conflict, setConflict] = useState(false), [error, setError] = useState(''), [discard, setDiscard] = useState(false);
    const [images, setImages] = useState<readonly DesignImageOption[]>([]), [imageError, setImageError] = useState(''), [imageRevision, setImageRevision] = useState(0);
    const [couponItems, setCouponItems] = useState<readonly PromotionAdminListItem[]>([]), [coupon, setCoupon] = useState<Coupon | null>(null), [couponBusy, setCouponBusy] = useState(false), [couponError, setCouponError] = useState(''), [couponCursor, setCouponCursor] = useState<string | null>(null), [couponCode, setCouponCode] = useState(''), [percentage, setPercentage] = useState('3'), [couponUnknown, setCouponUnknown] = useState(false);
    const couponIntent = useRef<ReturnType<typeof createPromotionDraft> | null>(null), couponGeneration = useRef(0), writing = useRef(false);
    const dirty = JSON.stringify(draft) !== JSON.stringify(initial.current), locked = !canManage || busy || uncertain || conflict || couponBusy || couponUnknown;
    const change = useCallback((patch: Partial<CampaignInput>) => {
        if (locked)
            return;
        setDraft(value => ({
            ...value, ...patch
        }));
        setError('');
        setDiscard(false);
    }, [locked]);
    const configChange = (patch: Partial<StoreEngagementConfig>) => change({
        config: {
            ...draft.config, ...patch
        }
    });
    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        setImageError('');
        storefrontDesignApi.editor({
            signal: controller.signal
        }).then(workspace => {
            if (active)
                setImages(workspace.media.map(option => ({
                    key: keyOf(option.reference), url: option.url, altText: option.altText, width: option.width, height: option.height
                })));
        }).catch(() => {
            if (active)
                setImageError('Görsel kütüphanesi yüklenemedi.');
        });
        return () => {
            active = false;
            controller.abort();
        };
    }, [imageRevision]);
    useEffect(() => {
        if (!canReadCoupons)
            return;
        const controller = new AbortController();
        let active = true;
        promotionApi.list({
            effectiveStatuses: ['active'], triggerKinds: ['code']
        }, controller.signal).then(result => {
            if (active) {
                setCouponItems(result.items);
                setCouponCursor(result.nextCursor);
            }
        }).catch(() => {
            if (active)
                setCouponError('Kuponlar yüklenemedi.');
        });
        return () => {
            active = false;
            controller.abort();
        };
    }, [canReadCoupons]);
    useEffect(() => {
        if (!campaign?.config.promotionId || !canReadCoupons)
            return;
        let active = true;
        promotionApi.detail(campaign.config.promotionId).then(detail => {
            if (active && detail.status === 'active' && detail.ruleDocument.trigger.kind === 'code' && detail.ruleDocument.trigger.codes[0])
                setCoupon({
                    id: detail.id, name: detail.name, code: detail.ruleDocument.trigger.codes[0]
                });
        }).catch(() => {
            if (active)
                setCouponError('Bağlı kupon yüklenemedi. Seçim korunuyor.');
        });
        return () => {
            active = false;
        };
    }, [campaign?.config.promotionId, canReadCoupons]);
    useEffect(() => {
        if (!dirty && !busy && !uncertain && !couponUnknown)
            return;
        const unload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', unload);
        return () => window.removeEventListener('beforeunload', unload);
    }, [dirty, busy, uncertain, couponUnknown]);
    const requestClose = useCallback(() => {
        if (busy || uncertain || couponBusy || couponUnknown) {
            setError('Önce aynı bilgilerle işlemin sonucunu doğrulayın.');
            return;
        }
        if (dirty) {
            setDiscard(true);
            return;
        }
        onClose();
    }, [busy, uncertain, couponBusy, couponUnknown, dirty, onClose]);
    async function apply() {
        if (!canManage || busy || writing.current || conflict || couponBusy || couponUnknown)
            return;
        let payload: CampaignInput;
        try {
            payload = {
                ...draft, name: draft.name.trim(), config: parseStoreEngagementConfig({
                    ...draft.config, heading: draft.config.heading.trim(), body: draft.config.body.trim().replace(/[\r\n]+/g, ' '), buttonLabel: draft.config.buttonLabel.trim(), ...(draft.config.marketingOptInLabel ? {
                        marketingOptInLabel: draft.config.marketingOptInLabel.trim()
                    } : {})
                })
            };
            if (!payload.name)
                throw Error();
        }
        catch {
            setError('Başlık, buton metni ve gösterim bilgilerini tamamlayın.');
            setTab('content');
            window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[name="engagement-heading"]')?.focus());
            return;
        }
        writing.current = true;
        setBusy(true);
        setError('');
        try {
            const saved = await api.save(payload);
            setUncertain(false);
            onSaved(saved);
        }
        catch (reason) {
            setError(message(reason));
            if (['unavailable', 'operation_mismatch'].includes(code(reason)))
                setUncertain(true);
            if (code(reason) === 'version_conflict')
                setConflict(true);
        }
        finally {
            writing.current = false;
            setBusy(false);
        }
    }
    async function selectCoupon(id: string) {
        if (locked)
            return;
        if (!id) {
            const { promotionId: _, ...config } = draft.config;
            change({
                config
            });
            setCoupon(null);
            return;
        }
        const generation = ++couponGeneration.current;
        setCouponBusy(true);
        setCouponError('');
        try {
            const detail = await promotionApi.detail(id);
            if (generation !== couponGeneration.current)
                return;
            if (detail.status !== 'active' || detail.ruleDocument.trigger.kind !== 'code' || !detail.ruleDocument.trigger.codes[0])
                throw Error('Kupon şu anda kullanılamıyor.');
            if (detail.ruleDocument.audience.mode !== 'everyone' || detail.ruleDocument.limits.perCustomerUsage !== null)
                throw Error('Bu araçta herkesin kullanabildiği, kişi başı sınırı olmayan bir kupon seçin.');
            setCoupon({
                id: detail.id, name: detail.name, code: detail.ruleDocument.trigger.codes[0]
            });
            setDraft(value => ({
                ...value, config: {
                    ...value.config, promotionId: detail.id
                }
            }));
        }
        catch (reason) {
            setCouponError(message(reason));
        }
        finally {
            if (generation === couponGeneration.current)
                setCouponBusy(false);
        }
    }
    async function createCoupon() {
        if (!canManage || !canCreateCoupon || busy || writing.current || couponBusy || uncertain || conflict)
            return;
        const codeValue = couponCode.trim().toUpperCase(), percent = Number(percentage.replace(',', '.'));
        if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(codeValue) || !Number.isFinite(percent) || percent <= 0 || percent > 100 || !Number.isInteger(percent * 100)) {
            setCouponError('Kupon kodunu ve indirim yüzdesini kontrol edin.');
            return;
        }
        const intent = couponIntent.current ?? updatePromotionDraft(createPromotionDraft('influencer_code', timezone), {
            name: title(kind) + ' · ' + codeValue, codeInput: codeValue, benefit: {
                kind: 'percentage', percentageBps: Math.round(percent * 100)
            }, salesChannels: ['storefront'], perCustomerUsage: null
        });
        couponIntent.current = intent;
        writing.current = true;
        setCouponBusy(true);
        setCouponError('');
        try {
            const result = await promotionApi.apply(intent);
            if (result.kind !== 'saved') {
                couponIntent.current = null;
                setCouponUnknown(false);
                setCouponError(result.kind === 'conflict' ? result.message : result.kind === 'version_conflict' ? 'Kupon değişti. Güncel kaydı kontrol edin.' : 'Kupon uygulanamadı. Bilgileri kontrol edin.');
                return;
            }
            if (result.promotion.status !== 'active' || result.promotion.ruleDocument.trigger.kind !== 'code' || !result.promotion.ruleDocument.trigger.codes[0])
                throw Error('promotion_unavailable');
            setCoupon({
                id: result.promotion.id, name: result.promotion.name, code: result.promotion.ruleDocument.trigger.codes[0]
            });
            setDraft(value => ({
                ...value, config: {
                    ...value.config, promotionId: result.promotion.id
                }
            }));
            setCouponUnknown(false);
            couponIntent.current = null;
        }
        catch (reason) {
            const errorCode = reason instanceof Error ? reason.message : '';
            setCouponError(promotionErrorMessage(errorCode));
            if (couponIntent.current && !['invalid_input', 'unauthenticated', 'membership_denied', 'store_inactive', 'feature_not_enabled', 'origin_denied', 'not_found', 'conflict', 'code_conflict', 'invalid_reference', 'invalid_code', 'not_eligible', 'promotion_limit_reached', 'publish_blocked'].includes(errorCode))
                setCouponUnknown(true);
            else {
                setCouponUnknown(false);
                couponIntent.current = null;
            }
        }
        finally {
            writing.current = false;
            setCouponBusy(false);
        }
    }
    const closeHandler = useRef(requestClose);
    closeHandler.current = requestClose;
    const closeModal = useCallback(() => closeHandler.current(), []);
    const selectedImage = images.find(image => image.key === keyOf(draft.config.image));
    return <DesignSettingsModal open surface={{
        label: campaign ? title(kind) + ' düzenle' : title(kind) + ' ekle', hint: 'Değişiklikleri Uygula ile kaydedin.'
    }} className={kind === 'cart_capture' ? styles.cartModal : undefined} returnFocusRef={returnFocusRef} onClose={closeModal} onApply={() => void apply()} applying={busy || couponBusy} applyDisabled={!canManage || conflict || couponUnknown}>
    <div className={kind === 'cart_capture' ? styles.cartEditor : undefined}>
    {api.hasUnresolved() ? <p className={styles.notice} role="status">
    Önceki kayıt sonucu belirsiz. Korunan bilgilerle Uygula düğmesine basarak doğrulayın.
    </p> : null}
    {error ? <p className={styles.error} role="alert">
    {error}
    {conflict ? ' Girişleriniz korunuyor. Vazgeç ile kapatıp güncel kaydı yükleyebilirsiniz.' : ''}
    </p> : null}
        {discard ? <div className={styles.notice} role="alert">
        <p>
        Değişiklikler kaydedilmedi.
        </p>
        <button type="button" className="button button-secondary" onClick={() => setDiscard(false)}>
        Düzenlemeye devam et
        </button>
        <button type="button" className="button button-text" onClick={onClose}>
        Değişiklikleri bırak
        </button>
        </div> : null}
    <div className={styles.editorTop}>
    <label className={styles.field}>
    Kayıt adı
    <input name="engagement-name" maxLength={160} value={draft.name} disabled={locked} onChange={event => change({
        name: event.currentTarget.value
    })}/>
    </label>
    <label className={styles.enabled}>
    <input name="engagement-enabled" type="checkbox" role="switch" checked={draft.enabled} disabled={locked} onChange={event => change({
        enabled: event.currentTarget.checked
    })}/>
    {kind === 'cart_capture' ? <span className={styles.switchTrack} aria-hidden="true" /> : null}
    {draft.enabled ? 'Açık' : 'Kapalı'}
    </label>
    </div>
    <div className={styles.tabs} role="tablist" aria-label={title(kind) + ' ayarları'}>
        {tabs.map(([key, label]) => <button key={key} id={'engagement-tab-' + key} type="button" role="tab" aria-selected={tab === key} aria-controls={'engagement-panel-' + key} tabIndex={tab === key ? 0 : -1} onKeyDown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
                    return;
                event.preventDefault();
                const index = tabs.findIndex(([item]) => item === tab), next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
                setTab(tabs[next]![0]);
                document.getElementById('engagement-tab-' + tabs[next]![0])?.focus();
            }} onClick={() => setTab(key)}>
        {label}
        </button>)}
    </div>
    <div className={styles.editorGrid}>
    <section id={'engagement-panel-' + tab} role="tabpanel" aria-labelledby={'engagement-tab-' + tab} className={styles.fields}>
        {tab === 'design' ? <>
        <fieldset className={styles.templates} disabled={locked}>
        <legend>
        Düzen
        </legend>
            {TEMPLATES.map(([value, label]) => <label key={value} className={draft.config.template === value ? styles.selectedTemplate : ''}>
            <input type="radio" name="engagement-template" value={value} checked={draft.config.template === value} onChange={() => configChange({
                template: value
            })}/>
            <span className={styles.templateSketch + ' ' + styles[value]} aria-hidden="true">
            <i />
            <b />
            <em />
            </span>
            {label}
            </label>)}
        </fieldset>
            {draft.config.template === 'image_left' ? <>
            <DesignImageField label={kind === 'cart_capture' ? 'Görsel' : 'Popup görseli'} value={keyOf(draft.config.image)} options={images} disabled={locked} frame="portrait" onChange={key => {
                    const image = referenceOf(key);
                    if (image)
                        configChange({
                            image
                        });
                    else {
                        const { image: _, ...config } = draft.config;
                        change({
                            config
                        });
                    }
                }}/>
                {imageError ? <p className={styles.error}>
                {imageError}
                <button type="button" className="button button-text" onClick={() => setImageRevision(value => value + 1)}>
                Tekrar yükle
                </button>
                </p> : null}
            </> : null}
        </> : null}
        {tab === 'content' ? <>
        <label className={styles.field}>
        Başlık
        <input name="engagement-heading" value={draft.config.heading} maxLength={120} disabled={locked} onChange={event => configChange({
            heading: event.currentTarget.value
        })}/>
        </label>
        <label className={styles.field}>
        Açıklama
        <textarea name="engagement-body" rows={4} maxLength={1000} value={draft.config.body} disabled={locked} onChange={event => configChange({
            body: event.currentTarget.value
        })}/>
        </label>
        <label className={styles.field}>
        Buton metni
        <input name="engagement-button-label" maxLength={40} value={draft.config.buttonLabel} disabled={locked} onChange={event => configChange({
            buttonLabel: event.currentTarget.value
        })}/>
        </label>
            {kind === 'cart_capture' ? <>
            <label className={styles.field}>
            İletişim bilgisi
            <select name="engagement-collect-mode" value={draft.config.collectMode} disabled={locked} onChange={event => configChange({
                collectMode: event.currentTarget.value as StoreEngagementConfig['collectMode']
            })}>
            <option value="either">
            E-posta veya telefon
            </option>
            <option value="email">
            E-posta
            </option>
            <option value="phone">
            Telefon
            </option>
            </select>
            </label>
            <label className={styles.field}>
            Pazarlama izin metni
            <span>
            İsteğe bağlı
            </span>
            <input name="engagement-opt-in" maxLength={240} value={draft.config.marketingOptInLabel ?? ''} disabled={locked} onChange={event => {
                    const value = event.currentTarget.value;
                    if (value)
                        configChange({
                            marketingOptInLabel: value
                        });
                    else {
                        const { marketingOptInLabel: _, ...config } = draft.config;
                        change({
                            config
                        });
                    }
                }}/>
            </label>
            </> : null}
        </> : null}
        {tab === 'visibility' ? <>
        <fieldset className={styles.devices} disabled={locked}>
        <legend>
        Cihazlar
        </legend>
            {(['desktop', 'mobile'] as const).map(device => <label key={device}>
            <input type="checkbox" name={'engagement-device-' + device} checked={draft.config.devices[device]} onChange={event => {
                const checked = event.currentTarget.checked;
                configChange({
                    devices: {
                        ...draft.config.devices, [device]: checked
                    }
                });
            }}/>
            {device === 'desktop' ? 'Masaüstü' : 'Mobil'}
            </label>)}
        </fieldset>
        <label className={styles.field}>
        Gösterim gecikmesi
        <span>
        Saniye
        </span>
        <input name="engagement-delay" type="number" min={0} max={120} value={draft.config.delaySeconds} disabled={locked} onChange={event => configChange({
            delaySeconds: Number(event.currentTarget.value)
        })}/>
        </label>
        <label className={styles.field}>
        Tekrar gösterme
        <span>
        Gün
        </span>
        <input name="engagement-repeat" type="number" min={1} max={90} value={draft.config.repeatDays} disabled={locked} onChange={event => configChange({
            repeatDays: Number(event.currentTarget.value)
        })}/>
        </label>
        </> : null}
        {tab === 'coupon' ? <>
        <label className={styles.field}>
        Kupon
        <select name="engagement-promotion" value={draft.config.promotionId ?? ''} disabled={locked || !canReadCoupons} onChange={event => {
            const value = event.currentTarget.value;
            void selectCoupon(value);
        }}>
        <option value="">
        Kupon kullanma
        </option>
        {draft.config.promotionId && !couponItems.some(item => item.id === draft.config.promotionId) ? <option value={draft.config.promotionId}>
        {coupon?.name ?? 'Bağlı kupon'}
        </option> : null}
        {couponItems.map(item => <option key={item.id} value={item.id}>
        {item.name}
        </option>)}
        </select>
        </label>
            {coupon ? <p className={styles.couponSummary}>
            <strong>
            {coupon.code}
            </strong>
            <span>
            İndirimler sayfasında da görünür.
            </span>
            </p> : null}
        {couponCursor ? <button type="button" className="button button-text" disabled={couponBusy} onClick={() => {
            setCouponBusy(true);
            promotionApi.list({
                effectiveStatuses: ['active'], triggerKinds: ['code'], cursor: couponCursor
            }).then(result => {
                setCouponItems(items => [...items, ...result.items.filter(item => !items.some(saved => saved.id === item.id))]);
                setCouponCursor(result.nextCursor);
            }).catch(() => setCouponError('Kuponlar yüklenemedi.')).finally(() => setCouponBusy(false));
        }}>
        Diğer kuponları yükle
        </button> : null}
        {!canReadCoupons ? <p className={styles.help}>
        Kuponları görüntüleme yetkiniz yok.
        </p> : null}
            {canManage && canCreateCoupon && !coupon ? <fieldset className={styles.couponCreate} disabled={locked && !couponUnknown}>
            <legend>
            Yeni kupon
            </legend>
            <label className={styles.field}>
            Kupon kodu
            <input name="engagement-coupon-code" maxLength={64} value={couponCode} disabled={couponUnknown} onChange={event => setCouponCode(event.currentTarget.value.toUpperCase())}/>
            </label>
            <label className={styles.field}>
            İndirim
            <span>
            %
            </span>
            <input name="engagement-percentage" type="number" min="0.01" max={100} step="0.01" value={percentage} disabled={couponUnknown} onChange={event => setPercentage(event.currentTarget.value)}/>
            </label>
            <button type="button" className="button button-secondary" disabled={couponBusy || busy || uncertain || conflict} onClick={() => void createCoupon()}>
            {couponUnknown ? 'Kupon kaydını doğrula' : 'Kupon oluştur'}
            </button>
            <p className={styles.help}>
            Kod, normal bir indirim olarak uygulanır. Ziyaretçiye özel tekil kod üretilmez.
            </p>
            </fieldset> : null}
        {couponError ? <p className={styles.error} role="alert">
        {couponError}
        </p> : null}
        </> : null}
    </section>
    <section className={styles.previewSection} aria-label="Önizleme">
    <div className={styles.previewControls}>
    <span>
    Önizleme
    </span>
    <button type="button" aria-label="Masaüstü önizleme" aria-pressed={!mobile} onClick={() => setMobile(false)}>
    {kind === 'cart_capture' ? <Monitor size={18} aria-hidden="true" /> : null}
    <span className={kind === 'cart_capture' ? styles.srOnly : undefined}>
    Masaüstü
    </span>
    </button>
    <button type="button" aria-label="Mobil önizleme" aria-pressed={mobile} onClick={() => setMobile(true)}>
    {kind === 'cart_capture' ? <Smartphone size={18} aria-hidden="true" /> : null}
    <span className={kind === 'cart_capture' ? styles.srOnly : undefined}>
    Mobil
    </span>
    </button>
    </div>
    <EngagementPreview kind={kind} config={draft.config} imageUrl={selectedImage?.url} couponCode={coupon?.code} mobile={mobile}/>
    </section>
    </div>
    </div>
    </DesignSettingsModal>;
}
export function PopupStudio(props: EngagementPermissions) {
    const { storeSlug } = usePanelChromeModel(), api = useMemo(() => scopedStoreEngagementApi(storeSlug), [storeSlug]);
    const [records, setRecords] = useState<readonly StoreEngagementCampaign[]>([]), [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading'), [revision, setRevision] = useState(0), [editor, setEditor] = useState<StoreEngagementCampaign | null | undefined>(), [search, setSearch] = useState(''), [filter, setFilter] = useState('all'), [notice, setNotice] = useState('');
    const trigger = useRef<HTMLElement | null>(null);
    const [recovery,setRecovery]=useState<CampaignInput|null>(null),[recovering,setRecovering]=useState(false);
    useEffect(()=>{let active=true;api.pendingIntent().then(intent=>{if(active)setRecovery(intent);}).catch(reason=>{if(active)setNotice(message(reason));});return()=>{active=false;};},[api,revision]);
    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        setPhase('loading');
        api.list(controller.signal).then(items => {
            if (active) {
                setRecords(items.filter(item => item.kind === 'popup'));
                setPhase('ready');
            }
        }).catch(() => {
            if (active)
                setPhase('error');
        });
        return () => {
            active = false;
            controller.abort();
        };
    }, [api, revision]);
    const visible = records.filter(item => item.name.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')) && (filter === 'all' || item.enabled === (filter === 'enabled')));
    return <PanelPageShell>
    <h1 className={styles.srOnly}>
    Popuplar
    </h1>
    <PanelPageHeader title="Popuplar" actions={props.canManage ? <button type="button" disabled={api.hasUnresolved()} className="button button-primary" onClick={event => {
        trigger.current = event.currentTarget;
        setRecovering(false);
        setEditor(null);
    }}>
    Popup ekle
    </button> : undefined}/>
    {notice ? <p className={styles.notice} role="status">
    {notice}
    </p> : null}
    {recovery&&api.hasUnresolved()?<div className={styles.notice} role="status"><p>Önceki kayıt sonucu henüz doğrulanamadı. Bilgileriniz korunuyor.</p>{recovery.kind==='popup'?<button type="button" className="button button-secondary" disabled={!props.canManage} onClick={event=>{trigger.current=event.currentTarget;setRecovering(true);setEditor(null);}}>Önceki kaydı doğrula</button>:<a href="/settings/store-tools">Sepet kaydını doğrula</a>}</div>:null}
        {phase === 'loading' ? <p role="status">
        Popuplar yükleniyor…
        </p> : phase === 'error' ? <div className={styles.notice} role="alert">
        Popuplar yüklenemedi.
        <button type="button" className="button button-secondary" onClick={() => setRevision(value => value + 1)}>
        Tekrar dene
        </button>
        </div> : <>
        <div className={styles.toolbar}>
        <input aria-label="Popup ara" placeholder="Popup ara" value={search} onChange={event => setSearch(event.currentTarget.value)}/>
        <select aria-label="Popup durumu" value={filter} onChange={event => setFilter(event.currentTarget.value)}>
        <option value="all">
        Tümü
        </option>
        <option value="enabled">
        Açık
        </option>
        <option value="disabled">
        Kapalı
        </option>
        </select>
        </div>
            {visible.length ? <div className={styles.list}>
                {visible.map(item => <article key={item.id} className={styles.listRow}>
                <div className={styles.listSketch} aria-hidden="true">
                <span>
                {item.config.template === 'discount' ? '%' : item.config.template === 'image_left' ? '▧' : 'Aa'}
                </span>
                </div>
                <div className={styles.listCopy}>
                <h2>
                {item.name}
                </h2>
                <p>
                {item.config.heading}
                </p>
                <span>
                {item.enabled ? 'Açık' : 'Kapalı'}
                 ·
                {item.config.devices.desktop && item.config.devices.mobile ? 'Tüm cihazlar' : item.config.devices.mobile ? 'Mobil' : 'Masaüstü'}
                {item.config.promotionId ? ' · Kupon bağlı' : ''}
                </span>
                </div>
                <button type="button" disabled={api.hasUnresolved()} className="button button-secondary" onClick={event => {
                    trigger.current = event.currentTarget;
                    setRecovering(false);
                    setEditor(item);
                }}>
                {props.canManage ? 'Düzenle' : 'Görüntüle'}
                </button>
                </article>)}
            </div> : <div className={styles.empty}>
            {records.length ? 'Aramanıza uygun popup yok.' : 'Henüz popup eklenmedi.'}
            </div>}
        </>}
    {editor !== undefined ? <EngagementEditor key={recovering?'recovery':editor?.id ?? 'new'} {...props} kind="popup" campaign={editor} recoveryInput={recovering&&recovery?recovery:undefined} returnFocusRef={trigger} onClose={() => {setEditor(undefined);setRecovering(false);if(!api.hasUnresolved())setRecovery(null);}} onSaved={saved => {
        setRecords(items => [saved, ...items.filter(item => item.id !== saved.id)]);
        setNotice(saved.enabled ? 'Popup uygulandı.' : 'Popup kapalı olarak kaydedildi.');
        setEditor(undefined);
        setRecovery(null);setRecovering(false);
    }}/> : null}
    </PanelPageShell>;
}
