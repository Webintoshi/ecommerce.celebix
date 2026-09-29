"use client";
import {useEffect,useRef,useState} from 'react';
import type {ContentAuthoringField,ContentAuthoringRequest,ContentGenerationView} from '@celebix/saas-contracts';
import {usePanelChromeModel} from '@/components/panel/PanelLayoutClient';
import {ContentAuthoringApiError,contentAuthoringClient} from '@/lib/content-authoring-ui/client';
import {captureAuthoringSnapshot,canApplyAuthoringDraft,type AuthoringLifecycle} from '@/lib/content-authoring-ui/state';
import {renderContentAuthoringDescription} from '@/lib/server-content-authoring/render';
import {acquireStoreWritingDefaults,type StoreWritingPreferencesApi} from '@/lib/content-authoring-ui/store-writing-preferences';
import styles from './content-authoring.module.css';
export type ContentAuthoringBridge=Readonly<{
 capture():Readonly<{request:ContentAuthoringRequest;lifecycle:Omit<AuthoringLifecycle,'storeKey'>}>;
 apply(field:ContentAuthoringField,generation:ContentGenerationView,selection:AuthoringLifecycle['selection']):boolean;
}>;
export function ContentAuthoringPanel({bridge,onClose,api=contentAuthoringClient,preferencesApi,fields:allowedFields=["description","seoTitle","seoDescription"]}:{bridge:ContentAuthoringBridge;onClose():void;api?:typeof contentAuthoringClient;preferencesApi?:StoreWritingPreferencesApi;fields?:readonly ContentAuthoringField[]}){
 const model=usePanelChromeModel();
 const storeKey=model.activeStoreSelectionKey??'';
 const [action,setAction]=useState<ContentAuthoringRequest['action']>('improve');
 const [tone,setTone]=useState<ContentAuthoringRequest['tone']|'store'>(()=>{try{return bridge.capture().request.tone ?? 'neutral';}catch{return 'neutral';}});
 const [locale,setLocale]=useState(()=>{try{return bridge.capture().request.locale ?? 'tr-TR';}catch{return 'tr-TR';}});
 const toneChoice=useRef<ContentAuthoringRequest["tone"]|"store">(tone);
 const [storeTone,setStoreTone]=useState<string|null>(null);
 const [preferencesStatus,setPreferencesStatus]=useState<'loading'|'ready'|'error'>('loading');
 const [preferencesRetry,setPreferencesRetry]=useState(0);
 const [,setChoiceRevision]=useState(0);
 const explicitChoices=useRef({tone:false,locale:false});
 const preferencesEpoch=useRef(0);const preferencesContext=useRef('');
 const [length,setLength]=useState<ContentAuthoringRequest['length']>('medium');
 const [note,setNote]=useState('');
 const [fields,setFields]=useState<readonly ContentAuthoringField[]>([allowedFields[0]]);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const [selectedPreviewFields,setSelectedPreviewFields]=useState<readonly ContentAuthoringField[]>([]);
 const [result,setResult]=useState<ContentGenerationView|null>(null);
 const captured=useRef<ReturnType<typeof captureAuthoringSnapshot>|null>(null);
 const live=useRef({bridge,storeKey});live.current={bridge,storeKey};
 const lastBinding=useRef("");try{const value=bridge.capture();lastBinding.current=JSON.stringify([value.request.productId,value.request.draftId,value.lifecycle.sessionId]);}catch{}
 const binding=lastBinding.current;
 const abort=useRef<AbortController|null>(null);const epoch=useRef(0);const generating=useRef(false);
 useEffect(()=>{epoch.current++;abort.current?.abort();setResult(null);setBusy(false);generating.current=false;return()=>{epoch.current++;abort.current?.abort();};},[storeKey,binding]);
 useEffect(()=>{
  const ownEpoch=++preferencesEpoch.current;const controller=new AbortController();const context=JSON.stringify([storeKey,binding]);
  if(preferencesContext.current!==context){
   preferencesContext.current=context;explicitChoices.current={tone:false,locale:false};setStoreTone(null);
   let inheritedTone:ContentAuthoringRequest['tone']='neutral',inheritedLocale='tr-TR';try{const request=live.current.bridge.capture().request;inheritedTone=request.tone;inheritedLocale=request.locale;}catch{}
   toneChoice.current=inheritedTone;setTone(inheritedTone);setLocale(inheritedLocale);
  }
  setPreferencesStatus('loading');
  const shared=acquireStoreWritingDefaults(storeKey,preferencesApi,preferencesRetry>0);
  const aborted=new Promise<never>((_resolve,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('preferences_cancelled')),{once:true}));
  const timer=setTimeout(()=>controller.abort(),5000);
  void Promise.race([shared.promise,aborted]).then(defaults=>{
   if(preferencesEpoch.current!==ownEpoch||controller.signal.aborted)return;
   if(!explicitChoices.current.tone||toneChoice.current!=='store')setStoreTone(defaults.brandVoice);
   if(!explicitChoices.current.tone&&defaults.tone){const next=defaults.brandVoice?'store':defaults.tone;toneChoice.current=next;setTone(next);}
   if(!explicitChoices.current.locale&&defaults.locale)setLocale(defaults.locale);
   setPreferencesStatus('ready');
  }).catch(()=>{if(preferencesEpoch.current===ownEpoch)setPreferencesStatus('error');}).finally(()=>clearTimeout(timer));
  return()=>{preferencesEpoch.current++;clearTimeout(timer);controller.abort();shared.release();};
 },[storeKey,binding,preferencesRetry,preferencesApi]);
 function chooseTone(value:string){if(value!=='neutral'&&value!=='friendly'&&value!=='professional'&&(value!=='store'||!storeTone))return;explicitChoices.current.tone=true;toneChoice.current=value;setTone(value);setChoiceRevision(current=>current+1);}
 function chooseLocale(value:string){if(value.length>35||!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value))return;explicitChoices.current.locale=true;setLocale(value);setChoiceRevision(current=>current+1);}
 function snapshot(){const source=live.current.bridge.capture();const selection=action==='rewrite_selection'?source.request.selection:null;return captureAuthoringSnapshot({...source.request,action,tone:tone==='store'?'neutral':tone,brandVoice:tone==='store'?storeTone:null,locale,length,note,fields,selection},{...source.lifecycle,storeKey:live.current.storeKey});}
 async function generate(){if(generating.current||preferencesStatus==='loading'||(preferencesStatus==='error'&&(!explicitChoices.current.tone||!explicitChoices.current.locale)))return;generating.current=true;const ownEpoch=++epoch.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;setError('');setResult(null);setBusy(true);try{const snap=snapshot();if(action==='rewrite_selection'&&!snap.request.selection){setError('Önce açıklamadaki bir paragrafı seçin.');return;}captured.current=snap;let generation=await api.generate(snap.request,crypto.randomUUID(),controller.signal);for(let attempts=0;generation.status==='pending'&&attempts<30;attempts++){await new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,1500);controller.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});});generation=await api.get(generation.id,controller.signal);}if(epoch.current!==ownEpoch)return;if(generation.status==='completed'){setResult(generation);setSelectedPreviewFields(fields.filter(field=>generation.draft?.[field]!==undefined));}else setError(generation.safeCode??'generation_pending');}catch(failure){if(epoch.current===ownEpoch&&!controller.signal.aborted)setError(failure instanceof ContentAuthoringApiError?failure.code:'unavailable');}finally{if(epoch.current===ownEpoch){generating.current=false;setBusy(false);}}}
 function apply(field:ContentAuthoringField|readonly ContentAuthoringField[]){if(!result||!captured.current)return;let current;try{current=snapshot();}catch{setError('stale');return;}if(!canApplyAuthoringDraft(captured.current,current,result)){setError('stale');return;}const selected=typeof field==='string'?[field]:field;if(selected.length&&selected.every(value=>bridge.apply(value,result!,captured.current!.request.action==='rewrite_selection'?captured.current!.lifecycle.selection:null))){setResult(null);setError('');onClose();}else setError('stale');}
 const labels={description:'Açıklama',seoTitle:'SEO başlığı',seoDescription:'SEO açıklaması'};
 const errors:Record<string,string>={connection_missing:'AI bağlantısı henüz kurulmadı.',feature_unavailable:'AI içerik oluşturma şu anda kullanılamıyor.',stale:'Alanlar değişti. Güncel bilgilerle yeniden oluşturun.',generation_pending:'İçerik henüz tamamlanmadı. Yeniden kontrol etmek için tekrar deneyin.',provider_failed:'İçerik oluşturulamadı. Yeniden deneyin.',budget_exceeded:'AI kullanım sınırına ulaşıldı.',quota_exceeded:'AI kullanım sınırına ulaşıldı.',rate_limited:'Çok sık deneme yapıldı. Biraz bekleyip yeniden deneyin.',operation_busy:'İçerik oluşturma sürüyor. Tamamlanmasını bekleyin.',version_conflict:'Ürün sunucuda değişti. Güncel sürümü yükleyip yeniden deneyin.',provider_timeout:'İçerik oluşturma zamanında tamamlanamadı. Yeniden deneyin.',provider_unavailable:'AI hizmeti şu anda kullanılamıyor. Yeniden deneyin.'};
 return <section onChange={event=>event.stopPropagation()} className={styles.panel} aria-label="AI ile içerik" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onClose();}}}>
  <div className={styles.controls}><label>İşlem<select value={action} onChange={event=>setAction(event.target.value as typeof action)}><option value="create">Yeni içerik</option><option value="improve">İyileştir</option><option value="shorten">Kısalt</option><option value="rewrite_selection">Seçili paragrafı yeniden yaz</option></select></label><button type="button" onClick={onClose} aria-label="AI panelini kapat">Kapat</button></div>
  <div className={styles.fields}>{allowedFields.map(field=><label key={field}><input type="checkbox" checked={fields.includes(field)} onChange={event=>setFields(current=>event.target.checked?[...current,field]:current.filter(value=>value!==field))}/>{labels[field]}</label>)}</div>
  <details><summary>İsteğe bağlı ayarlar</summary><div className={styles.controls}><label>Ton<select value={tone} onChange={event=>chooseTone(event.target.value)}><option value="neutral">Doğal</option><option value="friendly">Samimi</option><option value="professional">Profesyonel</option>{storeTone?<option value="store">Mağaza tonu</option>:null}</select>{tone==='store'&&storeTone?<small>{storeTone}</small>:null}</label><label>Uzunluk<select value={length} onChange={event=>setLength(event.target.value as typeof length)}><option value="short">Kısa</option><option value="medium">Orta</option><option value="long">Uzun</option></select></label><label>Dil<select value={locale} onChange={event=>chooseLocale(event.target.value)}><option value="tr-TR">Türkçe</option><option value="en">English</option>{locale!=="tr-TR"&&locale!=="en"?<option value={locale}>{locale.startsWith("en")?"English":locale.startsWith("tr")?"Türkçe":locale}</option>:null}</select></label></div><label>Ek not<textarea value={note} maxLength={2000} onChange={event=>setNote(event.target.value)} rows={2}/></label></details>
  {preferencesStatus==='loading'?<p role="status">Yazım ayarları yükleniyor…</p>:null}
  {preferencesStatus==='error'?<div role="alert"><p>Yazım ayarları yüklenemedi. Yeniden yükleyin veya ton ve dil seçin.</p><button type="button" onClick={()=>setPreferencesRetry(current=>current+1)}>Yazım ayarlarını yeniden yükle</button></div>:null}
  <button type="button" disabled={busy||!fields.length||preferencesStatus==='loading'||(preferencesStatus==='error'&&(!explicitChoices.current.tone||!explicitChoices.current.locale))} onClick={()=>void generate()}>{busy?'Oluşturuluyor…':'İçerik oluştur'}</button>
  {error?<p role="alert">{errors[error]??(/^[a-z_]+$/.test(error)?'İçerik oluşturulamadı. Yeniden deneyin.':error)}{error==='connection_missing'?<> <a href="/settings/artificial-intelligence">AI bağlantısını ayarla</a></>:null}</p>:null}
  {result?.draft? <div aria-label="AI içerik önizlemesi">{fields.map(field=>{const content=result.draft?.[field];if(content===undefined)return null;return <div key={field} className={styles.preview}><label><input type="checkbox" checked={selectedPreviewFields.includes(field)} onChange={event=>setSelectedPreviewFields(current=>event.target.checked?[...current,field]:current.filter(value=>value!==field))}/>{labels[field]}</label>{field==='description'?<div dangerouslySetInnerHTML={{__html:renderContentAuthoringDescription(result.draft?.description??[])}}/>:<p>{String(content)}</p>}<button type="button" onClick={()=>apply(field)}>{labels[field]} alanına uygula</button></div>;})}<button type="button" disabled={!selectedPreviewFields.length} onClick={()=>apply(selectedPreviewFields)}>Seçili alanlara uygula</button>{result.draft.suggestions.length?<ul>{result.draft.suggestions.map((suggestion,index)=><li key={index}>{suggestion}</li>)}</ul>:null}<p>Uygulanan içerik taslakta kalır; kaydetmeniz gerekir.</p></div>:null}
 </section>;
}
