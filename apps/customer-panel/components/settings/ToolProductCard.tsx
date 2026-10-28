import { Check, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { StoreToolOffer } from '@celebix/saas-contracts';
import { TOOL_PRODUCTS, type ToolSummary } from './tool-product-presentation';
import styles from './tool-product-catalog.module.css';

const money = (cents: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(cents / 100);
export function ToolProductCard({ offer, children, summary, canManage }: Readonly<{ offer: StoreToolOffer; children?: ReactNode; summary?: ToolSummary; canManage: boolean }>) {
  const product = TOOL_PRODUCTS[offer.id as keyof typeof TOOL_PRODUCTS];
  return <article className={styles.card} data-tool-product={offer.id} data-tool-offer={summary ? undefined : offer.id}>
    <img className={styles.image} src={product.image} alt={`${offer.name} araç görseli`} width={960} height={640}/>
    <div className={styles.body}>
      <div className={styles.identity}><h2>{offer.name}</h2>{summary ? <span className={styles.owned}>Mağazanızda mevcut</span> : offer.id === 'all_tools' ? <span className={styles.badge}>5 araç bir arada</span> : null}</div>
      <p className={styles.benefit}>{product.benefit}</p>
      <ul className={styles.features}>{product.features.map(feature => <li key={feature}><Check size={16} aria-hidden="true"/><span>{feature}</span></li>)}</ul>
      {summary ? <div className={styles.state}>
        {summary.loading ? <p role="status">Ayarlar yükleniyor…</p> : summary.error ? <p role="alert">{summary.error}</p> : <p>{summary.enabled ? 'Açık' : 'Kapalı'}{summary.detail ? ` · ${summary.detail}` : ''}{!canManage ? ' · Salt okunur' : ''}</p>}
        <p>Mevcut araç hakkınız korunur. Ek ödeme yok.</p>
        {summary.extra}{summary.shortcuts}
      </div> : <><div className={styles.price}><strong data-tool-price="total">{money(offer.totalCents)} TL</strong><span>KDV dahil</span></div><div className={styles.totals}>Dahil KDV (%{offer.vatBps / 100}): {money(offer.vatCents)} TL</div></>}
      <p className={styles.terms}>Tek seferlik · Yıllık yenileme yok</p>
      {offer.toolKeys.includes('restock') ? <small className={styles.terms}>E-posta gönderimi hizmetin gönderim koşullarına tabidir; sınırsız gönderim içermez.</small> : null}
      <div className={styles.actions}>{summary ? summary.error && summary.onRetry ? <button className="button button-secondary" type="button" onClick={summary.onRetry}>Yeniden dene</button> : <button ref={summary.triggerRef} id={summary.configureId} data-tool-edit={summary.configureKind ?? offer.id} className="button button-primary" type="button" disabled={summary.disabled || summary.loading} onClick={summary.onConfigure}>{summary.configureLabel ?? (canManage ? 'Yapılandır' : 'Görüntüle')}<ArrowUpRight size={16} aria-hidden="true"/></button> : children}</div>
    </div>
  </article>;
}
