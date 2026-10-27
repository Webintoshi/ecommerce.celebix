"use client";

import {RefreshCw,Sparkles} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import {PlatformCheckoutButton} from '@/components/commercial-packages/PlatformCheckoutButton';
import {readToshiCredits,type ToshiCreditOverview} from '@/lib/content-authoring-ui/credits-client';
import styles from './artificial-intelligence-settings.module.css';

const OFFERS=new Set(['toshi-500','toshi-2500','toshi-10000','toshi-50000']);
const money=(cents:number)=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:2}).format(cents/100);
function ArtificialIntelligenceSettingsWorkspace({canManage,storeId}:{canManage:boolean;storeId:string}){
 const [overview,setOverview]=useState<ToshiCreditOverview|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const epoch=useRef(0);
 useEffect(()=>{const current=++epoch.current;const controller=new AbortController();setLoading(true);setError('');void readToshiCredits(controller.signal).then(value=>{if(current===epoch.current)setOverview(value);}).catch(()=>{if(!controller.signal.aborted&&current===epoch.current)setError('Toshi kredileri yüklenemedi. Yeniden deneyin.');}).finally(()=>{if(current===epoch.current)setLoading(false);});return()=>{epoch.current++;controller.abort();};},[storeId,revision]);
 return <section className={styles.root} aria-label="Toshi kredileri" aria-busy={loading}>
  <div className={styles.walletRow}><div className={styles.walletIdentity}><Sparkles aria-hidden="true"/><div><span>Kullanılabilir Toshi kredisi</span><strong>{overview?overview.wallet.available.toLocaleString('tr-TR'):loading?'…':'—'}</strong></div></div><button type="button" className={styles.refreshButton} disabled={loading} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={16} aria-hidden="true"/>Yenile</button></div>
  {overview?.wallet.reserved?<p className={styles.helper}>{overview.wallet.reserved.toLocaleString('tr-TR')} kredi devam eden işlemler için ayrıldı.</p>:null}
  {error?<p role="alert" className={styles.liveStatus}>{error}</p>:null}
  {overview?<><div className={styles.sectionHeading}><h2>Kredi yükle</h2><span>Tek seferlik · Fiyatlara KDV eklenir</span></div><div className={styles.offerList}>{overview.offers.filter(offer=>OFFERS.has(offer.id)).map(offer=><article key={offer.id} className={styles.offerRow}><div><strong>{offer.credits.toLocaleString('tr-TR')} kredi</strong><span>{money(offer.netCents)} + KDV</span></div><PlatformCheckoutButton storeId={storeId} kind="toshi_credit" offerId={offer.id} term="once" label="Kredi yükle" className={styles.purchaseButton} disabled={!canManage}/></article>)}</div><div className={styles.sectionHeading}><h2>Kredi kullanımı</h2></div><dl className={styles.priceList}><div><dt>Ürün açıklaması</dt><dd>{overview.prices.description} kredi</dd></div><div><dt>SEO başlığı</dt><dd>{overview.prices.seoTitle} kredi</dd></div><div><dt>SEO açıklaması</dt><dd>{overview.prices.seoDescription} kredi</dd></div><div><dt>Görsel alt metni</dt><dd>{overview.prices.imageAlt} kredi / görsel</dd></div></dl><p className={styles.helper}>Hazırlamadan önce seçtiğiniz alanların toplam kredisini görürsünüz. Paneli açmak ücretsizdir.</p></>:null}
  <span className={styles.srOnly} role="status" aria-live="polite">{loading?'Krediler yükleniyor…':error}</span>
 </section>;
}

export function ArtificialIntelligenceSettings(props:{canManage:boolean;storeId:string}) {
 return <ArtificialIntelligenceSettingsWorkspace key={props.storeId} {...props}/>;
}
