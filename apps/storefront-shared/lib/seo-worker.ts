import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import type { SeoIssue, SeoResourceKind, SeoSettings } from '@celebix/saas-contracts';
import type { SeoWorkerRepository } from '@celebix/saas-data';

type Document = Readonly<{status:number;html:string}>;
type AuditResource = Readonly<{hostname:string;path:string;kind:SeoResourceKind|null;resourceId:string|null;allowIndex:boolean;effectiveTitle:string;effectiveDescription:string;effectiveCanonicalPath:string}>;
type Transport = (hostname:string,path:string)=>Promise<Document>;
type Deps = Readonly<{now():Date;workerId:string;storefront:Transport;indexNow(body:Readonly<{host:string;key:string;keyLocation:string;urlList:readonly string[]}>):Promise<{status:number}>;resource?:(hostname:string,kind:SeoResourceKind,id:string)=>Promise<Pick<AuditResource,'allowIndex'|'effectiveTitle'|'effectiveDescription'|'effectiveCanonicalPath'>>;settings?:(hostname:string)=>Promise<SeoSettings>}>;

export function isPublicAddress(address:string):boolean {
  const family=isIP(address);
  if(family===4){const [a,b,c]=address.split('.').map(Number);return a!==0&&a!==10&&a!==127&&a<224&&!(a===100&&b>=64&&b<=127)&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0&&[0,2].includes(c)))&&!(a===198&&(b===18||b===19||b===51&&c===100))&&!(a===203&&b===0&&c===113);}
  if(family!==6||address.toLowerCase().startsWith('::ffff:'))return false;
  const normalized=address.toLowerCase(),first=Number.parseInt(normalized.split(':')[0]||'0',16);
  return (first&0xe000)===0x2000&&!normalized.startsWith('2001:db8:');
}
function host(value:string){if(!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)||/\.(?:local|localhost|internal|test)$/.test(value)||isIP(value))throw Error('invalid_hostname');return value;}
function safePath(path:string){if(!path.startsWith('/')||path.startsWith('//')||/[\\\u0000-\u0020\u007f#]/.test(path)||path.length>2048)throw Error('invalid_path');return path;}

/** Pin an already validated public DNS address through the TLS connection. */
export async function fetchVerifiedStorefrontDocument(hostname:string,path:string):Promise<Document>{
  const validated=host(hostname),destination=safePath(path);
  let timer:ReturnType<typeof setTimeout>|undefined;
  const addresses=await Promise.race([lookup(validated,{all:true,verbatim:true}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('dns_timeout')),5000);})]).finally(()=>{if(timer)clearTimeout(timer);});
  if(!addresses.length||addresses.some(item=>!isPublicAddress(item.address)))throw Error('private_address_denied');
  const selected=addresses[0];
  return new Promise((resolve,reject)=>{
    let settled=false,total=0;const chunks:Buffer[]=[];
    const finish=(error:Error|null,value?:Document)=>{if(settled)return;settled=true;clearTimeout(deadline);error?reject(error):resolve(value!);};
    const pinnedLookup=((_hostname:string,options:any,callback:any)=>options?.all?callback(null,[selected]):callback(null,selected.address,selected.family)) as LookupFunction;
    const req=httpsRequest({hostname:validated,servername:validated,port:443,path:destination,method:'GET',lookup:pinnedLookup,headers:{'accept':'text/html, text/plain;q=0.9','accept-encoding':'identity','user-agent':'CelebixSEO/1.0'},timeout:5000},response=>{
      response.on('data',(part:Buffer)=>{total+=part.length;if(total>1048576){req.destroy(Error('document_too_large'));return;}chunks.push(part);});
      response.on('end',()=>finish(null,{status:response.statusCode??503,html:Buffer.concat(chunks).toString('utf8')}));
      response.on('error',error=>finish(error));
    });
    const deadline=setTimeout(()=>req.destroy(Error('request_timeout')),5000);
    req.on('error',error=>finish(error));req.on('timeout',()=>req.destroy(Error('request_timeout')));req.end();
  });
}

function decode(value:string){return value.replace(/&(?:amp|quot|apos|lt|gt|nbsp|#\d+|#x[0-9a-f]+);/gi,entity=>{const named:Record<string,string>={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '};const name=named[entity.toLowerCase()];if(name!==undefined)return name;const number=entity.toLowerCase().startsWith('&#x')?Number.parseInt(entity.slice(3,-1),16):Number.parseInt(entity.slice(2,-1),10);return number>0&&number<=0x10ffff&&!(number>=0xd800&&number<=0xdfff)?String.fromCodePoint(number):' ';}).replace(/\s+/g,' ').trim();}
function attributes(tag:string){const out:Record<string,string>={};for(const item of tag.matchAll(/([a-z][a-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi))out[item[1].toLowerCase()]=decode(item[2]??item[3]??item[4]);return out;}
function types(value:unknown,out=new Set<string>()):Set<string>{if(!value||typeof value!=='object')return out;if(Array.isArray(value)){for(const item of value)types(item,out);return out;}const row=value as Record<string,unknown>;if(typeof row['@type']==='string')out.add(row['@type']);else if(Array.isArray(row['@type']))for(const item of row['@type'])if(typeof item==='string')out.add(item);for(const key of ['@graph','mainEntity','offers'])if(key in row)types(row[key],out);return out;}
export function auditSeoHtml(resource:AuditResource,document:Document):SeoIssue[]{
  const issues:SeoIssue[]=[],issue=(code:string,message:string)=>issues.push({code,severity:'error',message,path:resource.path,kind:resource.kind,resourceId:resource.resourceId,fixHref:resource.kind&&resource.resourceId?`/seo/content?kind=${resource.kind}&resourceId=${resource.resourceId}`:'/seo/settings'});
  if(document.status!==200){issue(`http_${document.status}`,`Sayfa HTTP ${document.status} yanıtı verdi.`);return issues;}
  const html=document.html,title=decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]??''),metas=[...html.matchAll(/<meta\b[^>]*>/gi)].map(item=>attributes(item[0]));
  if(!title)issue('title_missing','Yayımlanan SEO başlığı eksik.');else if(resource.effectiveTitle&&title!==resource.effectiveTitle)issue('title_mismatch','Yayımlanan başlık kayıtlı SEO başlığıyla uyuşmuyor.');
  const description=metas.find(meta=>meta.name?.toLowerCase()==='description')?.content??'';
  if(!description)issue('description_missing','Yayımlanan SEO açıklaması eksik.');else if(resource.effectiveDescription&&description!==resource.effectiveDescription)issue('description_mismatch','Yayımlanan açıklama kayıtlı SEO açıklamasıyla uyuşmuyor.');
  const robots=metas.filter(meta=>['robots','googlebot'].includes(meta.name?.toLowerCase())).map(meta=>meta.content?.toLowerCase()??'').join(',');
  if(resource.allowIndex&&/(?:^|[,\s])(?:noindex|none)(?:$|[,\s])/.test(robots))issue('unexpected_noindex','İndeksleme izni verilen sayfada noindex var.');
  if(!resource.allowIndex&&!/(?:^|[,\s])(?:noindex|none)(?:$|[,\s])/.test(robots))issue('noindex_missing','İndeksleme kapalı olmasına rağmen noindex eksik.');
  const canonicals=[...html.matchAll(/<link\b[^>]*>/gi)].map(item=>attributes(item[0])).filter(link=>link.rel?.toLowerCase().split(/\s+/).includes('canonical'));
  const expected=new URL(resource.effectiveCanonicalPath,`https://${resource.hostname}`).toString();
  if(canonicals.length!==1||canonicals[0].href!==expected)issue('canonical_mismatch','Yayımlanan canonical adresi eksik veya kayıtla uyuşmuyor.');
  const structuredTypes=new Set<string>();
  for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(attributes(script[1]).type!=='application/ld+json')continue;try{for(const selected of types(JSON.parse(script[2])))structuredTypes.add(selected);}catch{issue('structured_data_invalid','Yapılandırılmış veri okunamıyor.');}}
  if(resource.kind==='product'&&(!structuredTypes.has('Product')||!structuredTypes.has('Offer')))issue('product_schema_missing','Ürün fiyat ve stok yapılandırılmış verisi eksik.');
  if(resource.kind==='blog'&&!structuredTypes.has('Article')&&!structuredTypes.has('BlogPosting'))issue('article_schema_missing','Blog yapılandırılmış verisi eksik.');
  return issues;
}

export async function submitIndexNow(body:Readonly<{host:string;key:string;keyLocation:string;urlList:readonly string[]}>):Promise<{status:number}>{
  host(body.host);if(!/^[a-f0-9]{32,128}$/.test(body.key)||body.urlList.length<1||body.urlList.length>25||body.keyLocation!==`https://${body.host}/${body.key}.txt`||body.urlList.some(value=>{const url=new URL(value);return url.origin!==`https://${body.host}`;}))throw Error('invalid_submission');
  const response=await fetch('https://api.indexnow.org/indexnow',{method:'POST',headers:{'content-type':'application/json; charset=utf-8'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(5000)});
  await response.body?.cancel().catch(()=>undefined);return {status:response.status};
}
async function forEachBounded<T>(items:readonly T[],action:(item:T)=>Promise<void>){
  let next=0;
  await Promise.all(Array.from({length:Math.min(3,items.length)},async()=>{while(next<items.length){const item=items[next++];await action(item);}}));
}
export async function deliverSeoBatch(repository:SeoWorkerRepository,deps:Deps){
  const batch=await repository.claim({now:deps.now(),limit:25,workerId:deps.workerId}),counts={claimed:batch.notifications.length,received:0,pending:0,retried:0,failed:0,checked:0,recordingErrors:0};
  const groups=new Map<string,typeof batch.notifications>();
  for(const item of batch.notifications){const key=`${item.hostname}:${item.key}`,items=groups.get(key)??[];groups.set(key,[...items,item]);}
  await forEachBounded([...groups.values()],async notifications=>{
    const first=notifications[0];let status=0,reason:string|null=null;
    try{host(first.hostname);const keyFile=await deps.storefront(first.hostname,`/${first.key}.txt`);if(keyFile.status!==200||keyFile.html.trim()!==first.key)reason='key_verification_failed';else status=(await deps.indexNow({host:first.hostname,key:first.key,keyLocation:`https://${first.hostname}/${first.key}.txt`,urlList:[...new Set(notifications.map(item=>new URL(safePath(item.path),`https://${first.hostname}`).toString()))]})).status;}catch{reason='transport_unavailable';}
    for(const item of notifications){
      const now=deps.now(),waiting=status===202,success=status===200,transient=waiting||status===0||status===408||status===429||status>=500,retry=transient&&item.attempts<5;
      const state=success?'received':waiting&&retry?'verification_pending':retry?'retrying':'failed';
      try{await repository.finishNotification({id:item.id,leaseId:item.leaseId,now,status:state,httpStatus:status||null,error:success||waiting?null:reason??`indexnow_http_${status}`,nextAttemptAt:retry?new Date(now.getTime()+Math.min(21600000,60000*2**Math.min(item.attempts,8))):null});
      }catch{counts.recordingErrors++;continue;}
      if(state==='received')counts.received++;else if(state==='verification_pending')counts.pending++;else if(state==='retrying')counts.retried++;else counts.failed++;
    }
  });
  await forEachBounded(batch.checks,async item=>{let issues:SeoIssue[]=[],error:string|null=null;try{
    let expected:Pick<AuditResource,'allowIndex'|'effectiveTitle'|'effectiveDescription'|'effectiveCanonicalPath'>;
    if(item.kind&&item.resourceId){if(!deps.resource)throw Error('resource_reader_unavailable');expected=await deps.resource(item.hostname,item.kind,item.resourceId);}
    else{if(!deps.settings)throw Error('settings_reader_unavailable');const settings=await deps.settings(item.hostname);expected={allowIndex:settings.allowIndex&&settings.eligible,effectiveTitle:item.path==='/'?settings.metaTitle??'':'',effectiveDescription:item.path==='/'?settings.metaDescription??'':'',effectiveCanonicalPath:item.path};}
    issues=auditSeoHtml({...item,...expected},await deps.storefront(item.hostname,item.path));}catch{error='transport_unavailable';}
    try{await repository.finishCheck({id:item.id,leaseId:item.leaseId,now:deps.now(),issues,error});counts.checked++;}catch{counts.recordingErrors++;}
  });
  return counts;
}
