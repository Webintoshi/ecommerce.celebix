'use client';
import type{MerchantContentDocument,MerchantContentKind,MerchantContentValues,MerchantContentVersion,SaveMerchantContentRequest}from'@celebix/saas-contracts';
import Link from'next/link';
import{useRouter}from'next/navigation';
import{useCallback,useEffect,useRef,useState,type FormEvent}from'react';
import{PanelPageHeader,PanelPageShell}from'@/components/panel/PanelPageShell';
import{MerchantContentBodyField}from'@/components/content/MerchantContentBodyField';
import{merchantContentApi,MerchantContentApiError}from'@/lib/merchant-content-ui/client';
import{createDirtyNavigationGuard}from'@/lib/catalog-ui/dirty-navigation';
import type{MerchantContentBodyFormat}from'@/lib/merchant-content-body-editor';
import styles from'../merchant-admin/merchant-module-console.module.css';
import operations from'../merchant-admin/merchant-operations.module.css';

type Api=Pick<ReturnType<typeof import('@/lib/merchant-content-ui/client').createMerchantContentApi>,'get'|'save'|'versions'>;
type Props=Readonly<{kind:MerchantContentKind;recordId?:string;returnTo:string;canManage:boolean;initialLocale?:string;api?:Api}>;
type Draft=Readonly<{values:MerchantContentValues;bodyFormat:MerchantContentBodyFormat;bodyValid:boolean}>;
const empty=(locale:string):Draft=>({values:{name:'',slug:'',locale,body:'',excerpt:null,seoTitle:null,seoDescription:null,published:false,status:'draft'},bodyFormat:'normalized_html',bodyValid:true});
const fromDocument=(document:MerchantContentDocument):Draft=>({values:{name:document.name,slug:document.slug,locale:document.locale,body:document.body,excerpt:document.excerpt,seoTitle:document.seoTitle,seoDescription:document.seoDescription,published:document.published,status:document.status==='active'?'active':'draft'},bodyFormat:document.bodyFormat,bodyValid:true});
const identical=(a:Draft,b:Draft)=>a.bodyFormat===b.bodyFormat&&JSON.stringify(a.values)===JSON.stringify(b.values);
function message(error:unknown){if(error instanceof MerchantContentApiError)return error.message;if(error instanceof Error&&'code'in error&&error.code==='version_conflict')return'İçerik başka bir yerde değişti. Taslağınız korunuyor.';return'İçerik kaydedilemedi. Taslağınız korunuyor.';}
function needsReload(error:unknown){return error instanceof Error&&'code'in error&&['version_conflict','operation_mismatch','commit_unknown','unavailable'].includes(String(error.code));}
export function MerchantContentEditor({kind,recordId,returnTo,canManage,initialLocale='tr-TR',api=merchantContentApi}:Props){
 const router=useRouter();const[document,setDocument]=useState<MerchantContentDocument|null>(null),[draft,setDraft]=useState<Draft|null>(null),[loading,setLoading]=useState(Boolean(recordId)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reloadRequired,setReloadRequired]=useState(false),[history,setHistory]=useState<readonly MerchantContentVersion[]|null>(null),[historyError,setHistoryError]=useState('');
 const sequence=useRef(0),revision=useRef(0),submission=useRef(false),draftId=useRef(crypto.randomUUID()),dirtyRef=useRef(false),busyRef=useRef(false);
 const load=useCallback(async()=>{const current=++sequence.current;revision.current=0;submission.current=false;draftId.current=crypto.randomUUID();setError('');setReloadRequired(false);setHistory(null);setHistoryError('');setBusy(false);setDocument(null);if(!recordId){setDraft(empty(initialLocale));setLoading(false);return;}setDraft(null);setLoading(true);try{const selected=await api.get(kind,recordId);if(current!==sequence.current)return;setDocument(selected);setDraft(fromDocument(selected));}catch(caught){if(current===sequence.current)setError(message(caught));}finally{if(current===sequence.current)setLoading(false);}},[api,kind,recordId,initialLocale]);
 useEffect(()=>{void load();return()=>{sequence.current++;};},[load]);
 const baseline=document?fromDocument(document):empty(initialLocale),dirty=draft!==null&&!identical(draft,baseline),canEdit=canManage&&document?.status!=='archived';
 dirtyRef.current=dirty;busyRef.current=busy;
 useEffect(()=>{
  const guard=createDirtyNavigationGuard({isDirty:()=>dirtyRef.current||busyRef.current,confirm:()=>{if(busyRef.current){setError('Kaydetme tamamlanana kadar bekleyin.');return false;}return window.confirm('Kaydedilmemiş değişikliklerden vazgeçilsin mi?');}});
  const unload=guard.bindBeforeUnload(window),navigation=guard.bindApplicationNavigation(window.document,()=>window.location.href);
  const historyNavigation=(window as Window&{navigation?:{addEventListener(type:'navigate',listener:(event:Event)=>void):void;removeEventListener(type:'navigate',listener:(event:Event)=>void):void}}).navigation;
  const onTraverse=(raw:Event)=>{const event=raw as Event&{navigationType?:string;destination?:{url:string;sameDocument:boolean}};if(event.defaultPrevented||event.navigationType!=='traverse'||!event.cancelable||!event.destination?.sameDocument)return;const current=new URL(window.location.href),destination=new URL(event.destination.url);if(destination.origin!==current.origin||(destination.pathname===current.pathname&&destination.search===current.search))return;if(!guard.canLeave())event.preventDefault();};
  historyNavigation?.addEventListener('navigate',onTraverse);
  return()=>{unload();navigation();historyNavigation?.removeEventListener('navigate',onTraverse);};
 },[]);
 function update(values:Partial<MerchantContentValues>,format?:MerchantContentBodyFormat,valid?:boolean){revision.current++;setDraft(previous=>previous?{values:{...previous.values,...values},bodyFormat:format??previous.bodyFormat,bodyValid:valid??previous.bodyValid}:previous);}
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!canEdit||!draft||!draft.bodyValid||loading||submission.current||reloadRequired)return;if(recordId&&(!document||document.id!==recordId||document.kind!==kind))return;if(draft.values.published&&(draft.values.status!=='active'||draft.values.slug===document?.id)){setError('Yayınlamak için anlamlı bir URL anahtarı ve aktif durum seçin.');return;}
  const currentSequence=sequence.current,currentRevision=revision.current;submission.current=true;setBusy(true);setError('');const input:SaveMerchantContentRequest={draftId:draftId.current,recordId:document?.id??null,expectedVersion:document?.version??null,expectedBodyDigest:document?.bodyDigest??null,kind,bodyAction:document&&draft.values.body===document.body&&draft.bodyFormat===document.bodyFormat?'preserve':'replace',values:draft.values,origins:{}};
  try{const saved=await api.save(input);if(currentSequence!==sequence.current)return;setDocument(saved.document);if(currentRevision===revision.current){setDraft(fromDocument(saved.document));router.push(returnTo);router.refresh();}else{setDraft(previous=>previous&&previous.values.body===draft.values.body&&previous.bodyFormat===draft.bodyFormat?{...previous,values:{...previous.values,body:saved.document.body},bodyFormat:saved.document.bodyFormat}:previous);}}catch(caught){if(currentSequence===sequence.current){setError(message(caught));setReloadRequired(needsReload(caught));}}finally{if(currentSequence===sequence.current){submission.current=false;setBusy(false);}}
 }
 async function showHistory(){if(!document)return;const currentSequence=sequence.current;setHistoryError('');try{const items=await api.versions(kind,document.id,{limit:20});if(currentSequence===sequence.current)setHistory(items);}catch(caught){if(currentSequence===sequence.current)setHistoryError(caught instanceof MerchantContentApiError&&caught.code==='history_unavailable'?'Eski sürümün içeriği geri getirilemiyor. Taslağınız korunuyor.':message(caught));}}
 const title=recordId?kind==='blog_post'?'Blog yazısını düzenle':'Sayfayı düzenle':kind==='blog_post'?'Yeni blog yazısı':'Yeni sayfa';
 return <div className={operations.workspace}><PanelPageShell><h1 className={styles.srOnly}>{title}</h1><PanelPageHeader title={title}/><Link className={operations.back} href={returnTo}>Geri dön</Link>
 {!canManage?<p role="status" className={styles.readOnly}>Düzenleme yetkiniz yok.</p>:null}{document?.status==='archived'?<p role="status" className={styles.readOnly}>Bu kayıt arşivlendi; burada düzenlenemez.</p>:null}
 {loading?<p role="status" className={styles.state}>Yükleniyor…</p>:null}
 {error?<div className={operations.feedback}><p role="alert" className={styles.error}>{error}</p>{!loading&&!draft?<button type="button" onClick={()=>void load()}>Tekrar dene</button>:null}{reloadRequired?<button type="button" onClick={()=>{if(window.confirm('Yerel taslak silinip güncel kayıt yüklensin mi?'))void load();}}>Güncel kaydı yükle</button>:null}</div>:null}
 {draft&&!loading?<div className={operations.editLayout}><form className={operations.form} onSubmit={submit} aria-busy={busy}>
 <section><h2>İçerik bilgileri</h2><div className={operations.fields}>
 <label>Ad<input aria-label="Ad" required maxLength={160} value={draft.values.name} readOnly={!canEdit} onChange={event=>update({name:event.currentTarget.value})}/></label>
 <label>URL anahtarı<input aria-label="URL anahtarı" required maxLength={100} value={draft.values.slug} readOnly={!canEdit} onChange={event=>update({slug:event.currentTarget.value})}/>{document&&draft.values.slug===document.id?<small>Eski kayıt için geçici kimlik. Yayınlamadan önce anlamlı bir URL anahtarı seçin.</small>:null}</label>
 <label>Dil<input aria-label="Dil" required maxLength={35} value={draft.values.locale} readOnly={!canEdit} onChange={event=>update({locale:event.currentTarget.value})}/></label>
 <label>Durum<select aria-label="Durum" value={draft.values.status} disabled={!canEdit} onChange={event=>update({status:event.currentTarget.value as 'draft'|'active'})}><option value="draft">Taslak</option><option value="active">Aktif</option></select></label>
 <label>Özet<textarea aria-label="Özet" maxLength={4000} value={draft.values.excerpt??''} readOnly={!canEdit} onChange={event=>update({excerpt:event.currentTarget.value||null})}/></label>
 <label>SEO başlığı<input aria-label="SEO başlığı" maxLength={160} value={draft.values.seoTitle??''} readOnly={!canEdit} onChange={event=>update({seoTitle:event.currentTarget.value||null})}/></label>
 <label>SEO açıklaması<textarea aria-label="SEO açıklaması" maxLength={4000} value={draft.values.seoDescription??''} readOnly={!canEdit} onChange={event=>update({seoDescription:event.currentTarget.value||null})}/></label>
 <label>Yayınla<input aria-label="Yayınla" type="checkbox" checked={draft.values.published} disabled={!canEdit} onChange={event=>update({published:event.currentTarget.checked})}/></label>
 </div></section><section><h2>Metin</h2><MerchantContentBodyField key={`${kind}:${recordId??draftId.current}`} value={draft.values.body} bodyFormat={draft.bodyFormat} readOnly={!canEdit} onChange={(value,bodyFormat,valid)=>update({body:value},bodyFormat,valid)}/></section>
 <footer className={operations.saveBar}><span role="status">{busy?'Kaydediliyor…':dirty?'Kaydedilmedi':document?`v${document.version}`:'Taslak'}</span><div><Link href={returnTo} className={styles.button}>Vazgeç</Link>{canEdit?<button type="submit" className={styles.primary} disabled={busy||reloadRequired||!draft.bodyValid||!dirty}>{busy?'Kaydediliyor…':'Kaydet'}</button>:null}</div></footer>
 </form>{document?<aside className={operations.preview} aria-label="Sürüm geçmişi"><h2>Sürüm geçmişi</h2><button type="button" onClick={()=>void showHistory()}>Sürümleri göster</button>{historyError?<p role="alert">{historyError}</p>:null}{history?<ol>{history.map(item=><li key={item.version}><details><summary>v{item.version} · {item.savedAt} · {item.values.name}</summary><p>{item.status==='active'?'Aktif':'Taslak'} · {item.values.published?'Yayında':'Yayında değil'}</p><pre>{item.values.body}</pre></details></li>)}</ol>:null}</aside>:null}</div>:null}
 </PanelPageShell></div>;
}
