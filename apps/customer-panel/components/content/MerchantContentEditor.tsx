'use client';
import type{MerchantContentDocument,MerchantContentKind,MerchantContentValues,MerchantContentVersion,MerchantContentOrigins,MerchantContentField,SaveMerchantContentRequest}from'@celebix/saas-contracts';
import type{Editor}from'@tiptap/core';
import Link from'next/link';
import{useRouter}from'next/navigation';
import{useCallback,useEffect,useRef,useState,type FormEvent}from'react';
import{PanelPageHeader,PanelPageShell,PanelStatusBadge}from'@/components/panel/PanelPageShell';
import{MerchantContentBodyField}from'@/components/content/MerchantContentBodyField';
import{ContentResourceAuthoringPanel,type ContentResourceApplyInput}from'@/components/content/ContentResourceAuthoringPanel';
import{applyContentResourceDraft,manualContentFieldEdit}from'@/lib/content-resource-authoring-ui/controller';
import{recoverContentResourceDraft}from'@/lib/content-resource-authoring-ui/recovery';
import{merchantContentApi,MerchantContentApiError}from'@/lib/merchant-content-ui/client';
import{createDirtyNavigationGuard}from'@/lib/catalog-ui/dirty-navigation';
import type{MerchantContentBodyFormat}from'@/lib/merchant-content-body-editor';
import styles from'../merchant-admin/merchant-module-console.module.css';
import operations from'../merchant-admin/merchant-operations.module.css';

type Api=Pick<ReturnType<typeof import('@/lib/merchant-content-ui/client').createMerchantContentApi>,'get'|'save'|'versions'>;
type Props=Readonly<{storeId:string;kind:MerchantContentKind;recordId?:string;returnTo:string;canManage:boolean;initialLocale?:string;aiEnabled?:boolean;researchEnabled?:boolean;api?:Api}>;
type Draft=Readonly<{values:MerchantContentValues;origins:MerchantContentOrigins;bodyFormat:MerchantContentBodyFormat;bodyValid:boolean}>;
const empty=(locale:string):Draft=>({values:{name:'',slug:'',locale,body:'',excerpt:null,seoTitle:null,seoDescription:null,published:false,status:'draft'},origins:{},bodyFormat:'normalized_html',bodyValid:true});
const fromDocument=(document:MerchantContentDocument):Draft=>({values:{name:document.name,slug:document.slug,locale:document.locale,body:document.body,excerpt:document.excerpt,seoTitle:document.seoTitle,seoDescription:document.seoDescription,published:document.published,status:document.status==='active'?'active':'draft'},origins:document.origins,bodyFormat:document.bodyFormat,bodyValid:true});
const identical=(a:Draft,b:Draft)=>a.bodyFormat===b.bodyFormat&&JSON.stringify(a.values)===JSON.stringify(b.values)&&JSON.stringify(a.origins)===JSON.stringify(b.origins);
function message(error:unknown){if(error instanceof MerchantContentApiError)return error.message;if(error instanceof Error&&'code'in error&&error.code==='version_conflict')return'İçerik başka bir yerde değişti. Taslağınız korunuyor.';return'İçerik kaydedilemedi. Taslağınız korunuyor.';}
function needsReload(error:unknown){return error instanceof Error&&'code'in error&&['version_conflict','operation_mismatch','commit_unknown','unavailable'].includes(String(error.code));}
export function MerchantContentEditor({storeId,kind,recordId,returnTo,canManage,initialLocale='tr',aiEnabled=false,researchEnabled=false,api=merchantContentApi}:Props){
 const scopeKey=JSON.stringify([storeId,kind,recordId??null,recordId?null:initialLocale]);
 const router=useRouter();const[document,setDocument]=useState<MerchantContentDocument|null>(null),[draft,setDraft]=useState<Draft|null>(null),[loadedScope,setLoadedScope]=useState<string|null>(null),[loading,setLoading]=useState(Boolean(recordId)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reloadRequired,setReloadRequired]=useState(false),[history,setHistory]=useState<readonly MerchantContentVersion[]|null>(null),[historyError,setHistoryError]=useState(''),[selectedBodyText,setSelectedBodyText]=useState<string|null>(null),[recoveryReady,setRecoveryReady]=useState(true),[recoveryLocale,setRecoveryLocale]=useState<string|null>(null),[aiOperationLocked,setAiOperationLocked]=useState(false);
 const sequence=useRef(0),revision=useRef(0),submission=useRef(false),draftId=useRef(crypto.randomUUID()),dirtyRef=useRef(false),busyRef=useRef(false),aiLockRef=useRef(false),bodyEditor=useRef<Editor|null>(null),aiApplying=useRef<{generationId:string;fields:readonly MerchantContentField[]}|null>(null),generatedValues=useRef<Partial<Record<MerchantContentField,string|null>>>({}),generatedLineage=useRef<Partial<Record<MerchantContentField,string>>>({}),generatedBaseState=useRef<Partial<Record<MerchantContentField,'ai'|'edited_ai'>>>({});
 const setAiLock=useCallback((locked:boolean)=>{aiLockRef.current=locked;setAiOperationLocked(locked);},[]);
 const load=useCallback(async()=>{const current=++sequence.current;revision.current=0;submission.current=false;draftId.current=crypto.randomUUID();generatedValues.current={};generatedLineage.current={};generatedBaseState.current={};aiApplying.current=null;setLoadedScope(null);setError('');setRecoveryReady(true);setRecoveryLocale(null);aiLockRef.current=false;setAiOperationLocked(false);setReloadRequired(false);setHistory(null);setHistoryError('');setBusy(false);setDocument(null);
  let recoveryFailed=false;const recovery=()=>{try{return recoverContentResourceDraft(window.sessionStorage,storeId,kind,recordId??null);}catch{recoveryFailed=true;setRecoveryReady(false);setError('İşlem kurtarma kaydı okunamadı. Kaydetmeden önce işlem kimliğiyle destek üzerinden sonucu doğrulayın.');return null;}};
  if(!recordId){const recovered=recovery();draftId.current=recovered?.draftId??draftId.current;setRecoveryLocale(recovered?.locale??null);aiLockRef.current=recoveryFailed||recovered?.status==='unresolved'||recovered?.status==='unknown';setAiOperationLocked(aiLockRef.current);setDraft(empty(recovered?.locale??initialLocale));setLoadedScope(scopeKey);setLoading(false);return;}setDraft(null);setLoading(true);try{const selected=await api.get(kind,recordId);if(current!==sequence.current)return;const recovered=recovery();draftId.current=recovered?.draftId??draftId.current;setRecoveryLocale(recovered?.locale??null);aiLockRef.current=recoveryFailed||recovered?.status==='unresolved'||recovered?.status==='unknown';setAiOperationLocked(aiLockRef.current);setDocument(selected);setDraft(fromDocument(selected));setLoadedScope(scopeKey);}catch(caught){if(current===sequence.current){setError(message(caught));setLoadedScope(scopeKey);}}finally{if(current===sequence.current)setLoading(false);}},[api,storeId,kind,recordId,initialLocale,scopeKey]);
 useEffect(()=>{void load();return()=>{sequence.current++;};},[load]);
 const scopeReady=loadedScope===scopeKey,baseline=document?fromDocument(document):empty(initialLocale),dirty=scopeReady&&draft!==null&&!identical(draft,baseline),canEdit=canManage&&document?.status!=='archived';
 dirtyRef.current=dirty;busyRef.current=busy;
 useEffect(()=>{
  const guard=createDirtyNavigationGuard({isDirty:()=>dirtyRef.current||busyRef.current,confirm:()=>{if(busyRef.current){setError('Kaydetme tamamlanana kadar bekleyin.');return false;}return window.confirm('Kaydedilmemiş değişikliklerden vazgeçilsin mi?');}});
  const unload=guard.bindBeforeUnload(window),navigation=guard.bindApplicationNavigation(window.document,()=>window.location.href);
  const historyNavigation=(window as Window&{navigation?:{addEventListener(type:'navigate',listener:(event:Event)=>void):void;removeEventListener(type:'navigate',listener:(event:Event)=>void):void}}).navigation;
  const onTraverse=(raw:Event)=>{const event=raw as Event&{navigationType?:string;destination?:{url:string;sameDocument:boolean}};if(event.defaultPrevented||event.navigationType!=='traverse'||!event.cancelable||!event.destination?.sameDocument)return;const current=new URL(window.location.href),destination=new URL(event.destination.url);if(destination.origin!==current.origin||(destination.pathname===current.pathname&&destination.search===current.search))return;if(!guard.canLeave())event.preventDefault();};
  historyNavigation?.addEventListener('navigate',onTraverse);
  return()=>{unload();navigation();historyNavigation?.removeEventListener('navigate',onTraverse);};
 },[]);
 function update(values:Partial<MerchantContentValues>,format?:MerchantContentBodyFormat,valid?:boolean){
  revision.current++;const applying=aiApplying.current;
  setDraft(previous=>{
   if(!previous)return previous;let origins=previous.origins;
   for(const [name,value]of Object.entries(values)){
    const field=name as MerchantContentField;if(!['name','body','excerpt','seoTitle','seoDescription'].includes(field))continue;
    if(applying?.fields.includes(field)){
     origins={...origins,[field]:{generationId:applying.generationId,state:generatedBaseState.current[field]??'ai'}};
     generatedValues.current[field]=value as string|null;generatedLineage.current[field]=applying.generationId;
    }else if(generatedLineage.current[field]&&value===generatedValues.current[field])origins={...origins,[field]:{generationId:generatedLineage.current[field],state:generatedBaseState.current[field]??'ai'}};
    else if((document?.[field]??null)===value&&origins[field])origins={...origins,[field]:{state:'manual'}};
    else origins=manualContentFieldEdit(origins,field,value as string|null,generatedValues.current[field]??null);
   }
   return{values:{...previous.values,...values},origins,bodyFormat:format??previous.bodyFormat,bodyValid:valid??previous.bodyValid};
  });
 }
 function applyAi(input:ContentResourceApplyInput){
  if(!scopeReady||!draft||!canEdit||busy||reloadRequired)return;
  try{
   const applied=applyContentResourceDraft({context:input.context,currentRequest:input.currentRequest,currentValues:draft.values,origins:draft.origins,generation:input.generation,selectedFields:input.selectedFields});
   const bodySelected=input.selectedFields.includes('body'),editor=bodyEditor.current,selection=input.currentRequest.stage==='draft'?input.currentRequest.selection:null;
   if(bodySelected&&draft.bodyFormat==='legacy'){setError('Kaynağı önce güvenli HTML düzenleyicisine dönüştürün. Diğer alanları ayrıca uygulayabilirsiniz.');return;}
   if(bodySelected&&!editor)throw Error('editor_unavailable');
   const range=bodySelected&&selection&&editor?{from:editor.state.selection.from,to:editor.state.selection.to}:null;
   if(range&&editor!.state.doc.textBetween(range.from,range.to,' ',' ')!==selection?.text)throw Error('selection_stale');
   revision.current++;aiApplying.current={generationId:input.generation.id,fields:input.selectedFields};
   for(const field of input.selectedFields)generatedBaseState.current[field]=field==='body'&&selection?'edited_ai':'ai';
   if(bodySelected&&editor){const html=applied.values.body;const didApply=range?editor.chain().focus().insertContentAt(range,html).run():editor.chain().focus().setContent(html,{emitUpdate:true}).run();if(!didApply)throw Error('editor_apply_failed');}
   const fullBody=bodySelected&&editor?editor.getHTML():applied.values.body;
   const origins={...applied.origins,...(bodySelected&&selection?{body:{generationId:input.generation.id,state:'edited_ai' as const}}:{})};
   setDraft(previous=>previous?{...previous,values:{...applied.values,body:fullBody},origins}:previous);
   for(const field of input.selectedFields){generatedValues.current[field]=field==='body'?fullBody:applied.values[field];generatedLineage.current[field]=input.generation.id;}
   setError('');
  }catch{setError('Önizleme artık güncel değil. Taslağı koruyarak yeniden oluşturun.');}
  finally{aiApplying.current=null;}
 }
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(aiLockRef.current||!recoveryReady){setError('Yapay zekâ işleminin sonucu doğrulanmadan içerik kaydedilemez. İşlem kimliğiyle durumu yenileyin.');return;}if(!scopeReady||!canEdit||!draft||!draft.bodyValid||loading||submission.current||reloadRequired)return;if(recordId&&(!document||document.id!==recordId||document.kind!==kind))return;if(draft.values.published&&(draft.values.status!=='active'||draft.values.slug===document?.id)){setError('Yayınlamak için anlamlı bir URL anahtarı ve aktif durum seçin.');return;}
  const currentSequence=sequence.current,currentRevision=revision.current;submission.current=true;setBusy(true);setError('');const input:SaveMerchantContentRequest={draftId:draftId.current,recordId:document?.id??null,expectedVersion:document?.version??null,expectedBodyDigest:document?.bodyDigest??null,kind,bodyAction:document&&draft.values.body===document.body&&draft.bodyFormat===document.bodyFormat?'preserve':'replace',values:draft.values,origins:draft.origins};
  try{const saved=await api.save(input);if(currentSequence!==sequence.current)return;setDocument(saved.document);if(currentRevision===revision.current){setDraft(fromDocument(saved.document));router.push(returnTo);router.refresh();}else{setDraft(previous=>previous&&previous.values.body===draft.values.body&&previous.bodyFormat===draft.bodyFormat?{...previous,values:{...previous.values,body:saved.document.body},bodyFormat:saved.document.bodyFormat}:previous);}}catch(caught){if(currentSequence===sequence.current){setError(message(caught));setReloadRequired(needsReload(caught));}}finally{if(currentSequence===sequence.current){submission.current=false;setBusy(false);}}
 }
 async function showHistory(){if(!document)return;const currentSequence=sequence.current;setHistoryError('');try{const items=await api.versions(kind,document.id,{limit:20});if(currentSequence===sequence.current)setHistory(items);}catch(caught){if(currentSequence===sequence.current)setHistoryError(caught instanceof MerchantContentApiError&&caught.code==='history_unavailable'?'Eski sürümün içeriği geri getirilemiyor. Taslağınız korunuyor.':message(caught));}}
 const requiredPage=document?.requiredPageKey;
 const seoFields=draft?<><label>SEO başlığı<input aria-label="SEO başlığı" maxLength={160} value={draft.values.seoTitle??''} readOnly={!canEdit} onChange={event=>update({seoTitle:event.currentTarget.value||null})}/></label><label>SEO açıklaması<textarea aria-label="SEO açıklaması" maxLength={4000} value={draft.values.seoDescription??''} readOnly={!canEdit} onChange={event=>update({seoDescription:event.currentTarget.value||null})}/></label></>:null;
 const title=recordId?kind==='blog_post'?'Blog yazısını düzenle':'Sayfayı düzenle':kind==='blog_post'?'Yeni blog yazısı':'Yeni sayfa';
 return <div className={operations.workspace}><PanelPageShell><h1 className={styles.srOnly}>{title}</h1><PanelPageHeader title={title}/><Link className={operations.back} href={returnTo}>Geri dön</Link>
 {!canManage?<p role="status" className={styles.readOnly}>Düzenleme yetkiniz yok.</p>:null}{scopeReady&&document?.status==='archived'?<p role="status" className={styles.readOnly}>Bu kayıt arşivlendi; burada düzenlenemez.</p>:null}
 {loading||!scopeReady?<p role="status" className={styles.state}>Yükleniyor…</p>:null}
 {scopeReady&&error?<div className={operations.feedback}><p role="alert" className={styles.error}>{error}</p>{!loading&&!draft?<button type="button" onClick={()=>void load()}>Tekrar dene</button>:null}{reloadRequired?<button type="button" onClick={()=>{if(window.confirm('Yerel taslak silinip güncel kayıt yüklensin mi?'))void load();}}>Güncel kaydı yükle</button>:null}</div>:null}
 {scopeReady&&draft&&!loading?<div className={operations.editLayout}><form className={operations.form} onSubmit={submit} aria-busy={busy}>
 <section><h2>{requiredPage?"İçerik":"İçerik bilgileri"} {requiredPage?<PanelStatusBadge>Zorunlu</PanelStatusBadge>:null}</h2>{requiredPage==='blog'?<Link className={operations.back} href="/content/blog">Blog yazıları</Link>:null}<div className={operations.fields}>
 <label>Ad<input aria-label="Ad" required maxLength={160} value={draft.values.name} readOnly={!canEdit} onChange={event=>update({name:event.currentTarget.value})}/></label>
 {!requiredPage?<>{/* Custom page addresses remain editable. Required page routes are server-owned. */} <label>URL anahtarı<input aria-label="URL anahtarı" required maxLength={100} value={draft.values.slug} readOnly={!canEdit} onChange={event=>update({slug:event.currentTarget.value})}/>{document&&draft.values.slug===document.id?<small>Eski kayıt için geçici kimlik. Yayınlamadan önce anlamlı bir URL anahtarı seçin.</small>:null}</label>
 <label>Dil<input aria-label="Dil" required maxLength={35} value={draft.values.locale} readOnly={!canEdit} onChange={event=>update({locale:event.currentTarget.value})}/></label>
</>:null}
 {!requiredPage?<><label>Durum<select aria-label="Durum" value={draft.values.status} disabled={!canEdit} onChange={event=>update({status:event.currentTarget.value as 'draft'|'active'})}><option value="draft">Taslak</option><option value="active">Aktif</option></select></label>
 <label>Özet<textarea aria-label="Özet" maxLength={4000} value={draft.values.excerpt??''} readOnly={!canEdit} onChange={event=>update({excerpt:event.currentTarget.value||null})}/></label>{seoFields}
 <label>Yayınla<input aria-label="Yayınla" type="checkbox" checked={draft.values.published} disabled={!canEdit} onChange={event=>update({published:event.currentTarget.checked})}/></label></>:<label>Yayın durumu<select aria-label="Yayın durumu" value={draft.values.published&&draft.values.status==='active'?'published':'draft'} disabled={!canEdit} onChange={event=>update({published:event.currentTarget.value==='published',status:event.currentTarget.value==='published'?'active':'draft'})}><option value="draft">Taslak</option><option value="published">Yayında</option></select></label>}
 </div></section><section><h2>Metin</h2><MerchantContentBodyField key={`${kind}:${recordId??draftId.current}`} value={draft.values.body} bodyFormat={draft.bodyFormat} readOnly={!canEdit} onChange={(value,bodyFormat,valid)=>update({body:value},bodyFormat,valid)} onEditorReady={editor=>{bodyEditor.current=editor;}} onTransaction={editor=>{const{from,to}=editor.state.selection,next=editor.state.doc.textBetween(from,to,' ',' ')||null;setSelectedBodyText(previous=>previous===next?previous:next);}}/></section>
   {requiredPage?<details><summary>Arama motorları</summary><div className={operations.fields}>{seoFields}</div></details>:null}
   {aiEnabled&&recoveryReady&&canEdit?<ContentResourceAuthoringPanel key={`${storeId}:${kind}:${draftId.current}`} storeId={storeId} recoveryLocale={recoveryLocale} target={{kind,draftId:draftId.current,recordId:document?.id??null,recordVersion:document?.version??null}} values={draft.values} selectionText={selectedBodyText} researchEnabled={researchEnabled} onOperationLockChange={setAiLock} onApply={applyAi}/>:null}
   <footer className={operations.saveBar}><span role="status">{busy?'Kaydediliyor…':aiOperationLocked?'Yapay zekâ işlemi bekleniyor':dirty?'Kaydedilmedi':document?`v${document.version}`:'Taslak'}</span><div><Link href={returnTo} className={styles.button}>Vazgeç</Link>{canEdit?<button type="submit" className={styles.primary} disabled={busy||aiOperationLocked||!recoveryReady||reloadRequired||!draft.bodyValid||!dirty}>{busy?'Kaydediliyor…':'Kaydet'}</button>:null}</div></footer>
 </form>{document?<aside className={operations.preview} aria-label="Sürüm geçmişi"><h2>Sürüm geçmişi</h2><button type="button" onClick={()=>void showHistory()}>Sürümleri göster</button>{historyError?<p role="alert">{historyError}</p>:null}{history?<ol>{history.map(item=><li key={item.version}><details><summary>v{item.version} · {item.savedAt} · {item.values.name}</summary><p>{item.status==='active'?'Aktif':'Taslak'} · {item.values.published?'Yayında':'Yayında değil'}</p><pre>{item.values.body}</pre></details></li>)}</ol>:null}</aside>:null}</div>:null}
 </PanelPageShell></div>;
}
