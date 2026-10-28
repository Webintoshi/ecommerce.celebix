"use client";

import {RefreshCw,Sparkles} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import {PlatformCheckoutButton} from '@/components/commercial-packages/PlatformCheckoutButton';
import {readToshiCredits,type ToshiCreditOverview} from '@/lib/content-authoring-ui/credits-client';
import styles from './artificial-intelligence-settings.module.css';

const OFFERS=new Set(['toshi-test-1','toshi-500','toshi-2500','toshi-10000','toshi-50000']);
const PRESENTATION:Readonly<Record<string,{image:string;benefit:string}>>={
 'toshi-test-1':{image:'/payments/toshi/toshi-test-1-v1.webp',benefit:'Toshi denemesi için 1 kredi yükleyin.'},
 'toshi-500':{image:'/payments/toshi/toshi-500-v1.webp',benefit:'İlk ürün metinlerinizi ve görsel alt metinlerinizi hazırlayın.'},
 'toshi-2500':{image:'/payments/toshi/toshi-2500-v1.webp',benefit:'Ürün açıklaması ve SEO çalışmalarınızı sürdürün.'},
 'toshi-10000':{image:'/payments/toshi/toshi-10000-v1.webp',benefit:'Geniş ürün kataloğunuz için içerik hazırlayın.'},
 'toshi-50000':{image:'/payments/toshi/toshi-50000-v1.webp',benefit:'Yoğun içerik çalışmalarınızı tek bakiyeden yönetin.'},
};
const money=(cents:number)=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:2}).format(cents/100);
function ArtificialIntelligenceSettingsWorkspace({canManage,storeId,autoStartTestPurchase=false}:{canManage:boolean;storeId:string;autoStartTestPurchase?:boolean}){
 const [overview,setOverview]=useState<ToshiCreditOverview|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const epoch=useRef(0);
 useEffect(()=>{const current=++epoch.current;const controller=new AbortController();setLoading(true);setError('');void readToshiCredits(controller.signal).then(value=>{if(current===epoch.current)setOverview(value);}).catch(()=>{if(!controller.signal.aborted&&current===epoch.current)setError('Toshi kredileri yüklenemedi. Yeniden deneyin.');}).finally(()=>{if(current===epoch.current)setLoading(false);});return()=>{epoch.current++;controller.abort();};},[storeId,revision]);
 const offers=overview?.offers.filter(offer=>OFFERS.has(offer.id))??[];
 return <section className={styles.root} aria-label="Toshi kredileri" aria-busy={loading}>
  <div className={styles.walletRow}><div className={styles.walletIdentity}><Sparkles aria-hidden="true"/><div><span>Kullanılabilir Toshi kredisi</span><strong>{overview?overview.wallet.available.toLocaleString('tr-TR'):loading?'…':'—'}</strong>{overview?<small>Toplam bakiye: {overview.wallet.balance.toLocaleString('tr-TR')} kredi</small>:null}</div></div><button type="button" className={styles.refreshButton} disabled={loading} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={16} aria-hidden="true"/>Yenile</button></div>
  {overview?.wallet.reserved?<p className={styles.helper}>{overview.wallet.reserved.toLocaleString('tr-TR')} kredi devam eden işlemler için ayrıldı.</p>:null}
  {error?<p role="alert" className={styles.liveStatus}>{error}</p>:null}
  {overview?<>
   <div className={styles.sectionHeading}><h2>Kredi yükle</h2><span>Tek seferlik ödeme</span></div>
   {offers.length?<div className={styles.offerGrid}>{offers.map(offer=>{
    const presentation=PRESENTATION[offer.id],vat=Number((BigInt(offer.netCents)*2000n+5000n)/10000n);
    return <article key={offer.id} className={styles.offerCard} data-credit-offer={offer.id}>
     <img className={styles.productImage} src={presentation.image} alt="" width={960} height={640}/>
     <div className={styles.offerBody}>
      <h3>{offer.credits.toLocaleString('tr-TR')} kredi</h3><p className={styles.benefit}>{presentation.benefit}</p>
      <dl className={styles.offerPrices}><div className={styles.offerTotal}><dt>KDV dahil</dt><dd data-credit-price="total">{money(offer.netCents+vat)}</dd></div><div><dt>Dahil KDV (%20)</dt><dd data-credit-price="vat">{money(vat)}</dd></div></dl>
      <PlatformCheckoutButton storeId={storeId} kind="toshi_credit" offerId={offer.id} term="once" label={`${offer.credits.toLocaleString('tr-TR')} kredi yükle`} className={styles.purchaseButton} disabled={!canManage} autoStart={canManage&&autoStartTestPurchase&&offer.id==='toshi-test-1'}/>
     </div>
    </article>;
   })}</div>:<p className={styles.helper}>Kredi paketleri şu anda görüntülenemiyor. Yenileyerek tekrar deneyin.</p>}
  </>:null}
  <span className={styles.srOnly} role="status" aria-live="polite">{loading?'Krediler yükleniyor…':error}</span>
 </section>;
}

export function ArtificialIntelligenceSettings(props:{canManage:boolean;storeId:string;autoStartTestPurchase?:boolean}) {
 return <ArtificialIntelligenceSettingsWorkspace key={props.storeId} {...props}/>;
}
