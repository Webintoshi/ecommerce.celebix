"use client";

import {useEffect,useRef,useState,type MutableRefObject} from 'react';
import {flushSync} from 'react-dom';
import {ChevronDown,Sparkles,X} from 'lucide-react';
import type {ContentAuthoringField,ContentAuthoringRequest,ContentGenerationView} from '@celebix/saas-contracts';
import {usePanelChromeModel} from '@/components/panel/PanelLayoutClient';
import {ContentAuthoringApiError,contentAuthoringClient} from '@/lib/content-authoring-ui/client';
import {captureAuthoringSnapshot,canApplyAuthoringDraft,type AuthoringLifecycle} from '@/lib/content-authoring-ui/state';
import {renderContentAuthoringDescription} from '@/lib/server-content-authoring/render';
import {TOSHI_CREDIT_PRICES,type ToshiCreditPrices,type ToshiWallet} from '@/lib/content-authoring-ui/credits-client';
import {createAuthoringThumbnail,imageSignature,selectedImageBatches,type AuthoringImage,type AuthoringImageAlt,type AuthoringMediaBridge} from '@/lib/content-authoring-ui/image-alts';
import type {StoreWritingPreferencesApi} from '@/lib/content-authoring-ui/store-writing-preferences';
import styles from './content-authoring.module.css';
import checkboxStyles from '@/components/shared/selection-checkbox.module.css';

export type ContentAuthoringBridge=Readonly<{
 capture():Readonly<{request:ContentAuthoringRequest;lifecycle:Omit<AuthoringLifecycle,'storeKey'>}>;
 canApply?(field:ContentAuthoringField,generation:ContentGenerationView,selection:AuthoringLifecycle['selection']):boolean;
 apply(field:ContentAuthoringField,generation:ContentGenerationView,selection:AuthoringLifecycle['selection']):boolean;
 media?:AuthoringMediaBridge;
}>;
type AuthoringApi=Pick<typeof contentAuthoringClient,'generate'|'get'>&Partial<Pick<typeof contentAuthoringClient,'credits'|'imageAlts'>>;
type AuthoringSnapshot=ReturnType<typeof captureAuthoringSnapshot>;
type ImageRequest=Parameters<typeof contentAuthoringClient.imageAlts>[0];
export type ContentAuthoringIntent=Readonly<{binding:string;signature:string;snapshot:AuthoringSnapshot;images:readonly AuthoringImage[];imageIds:readonly string[];textKey:string;imageKeys:readonly string[];imageRequests:readonly (ImageRequest|null)[];completedTextCost:number;completedImageCounts:readonly number[];uncertain:boolean}>;
type ApplyProgress={snapshot:AuthoringSnapshot;images:readonly AuthoringImage[];fields:Set<ContentAuthoringField>;imageIds:Set<string>};
const labels={description:'Açıklama',seoTitle:'SEO başlığı',seoDescription:'SEO açıklaması'};
const errors:Record<string,string>={source_preservation_required:'Mevcut açıklamadaki ürün bilgileri güvenle korunamıyor. Mevcut metni elle düzenleyin. Kredi harcanmadı; alanlarınız değişmedi.',connection_missing:'Toshi şu anda kullanılamıyor. Yeniden deneyin.',feature_unavailable:'Toshi şu anda kullanılamıyor.',stale:'Alanlar değişti. Güncel bilgilerle yeniden hazırlayın.',generation_pending:'İçerik henüz tamamlanmadı. Biraz sonra yeniden deneyin.',provider_failed:'İçerik hazırlanamadı. Yeniden deneyin.',invalid_output:'İçerik uygun biçimde hazırlanamadı. Yeniden deneyin.',budget_exceeded:'Yeterli Toshi krediniz yok.',insufficient_credits:'Yeterli Toshi krediniz yok.',quota_exceeded:'Yeterli Toshi krediniz yok.',rate_limited:'Çok sık deneme yapıldı. Biraz bekleyin.',operation_busy:'İçerik hazırlanıyor. Tamamlanmasını bekleyin.',operation_failed:'Önceki deneme tamamlanamadı. Yeniden hazırlayabilirsiniz.',version_conflict:'Ürün değişti. Güncel sürümü yükleyin.',provider_timeout:'İçerik zamanında hazırlanamadı. Yeniden deneyin.',provider_unavailable:'Toshi şu anda kullanılamıyor. Yeniden deneyin.',image_unavailable:'Görsel okunamadı. Görseli kontrol edip yeniden deneyin.',image_too_large:'Görsel hazırlanamadı. Daha küçük bir görselle yeniden deneyin.'};

export function ContentAuthoringPanel({bridge,onClose,api=contentAuthoringClient,intentState,fields:allowedFields=['description','seoTitle','seoDescription']}:{bridge:ContentAuthoringBridge;onClose():void;api?:AuthoringApi;intentState?:MutableRefObject<ContentAuthoringIntent|null>;preferencesApi?:StoreWritingPreferencesApi;fields?:readonly ContentAuthoringField[]}){
 const storeKey=usePanelChromeModel().activeStoreSelectionKey??'';
 const ownIntent=useRef<ContentAuthoringIntent|null>(null);const retryIntent=intentState??ownIntent;
 const bindingRef=useRef('');try{const value=bridge.capture();bindingRef.current=JSON.stringify([value.request.productId,value.request.draftId,value.lifecycle.sessionId]);}catch{}
 const binding=bindingRef.current,bindingKey=JSON.stringify([storeKey,binding]);
 const retained=retryIntent.current?.binding===bindingKey&&retryIntent.current.uncertain?retryIntent.current:null;
 const [restoring,setRestoring]=useState(Boolean(retained));
 const [fields,setFields]=useState<readonly ContentAuthoringField[]>(()=>retained?.snapshot.request.fields??[allowedFields[0]].filter(Boolean));
 const [images,setImages]=useState<readonly AuthoringImage[]>(()=>retained?.images??bridge.media?.captureImages()??[]);
 const [imageIds,setImageIds]=useState<readonly string[]>(()=>retained?.imageIds??images.filter(image=>!image.altText.trim()).map(image=>image.id));
 const [wallet,setWallet]=useState<ToshiWallet|null>(null),[prices,setPrices]=useState<ToshiCreditPrices>(TOSHI_CREDIT_PRICES);
 const [creditState,setCreditState]=useState<'loading'|'ready'|'error'>(api.credits?'loading':'ready');
 const [creditRetry,setCreditRetry]=useState(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [result,setResult]=useState<ContentGenerationView|null>(null);
 const [imageResults,setImageResults]=useState<readonly AuthoringImageAlt[]>([]);
 const [selectedPreviewFields,setSelectedPreviewFields]=useState<readonly ContentAuthoringField[]>([]);
 const [selectedPreviewImages,setSelectedPreviewImages]=useState<readonly string[]>([]);
 const captured=useRef<ReturnType<typeof captureAuthoringSnapshot>|null>(null);
 const capturedImages=useRef<readonly AuthoringImage[]>([]);
 const applyProgress=useRef<ApplyProgress|null>(null);
 const live=useRef({bridge,storeKey});live.current={bridge,storeKey};
 let liveImages:readonly AuthoringImage[]=[];try{liveImages=bridge.media?.captureImages()??[];}catch{}
 const liveImageSignature=imageSignature(liveImages);
 useEffect(()=>{if(restoring)return;setImages(liveImages);setImageIds(current=>{const previous=new Set(images.map(image=>image.id));return liveImages.filter(image=>current.includes(image.id)||!previous.has(image.id)&&!image.altText.trim()).map(image=>image.id);});},[binding,liveImageSignature,restoring]);
 const abort=useRef<AbortController|null>(null),epoch=useRef(0),running=useRef(false);
 useEffect(()=>{epoch.current++;abort.current?.abort();setResult(null);setImageResults([]);setError('');setBusy(false);running.current=false;applyProgress.current=null;if(retryIntent.current?.binding!==bindingKey)retryIntent.current=null;const saved=retryIntent.current?.uncertain?retryIntent.current:null;setRestoring(Boolean(saved));const next=saved?.images??live.current.bridge.media?.captureImages()??[];setImages(next);setImageIds(saved?.imageIds??next.filter(image=>!image.altText.trim()).map(image=>image.id));return()=>{epoch.current++;abort.current?.abort();};},[storeKey,binding]);
 useEffect(()=>{if(!api.credits)return;const controller=new AbortController();setWallet(null);setCreditState('loading');void api.credits(controller.signal).then(value=>{if(!controller.signal.aborted){setWallet(value.wallet);setPrices(value.prices);setCreditState('ready');}}).catch(()=>{if(!controller.signal.aborted)setCreditState('error');});return()=>controller.abort();},[api,storeKey,binding,creditRetry]);
 function snapshot(){const source=live.current.bridge.capture();return captureAuthoringSnapshot({...source.request,action:'auto',tone:'neutral',brandVoice:null,length:'medium',note:'',fields,selection:null},{...source.lifecycle,selection:null,storeKey:live.current.storeKey});}
 const textCost=fields.reduce((sum,field)=>sum+prices[field],0);
 const fullTotal=textCost+imageIds.length*prices.imageAlt;
 let quoteSignature='';try{quoteSignature=JSON.stringify([snapshot(),imageSignature(liveImages),imageIds]);}catch{}
 const resumed=restoring&&retryIntent.current?.binding===bindingKey?retryIntent.current:null;
 const matchingRetry=resumed??(retryIntent.current?.signature===quoteSignature?retryIntent.current:null);
 const cachedCost=matchingRetry?matchingRetry.completedTextCost+matchingRetry.completedImageCounts.reduce((sum,count)=>sum+count*prices.imageAlt,0):0;
 const total=Math.max(0,fullTotal-cachedCost);
 const insufficient=!resumed&&wallet!==null&&wallet.available<total;
 async function generate(){
  if(running.current||!fullTotal||creditState!=='ready'||insufficient)return;
  running.current=true;const ownEpoch=++epoch.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;setError('');setNotice('');setResult(null);setImageResults([]);setBusy(true);applyProgress.current=null;
  let activeBatchIndex:number|null=null;let textCompleted=false;let returnedTextTerminal=false;
  try{
   const snap=resumed?.snapshot??snapshot();captured.current=snap;const sourceImages=resumed?.images??live.current.bridge.media?.captureImages()??[];if(!resumed&&imageIds.length&&imageSignature(sourceImages)!==imageSignature(images))throw new ContentAuthoringApiError('stale');capturedImages.current=sourceImages;
   const selectedImages=resumed?.imageIds??imageIds,batches=selectedImageBatches(sourceImages,selectedImages);
   const signature=resumed?.signature??JSON.stringify([snap,imageSignature(sourceImages),selectedImages]);
   if(!resumed&&signature!==quoteSignature)throw new ContentAuthoringApiError('stale');
   if(retryIntent.current?.signature!==signature)retryIntent.current={binding:bindingKey,signature,snapshot:snap,images:sourceImages,imageIds:selectedImages,textKey:crypto.randomUUID(),imageKeys:batches.map(()=>crypto.randomUUID()),imageRequests:batches.map(()=>null),completedTextCost:0,completedImageCounts:batches.map(()=>0),uncertain:true};
   const intent=retryIntent.current;retryIntent.current={...intent,uncertain:true};
   let generation:ContentGenerationView|null=null;
   if(snap.request.fields.length){if(resumed){try{generation=await api.get(intent.textKey,controller.signal);}catch(failure){if(!(failure instanceof ContentAuthoringApiError)||failure.code!=='operation_not_found')throw failure;generation=await api.generate(snap.request,intent.textKey,controller.signal);}}else generation=await api.generate(snap.request,intent.textKey,controller.signal);for(let attempts=0;generation.status==='pending'&&attempts<30;attempts++){await new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,1500);controller.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});});generation=await api.get(generation.id,controller.signal);}if(generation.status==='failed'||generation.status==='unknown'){returnedTextTerminal=true;throw new ContentAuthoringApiError(generation.safeCode??'operation_failed');}if(generation.status!=='completed')throw new ContentAuthoringApiError(generation.safeCode??'generation_pending');}
   if(epoch.current!==ownEpoch)return;
   textCompleted=true;
   retryIntent.current={...retryIntent.current!,completedTextCost:textCost};
   if(generation){setResult(generation);setSelectedPreviewFields(snap.request.fields.filter(field=>generation?.draft?.[field]!==undefined));}
   const generatedImages:AuthoringImageAlt[]=[];const failed:string[]=[];
   for(const [batchIndex,batch] of batches.entries()){
    activeBatchIndex=batchIndex;
    if(!api.imageAlts)throw new Error('image_unavailable');
    let request:ImageRequest|null=retryIntent.current!.imageRequests[batchIndex]??null;
    if(!request){const thumbnails=await Promise.all(batch.map(async image=>({id:image.id,dataUrl:await createAuthoringThumbnail(image.file??image.thumbnailUrl??image.url??'',controller.signal),...(image.variantLabel?{variantLabel:image.variantLabel}:{})})));if(epoch.current!==ownEpoch)return;request={draftId:snap.request.draftId,productId:snap.request.productId,context:{title:snap.request.currentDraft.title,...(snap.request.currentDraft.description?{description:snap.request.currentDraft.description}:{})},images:thumbnails};retryIntent.current={...retryIntent.current!,imageRequests:retryIntent.current!.imageRequests.map((value,index)=>index===batchIndex?request!:value)};}
    const response=await api.imageAlts(request,intent.imageKeys[batchIndex],controller.signal);
    if(epoch.current!==ownEpoch)return;retryIntent.current={...retryIntent.current!,completedImageCounts:retryIntent.current!.completedImageCounts.map((count,index)=>index===batchIndex?batch.length:count)};generatedImages.push(...response.results);failed.push(...response.failedIds);setWallet(response.wallet);setImageResults([...generatedImages]);setSelectedPreviewImages(generatedImages.map(image=>image.id));activeBatchIndex=null;
   }
   retryIntent.current=null;setRestoring(false);
   if(failed.length)setNotice(`${failed.length} görsel hazırlanamadı. Hazırlanan alt metinleri uygulayabilirsiniz.`);
   if(api.credits){try{const value=await api.credits(controller.signal);if(epoch.current===ownEpoch)setWallet(value.wallet);}catch{if(epoch.current===ownEpoch&&!controller.signal.aborted){setCreditState('error');setNotice('İçerikler hazır. Kredi bakiyesi güncellenemedi.');}}}
  }catch(failure){if(epoch.current===ownEpoch&&!controller.signal.aborted&&failure instanceof ContentAuthoringApiError&&(returnedTextTerminal||['operation_failed','invalid_output'].includes(failure.code))&&retryIntent.current){const intent=retryIntent.current;setRestoring(false);retryIntent.current={...intent,uncertain:false,...(!textCompleted?{textKey:crypto.randomUUID(),completedTextCost:0}:{}),imageKeys:intent.imageKeys.map((key,index)=>index===activeBatchIndex?crypto.randomUUID():key),completedImageCounts:intent.completedImageCounts.map((count,index)=>index===activeBatchIndex?0:count)};}if(epoch.current===ownEpoch&&!controller.signal.aborted)setError(failure instanceof ContentAuthoringApiError?failure.code:failure instanceof Error&&['image_unavailable','image_too_large','invalid_image'].includes(failure.message)?failure.message:'unavailable');}
  finally{if(epoch.current===ownEpoch){running.current=false;setBusy(false);}}
 }
 async function apply(selectedFields:readonly ContentAuthoringField[],selectedImages:readonly string[]=[]){
  if(running.current||!captured.current)return;
  const ownEpoch=epoch.current;
  let current;try{current=snapshot();}catch{setError('stale');return;}
  const progress=applyProgress.current,baseline=progress?.snapshot??captured.current;
  const remainingFields=selectedFields.filter(field=>!progress?.fields.has(field));
  const media=live.current.bridge.media,expectedImages=progress?.images??capturedImages.current;
  const chosenImages=imageResults.filter(image=>selectedImages.includes(image.id)&&!progress?.imageIds.has(image.id));
  if(JSON.stringify(baseline)!==JSON.stringify(current)||(remainingFields.length&&(!result||!canApplyAuthoringDraft(captured.current,captured.current,result)))||(chosenImages.length&&(!media||imageSignature(media.captureImages())!==imageSignature(expectedImages)||!media.canApplyImageAlts(chosenImages,expectedImages)))){setError('stale');return;}
  try{
   if(!remainingFields.length&&!chosenImages.length)return;
   if(remainingFields.length>1&&!bridge.canApply||bridge.canApply&&!remainingFields.every(field=>bridge.canApply!(field,result!,null))){setError('stale');return;}
   running.current=true;setBusy(true);setError('');
   const ownProgress=progress??{snapshot:baseline,images:expectedImages,fields:new Set<ContentAuthoringField>(),imageIds:new Set<string>()};applyProgress.current=ownProgress;
   for(const field of remainingFields){let applied=false;flushSync(()=>{applied=bridge.apply(field,result!,null);});if(!applied){setError('stale');return;}ownProgress.fields.add(field);ownProgress.snapshot=snapshot();setSelectedPreviewFields(values=>values.filter(value=>value!==field));}
   if(chosenImages.length){
    const applied=await media!.applyImageAlts(chosenImages,ownProgress.images,image=>{if(epoch.current!==ownEpoch||!chosenImages.some(value=>value.id===image.id))return;ownProgress.images=ownProgress.images.map(value=>value.id===image.id?image:value);ownProgress.imageIds.add(image.id);setSelectedPreviewImages(values=>values.filter(id=>id!==image.id));});
    if(epoch.current!==ownEpoch)return;
    if(!applied){setError('Alt metinler kaydedilemedi. Yeniden deneyin; uygulanan alanlar korunur.');return;}
   }
   setResult(null);setImageResults([]);setError('');applyProgress.current=null;onClose();
  }catch{if(epoch.current===ownEpoch)setError('İçerikler uygulanamadı. Yeniden deneyin; uygulanan alanlar korunur.');}
  finally{if(epoch.current===ownEpoch){running.current=false;setBusy(false);}}
 }
 const hasPreview=Boolean(result?.draft||imageResults.length);
 return <section onChange={event=>event.stopPropagation()} className={styles.panel} aria-label="Toshi ile içerik" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onClose();}}}>
  <div className={styles.heading}><div className={styles.identity}><Sparkles aria-hidden="true"/><strong>Toshi</strong></div><span className={styles.wallet}>{wallet?<><strong>{wallet.available.toLocaleString('tr-TR')}</strong> kredi</>:'Kredi bakiyesi'}</span><button className={styles.closeButton} type="button" onClick={onClose} aria-label="Toshi panelini kapat" title="Kapat"><X aria-hidden="true"/></button></div>
  <div className={styles.fields} role="group" aria-label="Hazırlanacak alanlar">{allowedFields.map(field=><label key={field}><input className={checkboxStyles.checkbox} type="checkbox" disabled={busy||restoring} checked={fields.includes(field)} onChange={event=>setFields(current=>event.target.checked?[...current,field]:current.filter(value=>value!==field))}/><span>{labels[field]}<small>{prices[field]} kredi</small></span></label>)}</div>
  {images.length?<details className={styles.imageChoices}><summary><span>Görsel alt metinleri</span><span className={styles.imageSummary}>{imageIds.length}/{images.length} görsel · {imageIds.length*prices.imageAlt} kredi<ChevronDown aria-hidden="true"/></span></summary><div className={styles.imageFields}>{images.map((image,index)=><label key={image.id}><input className={checkboxStyles.checkbox} type="checkbox" disabled={busy||restoring} checked={imageIds.includes(image.id)} onChange={event=>setImageIds(current=>event.target.checked?[...current,image.id]:current.filter(id=>id!==image.id))}/>{image.url?<img src={image.url} alt="" width="40" height="40"/>:null}<span>{image.variantLabel||`${index+1}. görsel`}<small>{image.altText||'Alt metin boş'} · {prices.imageAlt} kredi</small></span></label>)}</div></details>:null}
  <div className={styles.prepareRow}><small>{resumed?'Önceki deneme aynı işlemle kontrol edilir.':cachedCost?'Tamamlanan alanlar yeniden ücretlendirilmez.':'Seçilmeyen alanlar korunur.'}</small><button className={`${styles.prepareButton} ${hasPreview?styles.regenerateButton:''}`} type="button" disabled={busy||!fullTotal||creditState!=='ready'||insufficient} onClick={()=>void generate()}>{busy?'Hazırlanıyor…':`Seçilenleri hazırla · ${total} kredi`}</button></div>
  {creditState==='loading'?<p role="status">Krediler yükleniyor…</p>:null}
  {creditState==='error'?<div role="alert">Kredi bakiyesi yüklenemedi. <button type="button" onClick={()=>setCreditRetry(value=>value+1)}>Yeniden dene</button></div>:null}
  {insufficient?<p role="alert">Yeterli Toshi krediniz yok. <a href="/settings/artificial-intelligence">Kredi yükle</a></p>:null}
  {error?<p role="alert">{errors[error]??(/^[a-z_]+$/.test(error)?'İçerik hazırlanamadı. Yeniden deneyin.':error)}{['insufficient_credits','quota_exceeded','budget_exceeded'].includes(error)?<> <a href="/settings/artificial-intelligence">Kredi yükle</a></>:null}</p>:null}
  {notice?<p role="status">{notice}</p>:null}
  {hasPreview?<div className={styles.previews} aria-label="AI içerik önizlemesi"><h3>Önizleme</h3>{result?.draft?.claims.some(claim=>claim.factRef.startsWith('source:'))?<p>Mevcut açıklamadaki ifadeler korunur.</p>:null}{fields.map(field=>{const content=result?.draft?.[field];if(content===undefined)return null;return <div key={field} className={styles.preview}><label><input className={checkboxStyles.checkbox} type="checkbox" disabled={applyProgress.current?.fields.has(field)} checked={selectedPreviewFields.includes(field)} onChange={event=>setSelectedPreviewFields(current=>event.target.checked?[...current,field]:current.filter(value=>value!==field))}/>{labels[field]}</label>{field==='description'?<div dangerouslySetInnerHTML={{__html:renderContentAuthoringDescription(result?.draft?.description??[])}}/>:<p>{String(content)}</p>}<button type="button" disabled={busy||applyProgress.current?.fields.has(field)} onClick={()=>void apply([field])}>{labels[field]} alanına uygula</button></div>;})}{imageResults.map(image=><div key={image.id} className={styles.preview}><label><input className={checkboxStyles.checkbox} type="checkbox" disabled={applyProgress.current?.imageIds.has(image.id)} checked={selectedPreviewImages.includes(image.id)} onChange={event=>setSelectedPreviewImages(current=>event.target.checked?[...current,image.id]:current.filter(id=>id!==image.id))}/>{images.find(value=>value.id===image.id)?.variantLabel||`${images.findIndex(value=>value.id===image.id)+1}. görsel`}</label><p>{image.altText}</p></div>)}<button className={styles.applyButton} type="button" disabled={busy||!selectedPreviewFields.length&&!selectedPreviewImages.length} onClick={()=>void apply(selectedPreviewFields,selectedPreviewImages)}>Seçili alanlara uygula</button>{result?.draft?.suggestions.length?<ul>{result.draft.suggestions.map((suggestion,index)=><li key={index}>{suggestion}</li>)}</ul>:null}<p>Ürün alanlarını uyguladıktan sonra kaydedin.</p></div>:null}
 </section>;
}
