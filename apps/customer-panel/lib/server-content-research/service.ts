import 'server-only';
import { createHash } from 'node:crypto';
import { isMerchantActionAllowed, parseContentResearchRequest, parseContentResearchSource, toContentResearchResult, type ContentResearchRequest, type ContentResearchResult, type ContentResearchSource, type TenantContext } from '@celebix/saas-contracts';
import type { ContentResearchRepository } from '../../../../packages/saas-data/src/content-research/types.ts';
import { ContentResearchError, createContentResearchFetcher } from '../content-research/fetcher.ts';

const SAFE = new Set(['invalid_input','content_research_url_invalid','content_research_address_denied','content_research_redirect_invalid','content_research_response_invalid','content_research_response_too_large','content_research_extraction_invalid','content_research_extraction_too_large','content_research_timeout','content_research_unavailable','cancelled','unavailable','commit_unknown','operation_not_found','operation_mismatch','version_conflict','dispatch_already_claimed','rate_limited','quota_exceeded','operation_busy','membership_denied','store_inactive']);
export class ContentResearchServiceError extends Error { constructor(readonly code: string) { super('content_research_failed'); this.code = SAFE.has(code) ? code : 'unavailable'; } }
function safe(error: unknown): ContentResearchServiceError { if (error instanceof ContentResearchServiceError) return error; if (error instanceof ContentResearchError) return new ContentResearchServiceError(error.code); const d=error&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,'code'):null;return new ContentResearchServiceError(d&&'value'in d&&typeof d.value==='string'?d.value:'unavailable'); }
function assertTenant(tenant: TenantContext) { if (tenant.store.status!=='active') throw new ContentResearchServiceError('store_inactive'); if (tenant.membership.status!=='active'||!isMerchantActionAllowed(tenant.membership.role,'content.manage')) throw new ContentResearchServiceError('membership_denied'); }
type Fetcher=ReturnType<typeof createContentResearchFetcher>;
type Deps=Readonly<{repository:ContentResearchRepository;fetcher:Pick<Fetcher,'fetch'>;now():Date;clock?():number;deadlineMs?:number}>;
type ResearchInput=Readonly<{tenantContext:TenantContext;operationId:string;request:ContentResearchRequest;signal:AbortSignal}>;
export function createContentResearchService(deps:Deps) {
 const clock=deps.clock??(()=>performance.now());
 const authority=(tenantContext:TenantContext,operationId:string)=>({tenantContext,operationId,now:deps.now()});
 async function get(input:Readonly<{tenantContext:TenantContext;operationId:string}>):Promise<ContentResearchResult>{assertTenant(input.tenantContext);return toContentResearchResult(await deps.repository.get(authority(input.tenantContext,input.operationId)));}
 async function research(input:ResearchInput):Promise<ContentResearchResult>{
  assertTenant(input.tenantContext);
  let request:ContentResearchRequest;try{request=parseContentResearchRequest(input.request);}catch{throw new ContentResearchServiceError('invalid_input');}
  const requestFingerprint=createHash('sha256').update(JSON.stringify(request)).digest('hex');
  const start=clock(),limit=Math.min(deps.deadlineMs??20000,20000);if(!Number.isFinite(start)||!Number.isFinite(limit)||limit<=0)throw new ContentResearchServiceError('content_research_timeout');
  const controller=new AbortController(),signal=AbortSignal.any([input.signal,controller.signal]),timer=setTimeout(()=>controller.abort(),limit),deadlineAt=start+limit;
  const aborted=new Promise<never>((_,reject)=>{const rejectAbort=()=>reject(new ContentResearchServiceError(input.signal.aborted?'cancelled':'content_research_timeout'));signal.addEventListener('abort',rejectAbort,{once:true});if(signal.aborted)rejectAbort();});void aborted.catch(()=>{});
  const bounded=<T>(promise:Promise<T>):Promise<T>=>Promise.race([promise,aborted]);
  const base=()=>authority(input.tenantContext,input.operationId),usage=(attempted:number,sources:readonly ContentResearchSource[])=>Object.freeze({sourcesAttempted:attempted,fetchedBytes:sources.reduce((n,s)=>n+s.byteCount,0),extractedBytes:sources.reduce((n,s)=>n+Buffer.byteLength(s.extractedText,'utf8'),0),elapsedMs:Math.max(0,Math.min(60000,Math.floor(clock()-start)))});
  let row:Awaited<ReturnType<ContentResearchRepository['get']>>|undefined,claim:Awaited<ReturnType<ContentResearchRepository['claim']>>|undefined,attempted=0,finalizing=false;
  const sources:ContentResearchSource[]=[];
  try{
   // A repeated operation is observable only; it never starts another network attempt.
   try{row=await bounded(deps.repository.get(base()));if(row.requestFingerprint!==requestFingerprint)throw new ContentResearchServiceError('operation_mismatch');return toContentResearchResult(row);}catch(error){if(safe(error).code!=='operation_not_found')throw error;}
   const begun=await bounded(deps.repository.begin({...base(),requestFingerprint,target:request.target}));row=begun.operation;
   if(begun.kind!=='pending'||row.status!=='pending'||row.dispatchState!=='not_dispatched')return toContentResearchResult(row);
   if(signal.aborted)throw new ContentResearchServiceError(input.signal.aborted?'cancelled':'content_research_timeout');
   claim=await bounded(deps.repository.claim({...base(),expectedVersion:row.version}));
   for(const url of request.urls){if(signal.aborted||clock()>=deadlineAt)throw new ContentResearchServiceError(input.signal.aborted?'cancelled':'content_research_timeout');attempted++;const fetched=await bounded(deps.fetcher.fetch({url,signal,deadlineAt}));let source:ContentResearchSource;try{source=parseContentResearchSource(fetched);if(createHash('sha256').update(source.extractedText,'utf8').digest('hex')!==source.contentSha256)throw Error();}catch{throw new ContentResearchServiceError('content_research_extraction_invalid');}sources.push(source);if(sources.reduce((n,s)=>n+Buffer.byteLength(s.extractedText,'utf8'),0)>32000)throw new ContentResearchServiceError('content_research_extraction_too_large');}
   if(signal.aborted||clock()>=deadlineAt)throw new ContentResearchServiceError(input.signal.aborted?'cancelled':'content_research_timeout');
   finalizing=true;return toContentResearchResult(await deps.repository.complete({...base(),expectedVersion:claim.version,claimToken:claim.claimToken,sources,usage:usage(attempted,sources)}));
  }catch(error){
   const mapped=safe(error);
   if(!row||mapped.code==='operation_mismatch')throw mapped;
   if(finalizing||mapped.code==='commit_unknown'||mapped.code==='version_conflict'||mapped.code==='dispatch_already_claimed')return toContentResearchResult(await deps.repository.get(base()));
   const ambiguous=!!claim&&['content_research_timeout','content_research_unavailable','cancelled'].includes(mapped.code);
   try{return toContentResearchResult(await deps.repository.fail({...base(),expectedVersion:claim?.version??row.version,claimToken:claim?.claimToken??null,safeCode:mapped.code,dispatchState:ambiguous?'unknown':claim?'dispatched':'not_dispatched',usage:usage(attempted,sources)}));}catch{return toContentResearchResult(await deps.repository.get(base()));}
  }finally{clearTimeout(timer);controller.abort();}
 }
 return Object.freeze({research,get});
}
export type ContentResearchService=ReturnType<typeof createContentResearchService>;
