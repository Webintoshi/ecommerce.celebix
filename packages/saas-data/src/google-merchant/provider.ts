import type { GoogleMarketingResourceOption, GoogleMarketingResources, GoogleMarketingSelection, GoogleMerchantOffer } from '@celebix/saas-contracts';
import { createHash } from 'node:crypto';
import { GoogleMarketingRepositoryError, googleError } from '../google-marketing/errors.ts';
import {isMerchantWwwPair} from './redirect-proof.ts';

const BASE = 'https://merchantapi.googleapis.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LIMIT_BYTES = 1_048_576;
type Json = Record<string, unknown>;
type Progress = Record<string, unknown>;
export type GoogleMerchantProviderProduct = Readonly<{productId:string;offerId:string;contentLanguage:'tr';feedLabel:'TR';dataSourceId:string;revision:string|null;status:'pending'|'approved'|'limited'|'disapproved';issues:readonly Readonly<{code:string;description?:string}>[];expiresAt:string|null}>;
function record(value:unknown):Json {if(!value||typeof value!=='object'||Array.isArray(value))googleError('provider_unavailable');return value as Json;}
function list(value:unknown,max=100):unknown[] {if(value===undefined)return [];if(!Array.isArray(value)||value.length>max)googleError('provider_limit');return value;}
function numeric(value:unknown):string {if(typeof value!=='string'||!/^[1-9]\d{0,19}$/.test(value))googleError('resource_denied');return value;}
function text(value:unknown,max:number,code:'invalid_input'|'provider_unavailable'='provider_unavailable'):string {if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f<>]/u.test(value))googleError(code);return value;}
function uuid(value:unknown):string {if(typeof value!=='string'||!UUID.test(value))googleError('invalid_input');return value;}
function safeHttps(value:unknown):string {const raw=text(value,2048,'invalid_input');try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.hash||!u.hostname.includes('.')||u.hostname==='localhost')googleError('invalid_input');return raw;}catch{googleError('invalid_input');}}
function gtin(value:unknown):string {if(typeof value!=='string'||! /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)||/^0+$/.test(value))googleError('invalid_input');const code=value.length===14&&value.startsWith('0')?value.slice(1):value;if(/^(?:02|04|05|2|98|99)/.test(code))googleError('invalid_input');let sum=0;for(let i=value.length-2,weight=3;i>=0;i--,weight=weight===3?1:3)sum+=Number(value[i])*weight;if((10-sum%10)%10!==Number(value.at(-1)))googleError('invalid_input');return value;}
function productId(value:unknown):string {if(typeof value!=='string'||!value.startsWith('tr~TR~'))googleError('invalid_input');uuid(value.slice(6));return value;}
function sourceId(value:unknown,accountId:string):string {if(typeof value!=='string'||!value.startsWith(`accounts/${accountId}/dataSources/`))googleError('resource_denied');return numeric(value.slice(`accounts/${accountId}/dataSources/`.length));}
function sourceMatches(value:unknown,accountId:string,marker:string):string {
 const source=record(value),id=numeric(source.dataSourceId),primary=record(source.primaryProductDataSource);
 if(source.name!==`accounts/${accountId}/dataSources/${id}`||source.displayName!==marker||source.input!=='API'||source.fileInput!==undefined||primary.feedLabel!=='TR'||primary.contentLanguage!=='tr'||JSON.stringify(primary.countries)!=='["TR"]')googleError('merchant_source_conflict');
 return id;
}
function attributes(offer:GoogleMerchantOffer):Json {
 uuid(offer.offerId);if(offer.identifierExists===false&&(offer.gtin!==undefined||offer.mpn!==undefined))googleError('invalid_input');if(offer.contentLanguage!=='tr'||offer.feedLabel!=='TR'||offer.condition!=='new'||!['in_stock','out_of_stock','backorder'].includes(offer.availability))googleError('invalid_input');
 const price=offer.price;if(!price||price.currencyCode!=='TRY'||typeof price.amountMicros!=='string'||!/^[1-9]\d{0,15}$/.test(price.amountMicros))googleError('invalid_input');
 const out:Json={title:text(offer.title,150,'invalid_input'),description:text(offer.description,5000,'invalid_input'),link:safeHttps(offer.link),imageLink:safeHttps(offer.imageLink),additionalImageLinks:list(offer.additionalImageLinks,10).map(safeHttps),price:{amountMicros:price.amountMicros,currencyCode:'TRY'},availability:offer.availability.toUpperCase(),condition:'NEW'};
 for(const [key,max]of [['brand',70],['mpn',70],['googleProductCategory',256],['color',100],['size',100],['material',200]] as const){if(offer[key]!==undefined)out[key]=text(offer[key],max,'invalid_input');}
 if(offer.gtin!==undefined)out.gtins=[gtin(offer.gtin)];
 if(offer.itemGroupId!==undefined)out.itemGroupId=uuid(offer.itemGroupId);
 if(offer.identifierExists!==undefined){if(typeof offer.identifierExists!=='boolean')googleError('invalid_input');out.identifierExists=offer.identifierExists;}
 if(offer.gender!==undefined){if(!['male','female','unisex'].includes(offer.gender))googleError('invalid_input');out.gender=offer.gender;}
 if(offer.ageGroup!==undefined){if(!['newborn','infant','toddler','kids','adult'].includes(offer.ageGroup))googleError('invalid_input');out.ageGroup=offer.ageGroup;}
 return out;
}
function canonical(value:unknown):string {if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;}
/** Freshness marker only; it grants no authority. customLabel4 is reserved on our owned source. */
export function googleMerchantOfferRevision(offer:GoogleMerchantOffer):string {return createHash('sha256').update(canonical({offerId:uuid(offer.offerId),contentLanguage:'tr',feedLabel:'TR',productAttributes:attributes(offer)})).digest('hex');}

/** Fixed-origin, bounded Merchant API adapter. Authority and credential storage remain native. */
export class GoogleMerchantProvider {
 private readonly transport:typeof fetch;
 private readonly homepageProof:((homepage:URL,canonicalDomain:string)=>Promise<boolean>)|undefined;
 constructor(transport:typeof fetch=fetch,homepageProof?:((homepage:URL,canonicalDomain:string)=>Promise<boolean>)){this.transport=transport;this.homepageProof=homepageProof;}
 private async request(path:string,token:string,init:RequestInit={},notFound=false):Promise<Json|null> {
  if(!/^\/(?:accounts|datasources|products)\/v1\//.test(path)||/[\u0000-\u0020\u007f]/.test(token)||!token||token.length>8192)googleError('invalid_input');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
   const response=await this.transport(`${BASE}${path}`,{...init,headers:{Authorization:`Bearer ${token}`,...(init.body?{'content-type':'application/json'}:{}),...init.headers},signal:controller.signal,redirect:'error',cache:'no-store'});
   if(Number(response.headers.get('content-length')??0)>LIMIT_BYTES)googleError('provider_limit');
   let raw='';if(response.body){const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;try{for(;;){const p=await reader.read();if(p.done)break;length+=p.value.length;if(length>LIMIT_BYTES){await reader.cancel();googleError('provider_limit');}chunks.push(p.value);}raw=Buffer.concat(chunks).toString('utf8');}finally{reader.releaseLock();}}
   let payload:Json;try{payload=raw?record(JSON.parse(raw)):{};}catch{googleError('provider_unavailable');}
   if(response.status===404&&notFound)return null;
   if(!response.ok){
    const error=payload.error&&typeof payload.error==='object'?record(payload.error):{};
    const reasons=list(error.details).flatMap(detail=>{const d=record(detail);return d['@type']==='type.googleapis.com/google.rpc.ErrorInfo'&&typeof d.reason==='string'?[d.reason]:[];});
    if(reasons.some(reason=>['GCP_NOT_REGISTERED','GCP_PROJECT_NOT_REGISTERED','PROJECT_NOT_REGISTERED'].includes(reason))||response.status===401&&typeof error.message==='string'&&/^GCP project with id .+ and number \d+ is not registered with the merchant account\./.test(error.message))googleError('merchant_developer_unregistered');
    if(reasons.includes('SERVICE_DISABLED'))googleError('merchant_api_disabled');
    if(reasons.some(reason=>/^(?:MISSING_BUSINESS_|BUSINESS_INFO_INCOMPLETE|TERMS_OF_SERVICE_NOT_ACCEPTED)/.test(reason)||['PERMISSION_DENIED_TERMS_OF_SERVICE_UNSIGNED','INVALID_STATE_TERMS_OF_SERVICE_BUSINESS_COUNTRY_NOT_SET','INVALID_DESTINATION_NOT_ENABLED','INVALID_TRANSITION_PROGRAM_CANNOT_BE_ACTIVATED','INVALID_TRANSITION_PROGRAM_CANNOT_BE_ONBOARDED'].includes(reason)))googleError('merchant_business_incomplete');
    googleError(response.status===401?'needs_reconnect':response.status===403?'provider_denied':response.status===429?'provider_limit':'provider_unavailable');
   }
   return payload;
  }catch(error){if(error instanceof GoogleMarketingRepositoryError)throw error;googleError(controller.signal.aborted?'provider_timeout':'provider_unavailable');}finally{clearTimeout(timer);}
 }
 private async paged(path:string,key:string,token:string):Promise<Json[]> {
  const rows:Json[]=[],seen=new Set<string>();let next:string|undefined;
  for(let page=0;page<5;page++){
   const payload=(await this.request(`${path}${path.includes('?')?'&':'?'}pageSize=100${next?`&pageToken=${encodeURIComponent(next)}`:''}`,token))!;
   rows.push(...list(payload[key]).map(record));if(rows.length>500)googleError('provider_limit');
   if(payload.nextPageToken===undefined||payload.nextPageToken==='')return rows;
   next=text(payload.nextPageToken,2048);if(seen.has(next))googleError('provider_limit');seen.add(next);
  }googleError('provider_limit');
 }
 async resources(token:string,accountId?:string):Promise<GoogleMarketingResources> {
  const accounts:GoogleMarketingResourceOption[]=(await this.paged('/accounts/v1/accounts','accounts',token)).filter(a=>a.testAccount!==true).map(a=>{const id=numeric(a.accountId);if(a.name!==undefined&&a.name!==`accounts/${id}`)googleError('provider_unavailable');return {id,name:text(a.accountName,160)};});
  if(accountId===undefined)return {accounts,resources:[]};numeric(accountId);const account=accounts.find(a=>a.id===accountId);if(!account)googleError('resource_denied');return {accounts,resources:[{...account,parentId:accountId}]};
 }
 async setup(token:string,selection:GoogleMarketingSelection,domain:string,storeId:string,progress:Progress,checkpoint:(progress:Progress)=>Promise<void>):Promise<GoogleMarketingSelection> {
  const accountId=numeric(selection.accountId);numeric(selection.resourceId);uuid(storeId);
  if(selection.create||selection.tagId!==undefined||selection.conversionLabel!==undefined)googleError('resource_denied');
  const resources=await this.resources(token,accountId),account=resources.accounts.find(a=>a.id===accountId)!;
  if(!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(domain)||!domain.includes('.'))googleError('wrong_domain');
  const homepage=(await this.request(`/accounts/v1/accounts/${accountId}/homepage`,token))!;
  let uri:URL;try{uri=new URL(String(homepage.uri));}catch{googleError('merchant_domain_unverified');}
  if(uri.protocol!=='https:'||uri.username||uri.password||uri.port||uri.pathname!=='/'||uri.search||uri.hash||uri.hostname!==domain&&!isMerchantWwwPair(uri.hostname,domain))googleError('wrong_domain');
  if(homepage.claimed!==true)googleError('merchant_domain_unverified');
  if(progress.merchantDomain!==undefined&&progress.merchantDomain!==domain)googleError('wrong_domain');
  if(uri.hostname!==domain&&(!this.homepageProof||!await this.homepageProof(uri,domain)))googleError('wrong_domain');
  progress={...progress,merchantDomain:domain};await checkpoint(progress);
  const marker=`Celebix ${storeId}`;
  if(progress.merchantSourceName!==undefined&&progress.merchantSourceName!==marker)googleError('operation_mismatch');
  const sources=await this.paged(`/datasources/v1/accounts/${accountId}/dataSources`,'dataSources',token);
  const matching=sources.filter(source=>source.displayName===marker);if(matching.length>1)googleError('merchant_source_conflict');
  let id:string;
  if(matching[0])id=sourceMatches(matching[0],accountId,marker);
  else{
   if(selection.resourceId!==accountId)googleError('resource_denied');
   // A checkpointed unresolved creation is reconciled by listing; do not issue another
   // create while Google's outcome is unknown or not yet visible.
   if(progress.merchantDataSourceId!==undefined||progress.merchantSourceName!==undefined)googleError('merchant_source_conflict');
   await checkpoint({...progress,merchantSourceName:marker});
   let source:Json;
   try{source=(await this.request(`/datasources/v1/accounts/${accountId}/dataSources`,token,{method:'POST',body:JSON.stringify({displayName:marker,primaryProductDataSource:{contentLanguage:'tr',feedLabel:'TR',countries:['TR'],destinations:[{destination:'FREE_LISTINGS',state:'ENABLED'}]}})}))!;}
   catch(error){
    // These typed responses are definitive rejected HTTP requests. Clear only this
    // creation checkpoint so the same operation can retry after prerequisite repair.
    // Timeouts, lost/malformed replies and all ambiguous outcomes retain the marker.
    if(error instanceof GoogleMarketingRepositoryError&&['merchant_business_incomplete','merchant_api_disabled','merchant_developer_unregistered','provider_denied','needs_reconnect'].includes(error.code)){
     const {merchantSourceName:_marker,merchantDataSourceId:_source,...rest}=progress;await checkpoint(rest);
    }
    throw error;
   }
   id=sourceMatches(source,accountId,marker);
  }
  if(progress.merchantDataSourceId!==undefined&&progress.merchantDataSourceId!==id)googleError('merchant_source_conflict');
  if(selection.resourceId!==accountId&&selection.resourceId!==id)googleError('resource_denied');
  await checkpoint({...progress,merchantSourceName:marker,merchantDataSourceId:id});
  return {accountId,resourceId:id,resourceName:account.name};
 }
 async sendProduct(token:string,accountId:string,dataSourceId:string,offer:GoogleMerchantOffer,versionNumber:number):Promise<{productId:string}> {
  if(!Number.isSafeInteger(versionNumber)||versionNumber<1)googleError('invalid_input');
  numeric(accountId);numeric(dataSourceId);const id=`tr~TR~${uuid(offer.offerId)}`,productAttributes=attributes(offer);
  productAttributes.customLabel4=`cbxrev_${googleMerchantOfferRevision(offer)}`;
  const response=(await this.request(`/products/v1/accounts/${accountId}/productInputs:insert?dataSource=${encodeURIComponent(`accounts/${accountId}/dataSources/${dataSourceId}`)}`,token,{method:'POST',body:JSON.stringify({offerId:offer.offerId,contentLanguage:'tr',feedLabel:'TR',productAttributes,versionNumber:String(versionNumber)})}))!;
  if(response.name!==`accounts/${accountId}/productInputs/${id}`||response.product!==`accounts/${accountId}/products/${id}`||response.offerId!==offer.offerId||response.contentLanguage!=='tr'||response.feedLabel!=='TR')googleError('provider_unavailable');
  return {productId:id};
 }
 async getProduct(token:string,accountId:string,id:string):Promise<GoogleMerchantProviderProduct|null> {
  numeric(accountId);productId(id);const response=await this.request(`/products/v1/accounts/${accountId}/products/${encodeURIComponent(id)}`,token,{},true);if(response===null)return null;
  if(response.name!==`accounts/${accountId}/products/${id}`||response.offerId!==id.slice(6)||response.contentLanguage!=='tr'||response.feedLabel!=='TR')googleError('provider_unavailable');
  const dataSourceId=sourceId(response.dataSource,accountId),state=response.productStatus===undefined?{}:record(response.productStatus);
  const destinations=list(state.destinationStatuses).map(record).filter(d=>d.reportingContext==='FREE_LISTINGS');
  let status:GoogleMerchantProviderProduct['status']='pending';
  const approved=destinations.some(d=>list(d.approvedCountries).includes('TR')),disapproved=destinations.some(d=>list(d.disapprovedCountries).includes('TR')),pending=destinations.some(d=>list(d.pendingCountries).includes('TR'));
  const issues=list(state.itemLevelIssues).map(record).filter(issue=>issue.reportingContext===undefined||issue.reportingContext==='FREE_LISTINGS').filter(issue=>issue.applicableCountries===undefined||list(issue.applicableCountries).includes('TR'));
  if(disapproved||issues.some(i=>i.severity==='DISAPPROVED'))status='disapproved';else if(approved&&!pending)status=issues.some(i=>i.severity==='DEMOTED')?'limited':'approved';
  const expiresAt=typeof state.googleExpirationDate==='string'&&Number.isFinite(Date.parse(state.googleExpirationDate))?state.googleExpirationDate:null;
  const processedAttributes=response.productAttributes===undefined?{}:record(response.productAttributes),label=processedAttributes.customLabel4;
  const revision=typeof label==='string'&&/^cbxrev_[a-f0-9]{64}$/.test(label)?label.slice(7):null;
  return {productId:id,offerId:id.slice(6),contentLanguage:'tr',feedLabel:'TR',dataSourceId,revision,status,issues:issues.map(issue=>({code:text(issue.code,128),...(typeof issue.description==='string'?{description:text(issue.description,500)}:{})})),expiresAt};
 }
 async deleteProduct(token:string,accountId:string,dataSourceId:string,id:string):Promise<void> {
  numeric(accountId);numeric(dataSourceId);productId(id);
  await this.request(`/products/v1/accounts/${accountId}/productInputs/${encodeURIComponent(id)}?dataSource=${encodeURIComponent(`accounts/${accountId}/dataSources/${dataSourceId}`)}`,token,{method:'DELETE'},true);
 }
}
