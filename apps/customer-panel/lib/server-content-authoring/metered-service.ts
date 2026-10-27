import 'server-only';
import {parseContentGenerationView} from '../../../../packages/saas-contracts/src/content-authoring/validation.ts';
import type {ContentAuthoringField} from '../../../../packages/saas-contracts/src/content-authoring/types.ts';
import type {ContentGeneration} from '../../../../packages/saas-data/src/content-authoring/types.ts';
import type {ToshiCreditRepository} from '../../../../packages/saas-data/src/toshi-credits/types.ts';
import {fingerprintContentAuthoringRequest} from './facts.ts';
import {ContentAuthoringError,type ContentAuthoringService} from './service.ts';
import {selectedContentCreditCost} from './toshi-policy.ts';

/** Durable generation remains the source of truth; the separate wallet only meters usable results. */
export function createMeteredContentAuthoringService(service:ContentAuthoringService,credits:ToshiCreditRepository):ContentAuthoringService{
 const view=(g:ContentGeneration)=>parseContentGenerationView({id:g.id,draftId:g.draftId,productId:g.productId,status:g.status,draft:g.draft,sourceFingerprint:g.sourceFingerprint,usage:g.usage,safeCode:g.safeCode,createdAt:g.createdAt,updatedAt:g.updatedAt,finishedAt:g.finishedAt});
 const settle=async(g:ContentGeneration,base:{tenantContext:Parameters<ContentAuthoringService['getGeneration']>[0]['tenantContext'];operationId:string;now:Date})=>{
  if(g.status==='completed'&&g.draft){
   view(g);const fields=(['description','seoTitle','seoDescription']as ContentAuthoringField[]).filter(f=>g.draft![f]!==undefined);
   try{await credits.complete({...base,now:new Date(),fingerprint:g.requestFingerprint,result:g,chargedCredits:selectedContentCreditCost(fields)});}catch(error){if((error as {code?:string})?.code!=='operation_not_found')throw error;}
  }else if(g.status==='failed'||g.status==='unknown'){
   try{await credits.fail({...base,now:new Date(),fingerprint:g.requestFingerprint,safeCode:g.safeCode??'invalid_output',unknown:g.status==='unknown'});}catch(error){if((error as {code?:string})?.code!=='operation_not_found')throw error;}
  }
  return g;
 };
 return Object.freeze({
  async getGeneration(input){const base={...input,now:input.now??new Date()};return settle(await service.getGeneration(input),base);},
  async generateContent(input){
   const fingerprint=fingerprintContentAuthoringRequest(input.request),base={tenantContext:input.tenantContext,operationId:input.operationId,now:new Date()};
   const reservation=await credits.reserve({...base,fingerprint,cost:selectedContentCreditCost(input.request.fields)});
   if(reservation.kind==='replayed'&&reservation.status==='completed'&&reservation.result){const g=reservation.result as ContentGeneration;if(g.id!==input.operationId||g.requestFingerprint!==fingerprint)throw new ContentAuthoringError('operation_mismatch');view(g);return g;}
   if(reservation.kind!=='created'){
    try{return await settle(await service.getGeneration(base),base);}catch(error){if((error as {code?:string})?.code==='operation_not_found')throw new ContentAuthoringError('operation_busy');throw error;}
   }
   let generated:ContentGeneration;
   try{generated=await service.generateContent(input);}
   catch(error){
    const code=String((error as {code?:string})?.code??'unavailable');
    // An uncertain finalizer is only observed, never released/redispatched by a timeout retry.
    if(code==='commit_unknown')throw error;
    try{await credits.fail({...base,now:new Date(),fingerprint,safeCode:/^[a-z][a-z0-9_]{0,63}$/.test(code)?code:'unavailable',unknown:['provider_timeout','provider_unavailable','cancelled'].includes(code)});}catch{/* Retained reservation expires without customer deduction. */}
    throw error;
   }
   // A completed generation remains recoverable if wallet settlement is unavailable.
   // Never turn a settlement error into a terminal release of its reservation.
   return settle(generated,base);
  }
 });
}
