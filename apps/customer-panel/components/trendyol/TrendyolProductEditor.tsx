'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {parseTrendyolListingInput,trendyolVatRate,trendyolTaxIssue,type TrendyolTaxProduct,type TrendyolListingInput,type TrendyolPricingRule} from '@celebix/saas-contracts';
import {OrderActionDialog} from '@/components/orders/OrderActionDialog';
import {type TrendyolClient,type TrendyolOption} from '@/lib/trendyol-ui/client';
import {definitiveFailure,errorCode,failureMessage} from '@/lib/trendyol-ui/model';
import {TrendyolPricePreview} from './TrendyolPricing';
import styles from './trendyol.module.css';
import checkbox from '@/components/shared/selection-checkbox.module.css';
type AttributeDraft=Readonly<{valueId:string;value:string}>;
type Draft={mode:'existing'|'create';barcode:string;category:string;brand:string;cargo:string;weight:string;enabled:boolean;attributes:Record<number,AttributeDraft>};
function initial(product:TrendyolTaxProduct):Draft {const m=product.mapping;return{mode:m?.mode??'existing',barcode:m?.barcode??product.barcode??'',category:m?.categoryId?String(m.categoryId):'',brand:m?.brandId?String(m.brandId):'',cargo:m?.cargoProviderCode??'',weight:String(m?.dimensionalWeight??1),enabled:m?.enabled??true,attributes:Object.fromEntries((m?.attributes??[]).map(a=>[a.attributeId,{valueId:a.valueId?String(a.valueId):'',value:a.value??''}]))};}
const EMPTY:readonly TrendyolOption[]=[];
export function TrendyolProductEditor({product,pricing,client,onClose,onSaved}:Readonly<{product:TrendyolTaxProduct;pricing:TrendyolPricingRule;client:TrendyolClient;onClose:()=>void;onSaved:()=>void}>){
  const [draft,setDraft]=useState(()=>initial(product));const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [attempt,setAttempt]=useState<{input:TrendyolListingInput;operationId:string}|null>(null);
  const [choices,setChoices]=useState<{categories:readonly TrendyolOption[];brands:readonly TrendyolOption[];cargo:readonly TrendyolOption[]}>({categories:EMPTY,brands:EMPTY,cargo:EMPTY});
  const [choicesBusy,setChoicesBusy]=useState(false),[choicesError,setChoicesError]=useState(''),[attributes,setAttributes]=useState(EMPTY),[attrsBusy,setAttrsBusy]=useState(false),[attrsError,setAttrsError]=useState('');
  const [categorySearch,setCategorySearch]=useState(''),[brandSearch,setBrandSearch]=useState(''),[attrsRevision,setAttrsRevision]=useState(0);
  const alive=useRef(true),choiceRead=useRef(0),attributeRead=useRef(0),saving=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;choiceRead.current++;attributeRead.current++;};},[]);
  async function loadChoices(){const ticket=++choiceRead.current;setChoicesBusy(true);setChoicesError('');const results=await Promise.allSettled([client.options({kind:'categories',...(categorySearch.trim()?{search:categorySearch.trim()}:{})}),client.options({kind:'brands',...(brandSearch.trim()?{search:brandSearch.trim()}:{})}),client.options({kind:'cargo'})]);if(!alive.current||ticket!==choiceRead.current)return;setChoices(current=>({...current,...(results[0].status==='fulfilled'?{categories:results[0].value.items}:{}),...(results[1].status==='fulfilled'?{brands:results[1].value.items}:{}),...(results[2].status==='fulfilled'?{cargo:results[2].value.items}:{})}));const failed=results.find(result=>result.status==='rejected');if(failed?.status==='rejected')setChoicesError(errorCode(failed.reason));setChoicesBusy(false);}
  useEffect(()=>{if(draft.mode==='create')void loadChoices();/* Searches apply only on the explicit search action. */},[draft.mode,client]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    const ticket=++attributeRead.current;if(draft.mode!=='create'||!draft.category){setAttributes(EMPTY);setAttrsError('');setAttrsBusy(false);return;}
    setAttrsBusy(true);setAttrsError('');setAttributes(EMPTY);
    void client.options({kind:'attributes',categoryId:Number(draft.category)}).then(result=>{if(alive.current&&ticket===attributeRead.current)setAttributes(result.items);}).catch(caught=>{if(alive.current&&ticket===attributeRead.current)setAttrsError(errorCode(caught));}).finally(()=>{if(alive.current&&ticket===attributeRead.current)setAttrsBusy(false);});
    return()=>{attributeRead.current++;};
  },[draft.category,draft.mode,attrsRevision,client]);
  const locked=busy||Boolean(attempt),vatRate=trendyolVatRate(product.tax),taxIssue=trendyolTaxIssue(product.tax);
  function change<K extends keyof Draft>(key:K,value:Draft[K]){if(locked)return;setError('');setDraft(current=>({...current,[key]:value,...(key==='category'?{attributes:{}}:{})}));}
  function attribute(id:number,value:AttributeDraft){if(locked)return;setError('');setDraft(current=>({...current,attributes:{...current.attributes,[id]:value}}));}
  async function submit(event:FormEvent){event.preventDefault();if(saving.current)return;
    let command=attempt;
    if(!command){
      if(taxIssue&&(draft.enabled||!product.mapping)){setError(taxIssue);return;}
      if(draft.mode==='create'&&(choicesBusy||choicesError||attrsBusy||attrsError)){setError('options_required');return;}
      const missing=attributes.find(a=>a.required&&!draft.attributes[Number(a.id)]?.valueId&&!draft.attributes[Number(a.id)]?.value.trim());
      if(draft.mode==='create'&&missing){setError('required_attributes');return;}
      if(draft.mode==='create'&&Object.values(draft.attributes).some(value=>value.value.trim().length>50)){setError('attribute_too_long');return;}
      const invalidAttribute=attributes.some(a=>{const v=draft.attributes[Number(a.id)];return v&&(v.valueId?!a.values?.some(option=>String(option.id)===v.valueId):Boolean(v.value.trim())&&!a.allowCustom);});
      if(draft.mode==='create'&&invalidAttribute){setError('invalid_attributes');return;}
      try{const input=parseTrendyolListingInput({variantId:product.variantId,barcode:draft.barcode.trim(),mode:draft.mode,categoryId:draft.category?Number(draft.category):null,brandId:draft.brand?Number(draft.brand):null,cargoProviderCode:draft.cargo||null,vatRate:vatRate??product.mapping?.vatRate,dimensionalWeight:Number(draft.weight.replace(',','.')),enabled:draft.enabled,attributes:Object.entries(draft.attributes).filter(([,v])=>v.valueId||v.value.trim()).map(([id,v])=>({attributeId:Number(id),...(v.valueId?{valueId:Number(v.valueId)}:{value:v.value.trim()})}))});command={input,operationId:crypto.randomUUID()};}catch{setError('invalid_input');return;}
    }
    setAttempt(command);saving.current=true;setBusy(true);setError('');
    try{await client.map(command.input,command.operationId);if(alive.current){setAttempt(null);onSaved();}}
    catch(caught){if(alive.current){const code=errorCode(caught);setError(code);if(definitiveFailure(code))setAttempt(null);}}
    finally{saving.current=false;if(alive.current)setBusy(false);}
  }
  function options(items:readonly TrendyolOption[],selected:string){return <>{selected&&!items.some(item=>String(item.id)===selected)?<option value={selected}>Kayıtlı seçim · {selected}</option>:null}{items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</>;}
  return <OrderActionDialog open title="Trendyol ürün eşlemesi" onClose={()=>{if(!locked)onClose();}} busy={locked} className={styles.productDialog} footer={<div className={styles.dialogActions}><button className="button button-secondary" type="button" disabled={locked} onClick={onClose}>Kapat</button><button className="button button-primary" type="submit" form="trendyol-mapping-form" disabled={busy||draft.mode==='create'&&(choicesBusy||attrsBusy)}>{busy?'Kaydediliyor…':attempt?'Eşlemeyi tekrar dene':'Eşlemeyi kaydet'}</button></div>}>
    <form id="trendyol-mapping-form" className={styles.editorForm} onSubmit={event=>void submit(event)}>
      <p className={styles.productIdentity}><strong>{product.title}</strong>{product.sku?<span>{product.sku}</span>:null}</p>
      <fieldset className={styles.modeChoice} disabled={locked}><legend>Eşleme türü</legend><label><input type="radio" name="listingMode" checked={draft.mode==='existing'} onChange={()=>change('mode','existing')}/>Mevcut Trendyol ilanı</label><label><input type="radio" name="listingMode" checked={draft.mode==='create'} onChange={()=>change('mode','create')}/>Yeni Trendyol ilanı</label></fieldset>
      <p className={styles.help}>{draft.mode==='existing'?'Aynı barkodlu mevcut ilan için stok ve hesaplanan fiyat aktarılır.':'Kaydettiğiniz ürün bilgileri Trendyol’a gönderim için sıraya alınır. Yayın durumu Trendyol kontrolünden sonra güncellenir.'}</p>
      <label className={styles.field}>Trendyol barkodu<input aria-label="Trendyol barkodu" value={draft.barcode} required maxLength={40} disabled={locked} onChange={event=>change('barcode',event.target.value)}/></label>
      {draft.mode==='create'?<section className={styles.mappingChoices} aria-busy={choicesBusy||attrsBusy||undefined}>
        <div className={styles.formGrid}><label className={styles.field}>Kategori ara<input value={categorySearch} maxLength={200} disabled={locked||choicesBusy} onChange={event=>setCategorySearch(event.target.value)}/></label><label className={styles.field}>Marka ara<input value={brandSearch} maxLength={200} disabled={locked||choicesBusy} onChange={event=>setBrandSearch(event.target.value)}/></label></div>
        <button type="button" className="button button-secondary" disabled={locked||choicesBusy} onClick={()=>void loadChoices()}>{choicesBusy?'Seçenekler yükleniyor…':'Kategori ve marka ara'}</button>
        {choicesError?<p role="alert" className={styles.feedback}>{failureMessage(choicesError)} Seçenekleri yeniden arayabilirsiniz.</p>:null}
        <div className={styles.formGrid}><label className={styles.field}>Kategori<select aria-label="Kategori" value={draft.category} required disabled={locked||choicesBusy} onChange={event=>change('category',event.target.value)}><option value="">Kategori seçin</option>{options(choices.categories,draft.category)}</select></label><label className={styles.field}>Marka<select aria-label="Marka" value={draft.brand} required disabled={locked||choicesBusy} onChange={event=>change('brand',event.target.value)}><option value="">Marka seçin</option>{options(choices.brands,draft.brand)}</select></label><label className={styles.field}>Kargo firması<select aria-label="Kargo firması" value={draft.cargo} required disabled={locked||choicesBusy} onChange={event=>change('cargo',event.target.value)}><option value="">Kargo firması seçin</option>{options(choices.cargo,draft.cargo)}</select></label></div>
        {attrsBusy?<p role="status" className={styles.help}>Kategori özellikleri yükleniyor…</p>:null}
        {attrsError?<div className={styles.feedback}><p role="alert">Kategori özellikleri yüklenemedi. {failureMessage(attrsError)}</p><button type="button" className="button button-secondary" disabled={locked||attrsBusy} onClick={()=>setAttrsRevision(value=>value+1)}>Özellikleri yeniden yükle</button></div>:null}
        {attributes.length?<div className={styles.formGrid}>{attributes.map(a=>{const value=draft.attributes[Number(a.id)]??{valueId:'',value:''};return <div key={a.id} className={styles.attribute}><label className={styles.field}>{a.name}{a.required?' *':''}{a.values?.length?<select aria-label={a.name} value={value.valueId} required={a.required&&!value.value.trim()} disabled={locked} onChange={event=>attribute(Number(a.id),{valueId:event.target.value,value:''})}><option value="">Seçin{a.allowCustom?' veya aşağıya yazın':''}</option>{a.values.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select>:null}{!a.values?.length&&a.allowCustom?<input aria-label={a.name} value={value.value} required={a.required} maxLength={50} disabled={locked} onChange={event=>attribute(Number(a.id),{valueId:'',value:event.target.value})}/>:null}</label>{!a.values?.length&&!a.allowCustom?<p className={styles.help}>Bu özellik için seçilebilir değer alınamadı. Özellikleri yeniden yükleyin.</p>:null}{a.allowCustom&&a.values?.length?<label className={styles.field}>Özel {a.name.toLocaleLowerCase('tr-TR')}<input aria-label={`Özel ${a.name}`} value={value.value} maxLength={50} disabled={locked} onChange={event=>attribute(Number(a.id),{valueId:'',value:event.target.value})}/></label>:null}</div>;})}</div>:null}
      </section>:null}
      <div className={styles.formGrid}><div className={styles.field}><span>Kayıtlı ürün KDV’si</span><output aria-label="Kayıtlı ürün KDV’si">{product.tax===null?'Belirlenmedi':product.tax.treatment==='exempt'?'KDV istisnası':`%${(product.tax.rateBps/100).toLocaleString('tr-TR')}`}</output><p className={styles.help}>{taxIssue?failureMessage(taxIssue):'Ürün kartındaki vergi seçimi kullanılır.'} <Link href={`/products/${product.productId}`}>Üründe düzenle</Link></p></div><label className={styles.field}>Desi<input aria-label="Desi" inputMode="decimal" value={draft.weight} required disabled={locked} onChange={event=>change('weight',event.target.value)}/></label></div>
      {product.webPriceCents!==null&&vatRate!==null?<TrendyolPricePreview webPriceCents={product.webPriceCents} rule={{...pricing,productVatBps:vatRate*100}}/>:null}
      <label className={styles.check}><input className={checkbox.checkbox} type="checkbox" checked={draft.enabled} disabled={locked} onChange={event=>change('enabled',event.target.checked)}/>Stok ve fiyat aktarımı açık</label>
      {error?<p className={styles.feedback} role="alert">{error==='required_attributes'?'Zorunlu kategori özelliklerini tamamlayın.':error==='attribute_too_long'?'Özellik değeri en fazla 50 karakter olabilir.':error==='invalid_attributes'?'Kategori özelliklerini güncel seçeneklerden yeniden seçin.':error==='options_required'?'Kategori ve özellik seçeneklerini yeniden yükleyin.':failureMessage(error)}</p>:null}
    </form>
  </OrderActionDialog>;
}
