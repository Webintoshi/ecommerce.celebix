"use client";
import { createDefaultStoreEngagementConfig, parseStoreEngagementConfig, type StoreEngagementCampaign, type StoreEngagementCampaignKind, type StoreEngagementConfig, type StoreEngagementImageReference, type PromotionAdminListItem } from '@celebix/saas-contracts';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { PanelPageHeader, PanelPageShell } from '@/components/panel/PanelPageShell';
import { usePanelChromeModel } from '@/components/panel/PanelLayoutClient';
import { scopedStoreEngagementApi, type CampaignInput } from '@/lib/store-engagement-ui/client';
import { promotionApi, promotionErrorMessage } from '@/lib/promotion-ui/client';
import { createPromotionDraft, updatePromotionDraft } from '@/lib/promotion-ui/model';
import { ArrowRight, Check, Monitor, Plus, Search, ShoppingBag, Smartphone } from 'lucide-react';
import { storefrontDesignApi } from '@/lib/storefront-design-ui/client';
import { DesignSettingsModal } from '../settings/design/DesignSettingsDrawer';
import { DesignImageField, type DesignImageOption } from '../settings/design/DesignImageField';
import { PopupArtwork } from './PopupArtwork';
import styles from './popup-studio.module.css';
export interface EngagementPermissions {
    readonly canManage: boolean;
    readonly canReadCoupons?: boolean;
    readonly canCreateCoupon?: boolean;
    readonly timezone?: string;
}
const TABS = [['content', 'Tasarım'], ['visibility', 'Gösterim'], ['coupon', 'Kupon']] as const;
const CART_TABS = [['content', 'İçerik'], ['design', 'Görünüm'], ['visibility', 'Gösterim'], ['coupon', 'Kupon']] as const;
type Tab = (typeof CART_TABS)[number][0];
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
    return <div className={[styles.previewFrame, mobile ? styles.mobilePreview : '', kind === 'cart_capture' ? styles.cartPreviewFrame : styles.popupPreviewFrame].filter(Boolean).join(' ')} data-engagement-preview aria-label="Canlı önizleme">
    <div className={styles.storePreviewHeader} aria-hidden="true"><span /><i /><ShoppingBag size={16} /></div>
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
    const [draft, setDraft] = useState(initial.current), [tab, setTab] = useState<Tab>('content'), [mobile, setMobile] = useState(false), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(Boolean(recoveryInput)), [conflict, setConflict] = useState(false), [error, setError] = useState(''), [discard, setDiscard] = useState(false);
    const [images, setImages] = useState<readonly DesignImageOption[]>([]), [imageError, setImageError] = useState(''), [imageRevision, setImageRevision] = useState(0);
    const [couponItems, setCouponItems] = useState<readonly PromotionAdminListItem[]>([]), [coupon, setCoupon] = useState<Coupon | null>(null), [couponBusy, setCouponBusy] = useState(false), [couponError, setCouponError] = useState(''), [couponCursor, setCouponCursor] = useState<string | null>(null), [couponCode, setCouponCode] = useState(''), [percentage, setPercentage] = useState('3'), [couponUnknown, setCouponUnknown] = useState(false);
    const [imageBusy, setImageBusy] = useState(false), [imagePending, setImagePending] = useState(false);
    const imageState = useRef({ busy: false, pending: false });
    const mediaAttempts = useRef(new WeakMap<File, { operationId: string; altText: string }>());
    const couponIntent = useRef<ReturnType<typeof createPromotionDraft> | null>(null), couponGeneration = useRef(0), writing = useRef(false);
    const dirty = JSON.stringify(draft) !== JSON.stringify(initial.current), baseLocked = !canManage || busy || uncertain || conflict || couponBusy || couponUnknown, locked = baseLocked || imageBusy || imagePending;
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
    const imageBusyChange = useCallback((id: string, value: boolean) => {
        imageState.current.busy = value;
        setImageBusy(value);
        if (!value) window.requestAnimationFrame(() => {
            if (document.activeElement === document.body) document.getElementById(id + '-label')?.closest('section')?.querySelector<HTMLButtonElement>('[data-image-dropzone]')?.focus();
        });
    }, []);
    const imagePendingChange = useCallback((_id: string, value: boolean) => {
        imageState.current.pending = value;
        setImagePending(value);
    }, []);
    async function uploadImage(file: File): Promise<DesignImageOption> {
        let attempt = mediaAttempts.current.get(file);
        if (!attempt) {
            attempt = { operationId: crypto.randomUUID(), altText: draft.name.trim() || 'Popup görseli' };
            mediaAttempts.current.set(file, attempt);
        }
        const uploaded = await storefrontDesignApi.uploadMedia({ file, ...attempt });
        const option = { key: 'media:' + uploaded.id, url: uploaded.url, altText: uploaded.altText, width: uploaded.width, height: uploaded.height };
        mediaAttempts.current.delete(file);
        setImages(items => [option, ...items.filter(item => item.key !== option.key)]);
        return option;
    }
    function selectImage(key: string) {
        if (baseLocked) return;
        const image = referenceOf(key);
        setDraft(value => {
            const { image: _previous, ...config } = value.config;
            return { ...value, config: { ...config, ...(image ? { image } : {}) } };
        });
        setError('');
        setDiscard(false);
    }
    function navigate(next: Tab, moveFocus = false) {
        if (imageState.current.busy || imageState.current.pending) return;
        setTab(next);
        if (moveFocus) window.requestAnimationFrame(() => document.getElementById('engagement-tab-' + next)?.focus());
    }
    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        setImageError('');
        storefrontDesignApi.editor({
            signal: controller.signal
        }).then(workspace => {
            if (active)
                setImages(items => [...items, ...workspace.media.map(option => ({
                    key: keyOf(option.reference), url: option.url, altText: option.altText, width: option.width, height: option.height
                })).filter(option => !items.some(item => item.key === option.key))]);
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
        if (!dirty && !busy && !uncertain && !couponUnknown && !imageBusy && !imagePending)
            return;
        const unload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', unload);
        return () => window.removeEventListener('beforeunload', unload);
    }, [dirty, busy, uncertain, couponUnknown, imageBusy, imagePending]);
    const requestClose = useCallback(() => {
        if (imageState.current.busy || imageState.current.pending) {
            setError('Görsel yüklemesini tamamlayın veya görsel seçimini kaldırın.');
            return;
        }
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
        if (!canManage || busy || writing.current || conflict || couponBusy || couponUnknown || imageState.current.busy || imageState.current.pending)
            return;
        let payload: CampaignInput;
        if (kind === 'popup') {
            const invalid = !draft.name.trim() ? ['content', 'engagement-name', 'Kayıt adını girin.']
                : !draft.config.heading.trim() ? ['content', 'engagement-heading', 'Başlığı girin.']
                : !draft.config.buttonLabel.trim() ? ['content', 'engagement-button-label', 'Buton metnini girin.']
                : !draft.config.devices.desktop && !draft.config.devices.mobile ? ['visibility', 'engagement-device-desktop', 'En az bir cihaz seçin.']
                : !Number.isInteger(draft.config.delaySeconds) || draft.config.delaySeconds < 0 || draft.config.delaySeconds > 120 ? ['visibility', 'engagement-delay', 'Gecikme 0–120 saniye olmalı.']
                : !Number.isInteger(draft.config.repeatDays) || draft.config.repeatDays < 1 || draft.config.repeatDays > 90 ? ['visibility', 'engagement-repeat', 'Tekrar süresi 1–90 gün olmalı.'] : null;
            if (invalid) {
                setError(invalid[2]!);
                setTab(invalid[0] as Tab);
                window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[name="' + invalid[1] + '"]')?.focus());
                return;
            }
        }
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
        if (!canManage || !canCreateCoupon || busy || writing.current || couponBusy || uncertain || conflict || imageState.current.busy || imageState.current.pending)
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
    }} className={kind === 'cart_capture' ? styles.cartModal : styles.popupModal} returnFocusRef={returnFocusRef} onClose={closeModal} onApply={() => void apply()} applying={busy || couponBusy} applyDisabled={!canManage || conflict || couponUnknown || imageBusy || imagePending}>
    <div className={kind === 'cart_capture' ? styles.cartEditor : styles.popupEditor}>
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
    <span className={styles.switchTrack} aria-hidden="true" />
    {draft.enabled ? 'Açık' : 'Kapalı'}
    </label>
    </div>
    <div className={styles.tabs} role="tablist" aria-label={title(kind) + ' ayarları'}>
        {tabs.map(([key, label]) => <button key={key} id={'engagement-tab-' + key} type="button" role="tab" aria-selected={tab === key} aria-controls={'engagement-panel-' + key} tabIndex={tab === key ? 0 : -1} disabled={imageBusy || imagePending} onKeyDown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
                    return;
                event.preventDefault();
                const index = tabs.findIndex(([item]) => item === tab), next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
                navigate(tabs[next]![0]);
                document.getElementById('engagement-tab-' + tabs[next]![0])?.focus();
            }} onClick={() => navigate(key)}>
        {label}
        </button>)}
    </div>
    <div className={styles.editorGrid}>
    <section id={'engagement-panel-' + tab} role="tabpanel" aria-labelledby={'engagement-tab-' + tab} className={styles.fields}>
        {tab === 'design' || (kind === 'popup' && tab === 'content') ? <>
        <fieldset className={styles.templates} disabled={locked}>
        <legend>
        Düzen
        </legend>
            {TEMPLATES.map(([value, label]) => <label key={value} className={draft.config.template === value ? styles.selectedTemplate : ''}>
            <input type="radio" name="engagement-template" value={value} checked={draft.config.template === value} onChange={() => configChange({
                template: value
            })}/>
            {kind === 'popup' ? <PopupArtwork variant={value} className={styles.templateArtwork} /> : <span className={styles.templateSketch + ' ' + styles[value]} aria-hidden="true"><i /><b /><em /></span>}
            {label}
            </label>)}
        </fieldset>
            {draft.config.template === 'image_left' ? <>
            <DesignImageField label={kind === 'cart_capture' ? 'Görsel' : 'Popup görseli'} value={keyOf(draft.config.image)} options={images} disabled={baseLocked} frame="portrait" onChange={selectImage}
                onUpload={kind === 'popup' && canManage ? uploadImage : undefined}
                onBusyChange={kind === 'popup' ? imageBusyChange : undefined}
                onPendingChange={kind === 'popup' ? imagePendingChange : undefined} />
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
            {kind === 'popup' ? device === 'desktop' ? <Monitor size={18} aria-hidden="true" /> : <Smartphone size={18} aria-hidden="true" /> : null}
            {device === 'desktop' ? 'Masaüstü' : 'Mobil'}
            </label>)}
        </fieldset>
        <label className={styles.field}>
        Gösterim gecikmesi
        <span>
        {kind === 'popup' ? 'Sayfa açıldıktan sonra · saniye' : 'Saniye'}
        </span>
        <input name="engagement-delay" type="number" min={0} max={120} value={draft.config.delaySeconds} disabled={locked} onChange={event => configChange({
            delaySeconds: Number(event.currentTarget.value)
        })}/>
        </label>
        <label className={styles.field}>
        Tekrar gösterme
        <span>
        {kind === 'popup' ? 'Aynı ziyaretçiye · gün sonra' : 'Gün'}
        </span>
        <input name="engagement-repeat" type="number" min={1} max={90} value={draft.config.repeatDays} disabled={locked} onChange={event => configChange({
            repeatDays: Number(event.currentTarget.value)
        })}/>
        </label>
        </> : null}
        {tab === 'coupon' ? <>
        <label className={styles.field}>
        Kupon
        {kind === 'popup' ? <span>İsteğe bağlı</span> : null}
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
    {kind === 'popup' ? <div className={styles.stepNavigation}>
        {tab !== 'content' ? <button type="button" className="button button-text" disabled={imageBusy || imagePending} onClick={() => navigate(tab === 'coupon' ? 'visibility' : 'content', true)}>Geri</button> : <span />}
        {tab !== 'coupon' ? <button type="button" className="button button-secondary" disabled={imageBusy || imagePending} onClick={() => navigate(tab === 'content' ? 'visibility' : 'coupon', true)}>Devam<ArrowRight size={16} aria-hidden="true" /></button> : <span className={styles.help}>Kupon kullanmadan da kaydedebilirsiniz.</span>}
    </div> : null}
    </section>
    <section className={styles.previewSection} aria-label="Önizleme">
    <div className={styles.previewControls}>
    <span>
    Önizleme
    </span>
    <button type="button" aria-label="Masaüstü önizleme" aria-pressed={!mobile} onClick={() => setMobile(false)}>
    <Monitor size={18} aria-hidden="true" />
    <span className={styles.srOnly}>
    Masaüstü
    </span>
    </button>
    <button type="button" aria-label="Mobil önizleme" aria-pressed={mobile} onClick={() => setMobile(true)}>
    <Smartphone size={18} aria-hidden="true" />
    <span className={styles.srOnly}>
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
    const openNew = (element: HTMLElement) => {
        trigger.current = element;
        setRecovering(false);
        setEditor(null);
    };
    return <PanelPageShell>
    <div className={styles.popupList}>
    <h1 className={styles.srOnly}>Popuplar</h1>
    <PanelPageHeader title="Popuplar" />
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    {recovery && api.hasUnresolved() ? <div className={styles.notice} role="status"><p>Önceki kayıt sonucu henüz doğrulanamadı. Bilgileriniz korunuyor.</p>{recovery.kind === 'popup' ? <button type="button" className="button button-secondary" disabled={!props.canManage} onClick={event => { trigger.current = event.currentTarget; setRecovering(true); setEditor(null); }}>Önceki kaydı doğrula</button> : <a href="/settings/store-tools">Sepet kaydını doğrula</a>}</div> : null}
    <header className={styles.toolbar}>
        <label className={styles.searchField}><Search size={18} aria-hidden="true" /><input aria-label="Popup ara" placeholder="Popup ara" value={search} onChange={event => setSearch(event.currentTarget.value)} /></label>
        <div className={styles.statusFilters} role="group" aria-label="Popup durumu">
            {([['all', 'Tümü'], ['enabled', 'Açık'], ['disabled', 'Kapalı']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        {props.canManage ? <button type="button" disabled={api.hasUnresolved()} className="button button-primary" onClick={event => openNew(event.currentTarget)}><Plus size={18} aria-hidden="true" />Popup ekle</button> : null}
    </header>
    {phase === 'loading' ? <div className={styles.loadingList} role="status"><span className={styles.srOnly}>Popuplar yükleniyor…</span>{[0, 1, 2].map(index => <div key={index} className={styles.loadingRow} aria-hidden="true"><i /><div><i /><i /></div><i /></div>)}</div>
        : phase === 'error' ? <div className={styles.empty} role="alert"><PopupArtwork variant="empty" className={styles.emptyArtwork} /><h2>Popuplar yüklenemedi.</h2><button type="button" className="button button-secondary" onClick={() => setRevision(value => value + 1)}>Tekrar dene</button></div>
        : visible.length ? <div className={styles.list}>
            {visible.map(item => <article key={item.id} className={styles.listRow}>
                <PopupArtwork variant={item.config.template} className={styles.listArtwork} />
                <div className={styles.listCopy}><h2>{item.name}</h2><p>{item.config.heading}</p><div className={styles.listMeta}><span className={styles.statusBadge} data-enabled={item.enabled}>{item.enabled ? <Check size={12} aria-hidden="true" /> : null}{item.enabled ? 'Açık' : 'Kapalı'}</span><span>{item.config.devices.desktop && item.config.devices.mobile ? 'Tüm cihazlar' : item.config.devices.mobile ? 'Mobil' : 'Masaüstü'}</span>{item.config.promotionId ? <span>Kupon bağlı</span> : null}</div></div>
                <button type="button" disabled={api.hasUnresolved()} className="button button-secondary" onClick={event => { trigger.current = event.currentTarget; setRecovering(false); setEditor(item); }}>{props.canManage ? 'Düzenle' : 'Görüntüle'}<ArrowRight size={16} aria-hidden="true" /></button>
            </article>)}
        </div>
        : <div className={styles.empty}><PopupArtwork variant="empty" className={styles.emptyArtwork} /><h2>{records.length ? 'Aramanıza uygun popup yok.' : 'İlk popupınızı ekleyin'}</h2>{records.length ? <button type="button" className="button button-secondary" onClick={() => { setSearch(''); setFilter('all'); }}>Filtreleri temizle</button> : props.canManage ? <button type="button" disabled={api.hasUnresolved()} className="button button-secondary" onClick={event => openNew(event.currentTarget)}>İlk popupı ekle<ArrowRight size={16} aria-hidden="true" /></button> : <p>Henüz popup eklenmedi.</p>}</div>}
    {editor !== undefined ? <EngagementEditor key={recovering?'recovery':editor?.id ?? 'new'} {...props} kind="popup" campaign={editor} recoveryInput={recovering&&recovery?recovery:undefined} returnFocusRef={trigger} onClose={() => {setEditor(undefined);setRecovering(false);if(!api.hasUnresolved())setRecovery(null);}} onSaved={saved => {
        setRecords(items => [saved, ...items.filter(item => item.id !== saved.id)]);
        setNotice(saved.enabled ? 'Popup uygulandı.' : 'Popup kapalı olarak kaydedildi.');
        setEditor(undefined);
        setRecovery(null);setRecovering(false);
    }}/> : null}
    </div>
    </PanelPageShell>;
}
