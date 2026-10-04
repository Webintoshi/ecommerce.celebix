"use client";
import { ArrowUpRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StoreEngagementCampaign } from '@celebix/saas-contracts';
import { usePanelChromeModel } from '@/components/panel/PanelLayoutClient';
import { scopedStoreEngagementApi,type CampaignInput } from '@/lib/store-engagement-ui/client';
import { EngagementEditor, type EngagementPermissions } from '../promotions/PopupStudio';
import { CartCaptureArtwork } from './CartCaptureArtwork';
import styles from './store-tools.module.css';
export function CartCaptureTool({ onOpenChange, ...permissions }: EngagementPermissions & Readonly<{
    onOpenChange?: (open: boolean) => void;
}>) {
    const { storeSlug } = usePanelChromeModel(), api = useMemo(() => scopedStoreEngagementApi(storeSlug), [storeSlug]);
    const [campaign, setCampaign] = useState<StoreEngagementCampaign | null>(null), [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading'), [revision, setRevision] = useState(0), [open, setOpen] = useState(false), [notice, setNotice] = useState('');
    const trigger = useRef<HTMLElement | null>(null);
    const [recovery,setRecovery]=useState<CampaignInput|null>(null);
    useEffect(()=>{let active=true;api.pendingIntent().then(intent=>{if(active)setRecovery(intent);}).catch(reason=>{if(active)setNotice(reason instanceof Error?reason.message:'Kayıt doğrulanamadı.');});return()=>{active=false;};},[api,revision]);
    const ownRecovery=recovery?.kind==='cart_capture'&&api.hasUnresolved();
    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        setPhase('loading');
        api.list(controller.signal).then(items => {
            if (active) {
                setCampaign(items.find(item => item.kind === 'cart_capture') ?? null);
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
    const close = () => {
        setOpen(false);
        if(!api.hasUnresolved())setRecovery(null);
        onOpenChange?.(false);
    };
    return <>
    <article className={styles.toolRow}>
    <CartCaptureArtwork />
    <div className={styles.toolCopy}>
    <h2>
    Sepet yakalama
    </h2>
    <p>
    Sepeti tamamlamayan ziyaretçiden iletişim bilgisi alın. Kupon ekleyebilirsiniz.
    </p>
    {phase === 'loading' ? <span role="status">
    Yükleniyor…
    </span> : phase === 'error' ? <span role="alert">
    Araç yüklenemedi.
    </span> : <span>
    {campaign?.enabled ? 'Açık' : 'Kapalı'}
    {campaign?.config.promotionId ? ' · Kupon bağlı' : ''}
    {!permissions.canManage ? ' · Salt okunur' : ''}
    </span>}
    {notice ? <p role="status">
    {notice}
    </p> : null}
    {recovery&&api.hasUnresolved()?<p role="status">Önceki kayıt sonucu belirsiz. Bilgileriniz korunuyor.{recovery.kind==='popup'?<a href="/discounts/popups">Popup kaydını doğrula</a>:null}</p>:null}
    </div>
    {phase === 'error'&&!ownRecovery ? <button type="button" className="button button-secondary" onClick={() => setRevision(value => value + 1)}>
    Tekrar dene
    </button> : <button type="button" className="button button-primary" disabled={ownRecovery?!permissions.canManage:phase!=='ready'||api.hasUnresolved()} data-tool-edit="cart_capture" onClick={event => {
        trigger.current = event.currentTarget;
        setOpen(true);
        onOpenChange?.(true);
    }}>
    {ownRecovery?'Önceki kaydı doğrula':permissions.canManage ? 'Düzenle' : 'Görüntüle'}
    <ArrowUpRight size={16} aria-hidden="true" />
    </button>}
    </article>
    {open ? <EngagementEditor {...permissions} kind="cart_capture" campaign={campaign} recoveryInput={ownRecovery&&recovery?recovery:undefined} returnFocusRef={trigger} onClose={close} onSaved={saved => {
        setCampaign(saved);
        setNotice(saved.enabled ? 'Sepet yakalama uygulandı.' : 'Sepet yakalama kapatıldı.');
        close();
        setRecovery(null);
    }}/> : null}
    </>;
}
