'use client';

import Link from 'next/link';
import {Pencil,RefreshCw,Search,ChevronLeft,ChevronRight,ExternalLink} from 'lucide-react';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {parseSaveSeoResourceRequest,seoCanonicalPath,type SeoIndexing,type SeoResource,type SeoResourceKind} from '@celebix/saas-contracts';
import {OrderActionDialog} from '@/components/orders/OrderActionDialog';
import {SeoApiError,seoClient,type SeoClient} from '@/lib/seo-ui/client';
import {mutationIdentity,nullable,RESOURCE_KINDS,RESOURCE_LABELS,type MutationIdentity} from '@/lib/seo-ui/model';
import {useSeoUnsavedChanges} from '@/lib/seo-ui/unsaved';
import {SeoArtwork,SeoFeedback,SeoFrame,SeoLoading,SeoResourceThumb} from './SeoShared';
import styles from './seo.module.css';

type Draft = {title:string;description:string;canonicalPath:string;indexing:SeoIndexing};
const fromResource = (resource:SeoResource):Draft => ({title:resource.title??'',description:resource.description??'',canonicalPath:resource.canonicalPath??'',indexing:resource.indexing});
const byteCount = (value:string) => new TextEncoder().encode(value).length;

export function SeoContent({canManage,initialKind='product',resourceId,initialQuery='',initialMissing=false,client=seoClient}:Readonly<{canManage:boolean;initialKind?:SeoResourceKind;resourceId?:string;initialQuery?:string;initialMissing?:boolean;client?:SeoClient}>){
  const [kind,setKind]=useState(initialKind),[query,setQuery]=useState(initialQuery),[missing,setMissing]=useState(initialMissing);
  const [items,setItems]=useState<SeoResource[]>([]),[total,setTotal]=useState(0),[cursor,setCursor]=useState<string|null>(null),[history,setHistory]=useState<(string|null)[]>([null]);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [editing,setEditing]=useState<SeoResource|null>(null),[draft,setDraft]=useState<Draft>({title:'',description:'',canonicalPath:'',indexing:'inherit'}),[conflict,setConflict]=useState(false);
  const [fieldErrors,setFieldErrors]=useState<Partial<Record<keyof Draft,string>>>({});
  const pending=useRef<MutationIdentity|null>(null),opened=useRef(false),sequence=useRef(0),keepButton=useRef<HTMLButtonElement>(null),form=useRef<HTMLFormElement>(null);
  const list=useRef<HTMLDivElement>(null),search=useRef<HTMLInputElement>(null),returnToItem=useRef(''),restoreListFocus=useRef(false);
  const dirty=canManage&&editing!==null&&JSON.stringify(draft)!==JSON.stringify(fromResource(editing));
  const unsaved=useSeoUnsavedChanges(dirty);
  const titleLimit=editing?.kind==='product'?200:160,descriptionLimit=editing?.kind==='product'?500:4000;
  const usesBytes=editing?.kind!=='product';
  const disabled=!canManage||busy||unsaved.confirming;

  function edit(resource:SeoResource){
    returnToItem.current=`seo-content-edit-${resource.kind}-${resource.id}`;
    pending.current=null;setConflict(false);setError('');setMessage('');setFieldErrors({});setEditing(resource);setDraft(fromResource(resource));unsaved.reset();
  }
  function closeEditor(){if(busy)return;if(unsaved.confirming){unsaved.cancelDiscard();return;}unsaved.requestDiscard(()=>{restoreListFocus.current=true;setEditing(null);setError('');setFieldErrors({});pending.current=null;});}
  useEffect(()=>{if(unsaved.confirming)keepButton.current?.focus();},[unsaved.confirming]);
  useEffect(()=>{
    if(editing||!restoreListFocus.current)return;
    const target=document.getElementById(returnToItem.current);
    (target??search.current)?.focus();
    restoreListFocus.current=false;
  },[editing,loading,items]);

  const load=useCallback(async(selectedCursor:string|null=null,seek=false)=>{
    if(list.current?.contains(document.activeElement)){
      // Search remains mounted while rows are replaced by loading/results.
      returnToItem.current='';
      restoreListFocus.current=true;
    }
    const request=++sequence.current;setLoading(true);setError('');
    try{
      const result=await client.resources({kind,query,missing,cursor:selectedCursor??undefined});
      if(seek&&resourceId&&!opened.current){
        let found=result.items.find(item=>item.id===resourceId),next=result.nextCursor;
        while(!found&&next){const page=await client.resources({kind,cursor:next});found=page.items.find(item=>item.id===resourceId);next=page.nextCursor;}
        if(found&&request===sequence.current){opened.current=true;edit(found);}
      }
      if(request!==sequence.current)return false;
      setItems(result.items);setCursor(result.nextCursor);setTotal(result.total);
      return true;
    }catch(error){if(request===sequence.current)setError(error instanceof Error?error.message:'İçerikler yüklenemedi.');return false;}
    finally{if(request===sequence.current)setLoading(false);}
  },[client,kind,query,missing,resourceId]);
  useEffect(()=>{
    setHistory([null]);setCursor(null);setItems([]);setTotal(0);setLoading(true);const timer=query?setTimeout(()=>void load(null,true),250):null;
    if(!query)void load(null,true);
    return()=>{if(timer)clearTimeout(timer);sequence.current++;};
  },[load]);

  function validate(){
    const errors:Partial<Record<keyof Draft,string>>={};
    if((usesBytes?byteCount(draft.title.trim()):draft.title.trim().length)>titleLimit)errors.title=`En fazla ${titleLimit} ${usesBytes?'byte':'karakter'} girin.`;
    if((usesBytes?byteCount(draft.description.trim()):draft.description.trim().length)>descriptionLimit)errors.description=`En fazla ${descriptionLimit} ${usesBytes?'byte':'karakter'} girin.`;
    try{seoCanonicalPath(nullable(draft.canonicalPath));}catch{errors.canonicalPath='Geçerli, / ile başlayan mağaza içi yol girin.';}
    setFieldErrors(errors);
    if(Object.keys(errors).length){
      setError('Alanları kontrol edin.');const name=Object.keys(errors)[0];
      if(name==='canonicalPath'){const advanced=form.current?.querySelector('details');if(advanced)advanced.open=true;}
      form.current?.querySelector<HTMLElement>(`[name="${name}"]`)?.focus();return false;
    }
    return true;
  }
  async function apply(event:FormEvent){
    event.preventDefault();if(!editing||!canManage||busy||conflict||unsaved.confirming||!validate())return;
    const payload={expectedVersion:editing.version,expectedSeoVersion:editing.seoVersion,title:nullable(draft.title),description:nullable(draft.description),canonicalPath:nullable(draft.canonicalPath),indexing:draft.indexing};
    try{parseSaveSeoResourceRequest({kind:editing.kind,id:editing.id,...payload});}catch{setError('Alanları kontrol edin.');return;}
    pending.current=mutationIdentity(pending.current,`resources/${editing.kind}/${editing.id}`,payload);setBusy(true);setError('');
    try{
      const result=await client.saveResource(editing.kind,editing.id,payload,pending.current.key);
      pending.current=null;unsaved.reset();restoreListFocus.current=true;setEditing(null);setMessage('SEO alanları kaydedildi.');
      setItems(current=>current.map(item=>item.id===result.resource.id&&item.kind===result.resource.kind?result.resource:item));
      if(missing)void load(history.at(-1)??null);
    }catch(error){setError(error instanceof Error?error.message:'Değişiklikler kaydedilemedi.');setConflict(error instanceof SeoApiError&&error.code==='version_conflict');}
    finally{setBusy(false);}
  }
  async function reload(){
    if(!editing||busy)return;setBusy(true);
    try{
      let next:string|undefined,found:SeoResource|undefined;
      do{const result=await client.resources({kind:editing.kind,cursor:next});found=result.items.find(item=>item.id===editing.id);next=result.nextCursor??undefined;}while(!found&&next);
      if(!found)throw new SeoApiError('record_not_found',404);edit(found);
    }catch(error){setError(error instanceof Error?error.message:'İçerik yüklenemedi.');}
    finally{setBusy(false);}
  }
  function setType(next:SeoResourceKind){
    setKind(next);setItems([]);setMessage('');const url=new URL(window.location.href);url.searchParams.set('kind',next);url.searchParams.delete('resourceId');window.history.replaceState(window.history.state,'',url);
  }
  function change<K extends keyof Draft>(key:K,value:Draft[K]){setDraft(current=>({...current,[key]:value}));setFieldErrors(current=>({...current,[key]:undefined}));}
  const contentHref=editing?(editing.kind==='product'?`/products/${editing.id}`:editing.kind==='category'?'/products/categories':`/content/${editing.kind==='blog'?'blog':'pages'}/${editing.id}/edit`):null;
  const renderedCount=(value:string)=>usesBytes?byteCount(value):value.length;
  // effective* contains a saved override; a cleared field must not preview that old value as a fallback.
  const fallbackTitle=editing?.title?editing.name:editing?.effectiveTitle;
  const fallbackDescription=editing?.description?'Varsayılan açıklama kaydedildiğinde uygulanır.':editing?.effectiveDescription;
  const fallbackCanonical=editing?.canonicalPath?editing.path:editing?.effectiveCanonicalPath;

  return <SeoFrame active="content" title="İçerik SEO" canManage={canManage}>
    <div className={`${styles.tabs} ${styles.segments}`} role="group" aria-label="İçerik türü">{RESOURCE_KINDS.map(type=><button key={type} type="button" aria-pressed={kind===type} onClick={()=>setType(type)}>{RESOURCE_LABELS[type]}</button>)}</div>
    <div className={styles.toolbar}>
      <label className={styles.search}><span className="sr-only">İçerik ara</span><Search size={18} aria-hidden="true"/><input ref={search} type="search" aria-label="İçerik ara" maxLength={100} value={query} placeholder="Ad veya URL ara" onChange={event=>setQuery(event.target.value)}/></label>
      <label className={styles.checkbox}><input type="checkbox" checked={missing} onChange={event=>setMissing(event.target.checked)}/>Özel meta alanı eksik</label>
      <button className={styles.iconButton} type="button" aria-label="İçerikleri yenile" disabled={loading} onClick={()=>void load(history.at(-1)??null)}><RefreshCw size={18} aria-hidden="true"/><span className="sr-only">Yenile</span></button>
    </div>
    <SeoFeedback error={!editing?error:''} message={message}/>
    {!loading&&(!error||items.length>0)?<div className={styles.toolbar}><span className={styles.muted}>{total} içerik</span>{missing?<small className={styles.muted}>Varsayılan metin kullanılabilir.</small>:null}</div>:null}
    {loading?<SeoLoading label="İçerikler yükleniyor…"/>:<div ref={list} className={styles.contentList} aria-label="İçerik SEO listesi">
      {items.map(item=><article className={styles.contentRow} key={`${item.kind}:${item.id}`}>
        <div className={styles.resourceIdentity}><SeoResourceThumb resource={item}/><div><strong>{item.name}</strong><small className={styles.url}>{item.path}</small><small>{item.status==='active'||item.status==='published'?'Yayında':'Taslak'} · {item.locale}</small></div></div>
        <div className={styles.resourceMeta}><small>Meta başlık</small><span>{item.title||'Özel başlık yok'}</span>{!item.title?<small className={styles.muted}>İçerik başlığı kullanılır</small>:null}</div>
        <div className={styles.resourceMeta} data-field="description"><small>Meta açıklama</small><span>{item.description||'Özel açıklama yok'}</span>{!item.description?<small className={styles.muted}>Varsayılan metin kullanılır</small>:null}</div>
        <span className={`${styles.statusBadge} ${item.allowIndex?'':styles.closed}`} data-tone={item.allowIndex?'success':'neutral'}><span className="sr-only">İndeksleme: </span>{item.allowIndex?'İzinli':'Kapalı'}</span>
        <button id={`seo-content-edit-${item.kind}-${item.id}`} className={styles.iconButton} data-field="actions" type="button" aria-label={`${item.name} SEO alanlarını düzenle`} disabled={!canManage} onClick={()=>edit(item)}><Pencil size={17} aria-hidden="true"/><span className="sr-only">Düzenle</span></button>
      </article>)}
      {!items.length&&!error?<div className={styles.empty}><SeoArtwork kind="search"/><strong>İçerik bulunamadı</strong><button type="button" onClick={()=>{setQuery('');setMissing(false);}}>Filtreleri temizle</button></div>:null}
      {!items.length&&error?<div className={styles.empty}><button type="button" onClick={()=>void load(history.at(-1)??null)}>Yeniden dene</button></div>:null}
    </div>}
    <div className={styles.pagination}>{!loading&&(!error||items.length>0)?<span className={styles.muted}>{items.length} içerik · {total} sonuç</span>:null}<div className={styles.actions}>
      <button type="button" disabled={loading||history.length<2} onClick={()=>{const next=history.slice(0,-1);void load(next.at(-1)??null).then(success=>{if(success)setHistory(next);});}}><ChevronLeft size={16} aria-hidden="true"/>Önceki</button>
      <span>{history.length}. sayfa</span><button type="button" disabled={loading||!cursor} onClick={()=>{if(cursor){const next=cursor;void load(next).then(success=>{if(success)setHistory(current=>[...current,next]);});}}}>Sonraki<ChevronRight size={16} aria-hidden="true"/></button>
    </div></div>
    <OrderActionDialog open={editing!==null} title={editing?.name??'SEO düzenle'} className={styles.contentDialog} busy={busy} onClose={closeEditor} footer={unsaved.confirming?<div className={styles.actions}>
      <button ref={keepButton} className={styles.dialogButton} type="button" disabled={busy} onClick={unsaved.cancelDiscard}>Düzenlemeye devam et</button>
      <button className={styles.dialogButton} type="button" disabled={busy} onClick={unsaved.confirmDiscard}>Değişiklikleri bırak</button>
    </div>:<div className={styles.actions}><button id="seo-content-cancel" className={styles.dialogButton} type="button" disabled={busy} onClick={closeEditor}>Vazgeç</button><button className={`${styles.dialogButton} ${styles.primary}`} type="submit" form="seo-resource-form" disabled={busy||conflict||!canManage}>{busy?'Kaydediliyor…':'Kaydet'}</button></div>}>
      {unsaved.confirming?<div className={styles.inlineDiscard} role="alert"><strong>Kaydedilmemiş değişiklikler var.</strong><p>Değişiklikleri bırakmak istiyor musunuz?</p></div>:null}
      <form ref={form} id="seo-resource-form" className={styles.form} onSubmit={apply}>
        <SeoFeedback error={error}/>
        {conflict?<button id="seo-content-reload" type="button" className={styles.dialogButton} disabled={busy||unsaved.confirming} onClick={()=>unsaved.requestDiscard(reload)}>Güncel kaydı yükle</button>:null}
        {editing?<div className={styles.resourceIdentity}><SeoResourceThumb resource={editing}/><div><small>{RESOURCE_LABELS[editing.kind]} · {editing.locale}</small><small className={styles.url}>{editing.path}</small></div></div>:null}
        <div className={styles.editorGrid}><div className={styles.editorFields}>
          <label>Meta başlık<input name="title" disabled={disabled} maxLength={titleLimit} value={draft.title} placeholder={fallbackTitle} aria-invalid={!!fieldErrors.title} aria-describedby="seo-title-limit" onChange={event=>change('title',event.target.value)}/><small id="seo-title-limit" className={styles.countHint}>{renderedCount(draft.title)}/{titleLimit} {usesBytes?'byte':'karakter'}</small>{fieldErrors.title?<small role="alert" className={styles.error}>{fieldErrors.title}</small>:null}</label>
          <label>Meta açıklama<textarea name="description" rows={5} disabled={disabled} maxLength={descriptionLimit} value={draft.description} placeholder={editing?.description?'İçerik açıklaması kullanılır':editing?.effectiveDescription} aria-invalid={!!fieldErrors.description} aria-describedby="seo-description-limit" onChange={event=>change('description',event.target.value)}/><small id="seo-description-limit" className={styles.countHint}>{renderedCount(draft.description)}/{descriptionLimit} {usesBytes?'byte':'karakter'}</small>{fieldErrors.description?<small role="alert" className={styles.error}>{fieldErrors.description}</small>:null}</label>
          <label>İndeksleme<select name="indexing" disabled={disabled} value={draft.indexing} onChange={event=>change('indexing',event.target.value as SeoIndexing)}><option value="inherit">Mağaza varsayılanı</option><option value="index">İzin ver</option><option value="noindex">İzin verme</option></select></label>
          <small className={styles.muted}>Boş meta alanlarında içerik metni kullanılır.</small>
        </div><section className={styles.serpPreview} aria-label="Arama sonucu önizlemesi"><small>Arama sonucu önizlemesi</small><span className={styles.url}>{draft.canonicalPath||fallbackCanonical}</span><strong>{draft.title||fallbackTitle}</strong><p>{draft.description||fallbackDescription}</p><small>Arama motorundaki görünüm farklı olabilir.</small></section>
        <details className={styles.advancedField}><summary>Kanonik adres</summary><label>Mağaza içindeki yol<input name="canonicalPath" disabled={disabled} maxLength={2048} value={draft.canonicalPath} placeholder={editing?.path} aria-invalid={!!fieldErrors.canonicalPath} onChange={event=>change('canonicalPath',event.target.value)}/>{fieldErrors.canonicalPath?<small role="alert" className={styles.error}>{fieldErrors.canonicalPath}</small>:<small className={styles.muted}>/ ile başlayan mağaza içi adres.</small>}</label></details></div>
        {contentHref?<Link className={styles.textLink} href={contentHref}>İçeriği yönet <ExternalLink size={14} aria-hidden="true"/></Link>:null}
      </form>
    </OrderActionDialog>
  </SeoFrame>;
}
