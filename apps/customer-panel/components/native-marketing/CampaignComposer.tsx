"use client";
import {useEffect,useRef,useState} from 'react';
import type {NativeMarketingOverview,NativeMarketingProduct,NativeMarketingTemplate} from '@celebix/saas-data';
import type {NativeMarketingApi,NativeMarketingPreview} from '@/lib/native-marketing-ui/client';
import {draftInput,MARKETING_TEMPLATE_LABELS,marketingErrorMessage,type MarketingCommand,type MarketingDraft} from '@/lib/native-marketing-ui/model';
import styles from './native-marketing.module.css';
export function CampaignComposer({draft,onChange,templates,overview,api,disabled,onCancel,onExecute}:Readonly<{draft:MarketingDraft;onChange:(value:MarketingDraft)=>void;templates:readonly NativeMarketingTemplate[];overview:NativeMarketingOverview;api:NativeMarketingApi;disabled:boolean;onCancel:()=>void;onExecute:(command:MarketingCommand)=>void}>){
 const [query,setQuery]=useState(''),[products,setProducts]=useState<readonly NativeMarketingProduct[]>([]),[selectedProducts,setSelectedProducts]=useState<ReadonlyMap<string,NativeMarketingProduct>>(new Map()),[productLoading,setProductLoading]=useState(false),[productError,setProductError]=useState('');
 const [preview,setPreview]=useState<NativeMarketingPreview|null>(null),[previewing,setPreviewing]=useState(false),[localError,setLocalError]=useState(''),[schedule,setSchedule]=useState(!!draft.scheduledAt);
 const ticket=useRef(0),previewTicket=useRef(0),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;ticket.current++;previewTicket.current++;};},[]);
 useEffect(()=>{const selected=++ticket.current;const timeout=setTimeout(()=>{setProductLoading(true);setProductError('');void api.products(query).then(page=>{if(alive.current&&selected===ticket.current){setProducts(page.items);setSelectedProducts(current=>new Map([...current,...page.items.map(item=>[item.id,item] as const)]));}}).catch(error=>{if(alive.current&&selected===ticket.current)setProductError(marketingErrorMessage(error));}).finally(()=>{if(alive.current&&selected===ticket.current)setProductLoading(false);});},query?250:0);return()=>{clearTimeout(timeout);ticket.current++;};},[api,query]);
 function update(patch:Partial<MarketingDraft>){if(disabled)return;previewTicket.current++;setPreviewing(false);setPreview(null);setLocalError('');onChange({...draft,...patch});}
 function choose(id:string){const template=templates.find(value=>value.id===id);if(!template||template.id==='cart')return;update({...template,templateId:template.id});}
 function command(kind:'send'|'schedule'|'test'){
  try{const body=draftInput(draft);if(kind!=='test'&&(overview.eligibleRecipientCount<1||overview.quota.remaining<overview.eligibleRecipientCount)){setLocalError(overview.eligibleRecipientCount<1?'Gönderime uygun e-posta abonesi bulunmuyor.':'Kalan gönderim hakkı bu kampanya için yeterli değil.');return;}
   let scheduledAt:string|undefined;if(kind==='schedule'){const value=new Date(draft.scheduledAt);if(!Number.isFinite(value.getTime())||value.getTime()<Date.now()+60_000||value.getTime()>Date.now()+30*86_400_000){setLocalError('1 dakika ile 30 gün arasında bir gönderim zamanı seçin.');return;}scheduledAt=value.toISOString();}
   if(kind==='test'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.recipient)){setLocalError('Test için geçerli bir e-posta adresi girin.');return;}
   onExecute({kind,operationId:crypto.randomUUID(),body:{...body,...(scheduledAt?{scheduledAt}:{}),...(kind==='test'?{recipient:draft.recipient.trim()}:{})}});
  }catch{setLocalError('Konu, başlık ve mesaj alanlarını doldurun.');}
 }
 async function showPreview(){const selected=++previewTicket.current;try{setLocalError('');setPreviewing(true);const {name:_name,...body}=draftInput(draft);const value=await api.preview(body);if(alive.current&&selected===previewTicket.current)setPreview(value);}catch(error){if(alive.current&&selected===previewTicket.current)setLocalError(marketingErrorMessage(error));}finally{if(alive.current&&selected===previewTicket.current)setPreviewing(false);}}
 return <div className={styles.compose}>
  <form className={styles.form} onSubmit={event=>{event.preventDefault();command(schedule?'schedule':'send');}}>
   <div className={styles.toolbar}><h2 className={styles.sectionTitle}>Yeni kampanya</h2><button type="button" className="button button-secondary" disabled={disabled} onClick={onCancel}>Vazgeç</button></div>
   <label className={styles.field}>Hazır şablon<select aria-label="Hazır şablon" disabled={disabled} value={draft.templateId} onChange={event=>choose(event.target.value)}>{templates.filter(item=>item.id!=='cart').map(item=><option key={item.id} value={item.id}>{MARKETING_TEMPLATE_LABELS[item.id]}</option>)}</select></label>
   <label className={styles.field}>Konu<input aria-label="Konu" value={draft.subject} maxLength={160} required disabled={disabled} onChange={event=>update({subject:event.target.value})}/></label>
   <label className={styles.field}>Başlık<input aria-label="Başlık" value={draft.heading} maxLength={160} required disabled={disabled} onChange={event=>update({heading:event.target.value})}/></label>
   <label className={styles.field}>Mesaj<textarea aria-label="Mesaj" value={draft.body} maxLength={4000} rows={4} required disabled={disabled} onChange={event=>update({body:event.target.value})}/></label>
   <label className={styles.field}>Düğme metni<input aria-label="Düğme metni" value={draft.buttonLabel} maxLength={80} required disabled={disabled} onChange={event=>update({buttonLabel:event.target.value})}/></label>
   <fieldset className={styles.products}><legend>Ürünler · {draft.productIds.length}/8</legend>
    {draft.productIds.length?<ul className={styles.selectedProducts}>{draft.productIds.map(id=><li key={id}><span>{selectedProducts.get(id)?.title??'Seçili ürün'}</span><button type="button" disabled={disabled} aria-label={`${selectedProducts.get(id)?.title??'Ürün'} seçimini kaldır`} onClick={()=>update({productIds:draft.productIds.filter(value=>value!==id)})}>Kaldır</button></li>)}</ul>:null}
    <label className={styles.field}>Ürün ara<input type="search" aria-label="Ürün ara" value={query} disabled={disabled} onChange={event=>setQuery(event.target.value)}/></label>
    {productLoading?<p role="status" className={styles.note}>Ürünler yükleniyor…</p>:productError?<p role="alert">{productError}</p>:!products.length?<p className={styles.note}>Aramaya uygun ürün bulunamadı.</p>:<ul className={styles.productList}>{products.map(product=><li key={product.id}>{product.imageUrl?<img src={product.imageUrl} alt="" width={40} height={40}/>:null}<span><strong>{product.title}</strong><small>{new Intl.NumberFormat('tr-TR',{style:'currency',currency:product.currency}).format(product.priceCents/100)}</small></span><button type="button" className="button button-secondary" disabled={disabled||draft.productIds.includes(product.id)||draft.productIds.length>=8} onClick={()=>update({productIds:[...draft.productIds,product.id]})}>{draft.productIds.includes(product.id)?'Seçildi':'Ekle'}</button></li>)}</ul>}
   </fieldset>
   <label className={styles.switch}><input type="checkbox" aria-label="Gönderim zamanı seç" checked={schedule} disabled={disabled} onChange={event=>setSchedule(event.target.checked)}/><span>Gönderim zamanı seç</span></label>
   {schedule?<label className={styles.field}>Gönderim zamanı<input aria-label="Gönderim zamanı" type="datetime-local" value={draft.scheduledAt} required disabled={disabled} onChange={event=>update({scheduledAt:event.target.value})}/><small>Cihazınızın yerel saatine göre.</small></label>:null}
   {localError?<p role="alert" className={styles.notice}>{localError}</p>:null}
   <p className={styles.note}>{overview.eligibleRecipientCount} uygun aboneye gönderilecek. Logo ve renkler {overview.branding.storeName} mağazanızdan alınır.</p>
   <div className={styles.actions}><button type="submit" className="button button-primary" disabled={disabled||overview.eligibleRecipientCount<1||overview.quota.remaining<overview.eligibleRecipientCount}>{schedule?'Planla':'Şimdi gönder'}</button><button type="button" className="button button-secondary" disabled={previewing||disabled} onClick={()=>void showPreview()}>{previewing?'Hazırlanıyor…':'Önizle'}</button></div>
  </form>
  <aside className={styles.previewPanel} aria-label="E-posta önizlemesi">
   {preview?<><div className={styles.previewHeading}><strong>{preview.subject}</strong><small>Gönderen: {preview.from}</small></div><iframe title="E-posta önizlemesi" sandbox="" referrerPolicy="no-referrer" srcDoc={preview.html}/></>:<div className={styles.previewEmpty}><strong>{overview.branding.storeName}</strong><p>Şablonu görmek için Önizle’ye tıklayın.</p></div>}
   <div className={styles.testSend}><label className={styles.field}>Test e-postası<input type="email" aria-label="Test e-postası" placeholder="siz@ornek.com" value={draft.recipient} disabled={disabled} onChange={event=>update({recipient:event.target.value})}/></label><button type="button" className="button button-secondary" disabled={disabled||!draft.recipient.trim()||overview.quota.remaining<1} onClick={()=>command('test')}>Test gönder</button><p className={styles.note}>Yalnızca yazdığınız adrese bir test gönderilir.</p></div>
  </aside>
 </div>;
}
