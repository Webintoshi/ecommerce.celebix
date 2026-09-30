'use client';

import Link from 'next/link';
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {FileText,Image as ImageIcon,Search,Settings2} from 'lucide-react';
import type {SeoResource,SeoResourceKind} from '@celebix/saas-contracts';
import {PanelPageShell,PanelSkeletonBlock} from '@/components/panel/PanelPageShell';
import {seoClient,type SeoClient} from '@/lib/seo-ui/client';
import {RESOURCE_KINDS,RESOURCE_LABELS} from '@/lib/seo-ui/model';
import styles from './seo.module.css';

export function SeoFrame({active,title,canManage,children}:Readonly<{active:'overview'|'content'|'settings';title:string;canManage:boolean;children:ReactNode}>){
 return <PanelPageShell><div className={styles.workspace}><h1 className="sr-only">{title}</h1>
 <nav className={styles.nav} aria-label="SEO ekranları">
 <Link href="/seo" aria-current={active==='overview'?'page':undefined}><Search size={16} aria-hidden="true"/>SEO Kontrol</Link>
 <Link href="/seo/content" aria-current={active==='content'?'page':undefined}><FileText size={16} aria-hidden="true"/>İçerik SEO</Link>
 <Link href="/seo/settings" aria-current={active==='settings'?'page':undefined}><Settings2 size={16} aria-hidden="true"/>SEO Ayarları</Link>
 </nav>{!canManage?<p className={styles.readonlyNote}>Görüntüleme yetkisi · Değişiklikler kapalı</p>:null}{children}</div></PanelPageShell>;
}
export function SeoFeedback({error,message}:Readonly<{error?:string;message?:string}>){return <>{error?<p className={styles.error} role="alert">{error}</p>:null}{message?<p className={styles.status} role="status">{message}</p>:null}</>;}
export function SeoResourceThumb({resource}:Readonly<{resource:Pick<SeoResource,'imageUrl'|'kind'>}>){
 return resource.imageUrl?<img className={styles.thumb} src={resource.imageUrl} alt="" loading="lazy" decoding="async"/>:<span className={styles.thumb} aria-hidden="true"><ImageIcon size={20}/></span>;
}
export function SeoLoading({label='SEO verileri yükleniyor…'}:Readonly<{label?:string}>){
 return <div className={styles.loading} role="status" aria-live="polite"><span className="sr-only">{label}</span>
 <div className={styles.loadingStats}>{[0,1,2,3].map(i=><PanelSkeletonBlock key={i} className={styles.loadingMetric}/>)}</div>
 <div className={styles.loadingCharts}><PanelSkeletonBlock className={styles.loadingChart}/><PanelSkeletonBlock className={styles.loadingChart}/></div>
 {[0,1,2].map(i=><PanelSkeletonBlock key={i} className={styles.loadingRow}/>)}</div>;
}
export function SeoArtwork({kind='search'}:Readonly<{kind?:'search'|'links'|'send'|'sitemap'}>){
 return <svg className={styles.artwork} viewBox="0 0 180 140" fill="none" aria-hidden="true" focusable="false">
 <ellipse cx="88" cy="125" rx="60" ry="7" className={styles.artShadow}/>
 {kind==='sitemap'?<><path d="M90 47v28M34 75h112M34 75v19m56-19v19m56-19v19" className={styles.artLine} strokeWidth="2"/>
 <rect x="65" y="13" width="50" height="34" rx="7" className={styles.artPaper}/>
 <path d="m79 26-5 4 5 4m22-8 5 4-5 4M94 23l-5 14" className={styles.artAccent} strokeWidth="2" strokeLinecap="round"/>
 {[13,69,125].map(x=><g key={x}><rect x={x} y="94" width="42" height="25" rx="5" className={styles.artPaper}/><path d={'M'+(x+10)+' 104h22m-22 7h14'} className={styles.artLine} strokeWidth="2" strokeLinecap="round"/></g>)}</>:<>
 <path d="M42 27h72l12 14v68a7 7 0 0 1-7 7H43a7 7 0 0 1-7-7V34a7 7 0 0 1 6-7Z" className={styles.artPaper}/>
 <path d="M109 28v20h18M52 50h42M52 64h30M52 78h24" className={styles.artLine} strokeWidth="4" strokeLinecap="round"/>
 {kind==='send'?<><path d="m84 64 65 27-61 24 9-25Z" className={styles.artPaper} strokeWidth="2"/><path d="m97 90 42 1" className={styles.artAccent} strokeWidth="2"/></>
 :kind==='links'?<><rect x="86" y="65" width="37" height="21" rx="10" transform="rotate(-33 86 65)" className={styles.artLine} strokeWidth="5"/><rect x="105" y="84" width="37" height="21" rx="10" transform="rotate(-33 105 84)" className={styles.artAccent} strokeWidth="5"/></>
 :<><circle cx="115" cy="83" r="24" className={styles.artLens} strokeWidth="3"/><path d="m132 100 19 20" className={styles.artLine} strokeWidth="8" strokeLinecap="round"/><path d="m105 83 7 7 14-16" className={styles.artAccent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></>}
 </>}<path d="M147 37v10m-5-5h10M28 94v8m-4-4h8" className={styles.artLine} strokeWidth="2" strokeLinecap="round"/></svg>;
}
export function ResourcePicker({label,value,onChange,disabled=false,client=seoClient}:Readonly<{label:string;value:Pick<SeoResource,'id'|'kind'|'name'|'path'>|null;onChange:(value:SeoResource|null)=>void;disabled?:boolean;client?:SeoClient}>){
 const uid=useId(),[kind,setKind]=useState<SeoResourceKind>(value?.kind??'product'),[query,setQuery]=useState(''),[items,setItems]=useState<SeoResource[]>([]),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const sequence=useRef(0);
 useEffect(()=>{if(value&&value.kind!==kind)setKind(value.kind);},[value?.kind]);
 useEffect(()=>{const request=++sequence.current;setBusy(true);setItems([]);setCursor(null);const timer=setTimeout(()=>{void client.resources({kind,query}).then(result=>{if(request!==sequence.current)return;setItems(result.items);setCursor(result.nextCursor);setError('');}).catch(()=>{if(request===sequence.current)setError('İçerikler yüklenemedi. Aramayı yeniden deneyin.');}).finally(()=>{if(request===sequence.current)setBusy(false);});},200);return()=>{sequence.current++;clearTimeout(timer);};},[client,kind,query]);
 async function more(){if(!cursor||busy)return;const request=sequence.current;setBusy(true);try{const result=await client.resources({kind,query,cursor});if(request!==sequence.current)return;setItems(current=>[...current,...result.items]);setCursor(result.nextCursor);setError('');}catch{if(request===sequence.current)setError('Diğer içerikler yüklenemedi. Yeniden deneyin.');}finally{if(request===sequence.current)setBusy(false);}}
 return <div className={styles.picker}><div className={styles.pickerFilters}><label>{label} türü<select value={kind} disabled={disabled} onChange={e=>{setKind(e.target.value as SeoResourceKind);onChange(null);setItems([]);}}>{RESOURCE_KINDS.map(kind=><option key={kind} value={kind}>{RESOURCE_LABELS[kind]}</option>)}</select></label><label>{label} ara<input type="search" maxLength={100} value={query} disabled={disabled} onChange={e=>setQuery(e.target.value)} placeholder="Ad veya URL"/></label></div><label>{label}<select disabled={disabled||busy} value={value?.kind===kind?value.id:''} aria-describedby={error?uid+'-error':undefined} onChange={e=>onChange(items.find(item=>item.id===e.target.value)??null)}><option value="">{busy?'Yükleniyor…':'İçerik seçin'}</option>{value?.kind===kind&&!items.some(item=>item.id===value.id)?<option value={value.id}>{value.name} · {value.path}</option>:null}{items.map(item=><option key={item.id} value={item.id}>{item.name} · {item.path}</option>)}</select></label>{cursor?<button className={styles.textLink} type="button" disabled={disabled||busy} onClick={()=>void more()}>Daha fazla içerik</button>:null}{error?<p id={uid+'-error'} role="alert" className={styles.error}>{error}</p>:null}</div>;
}
