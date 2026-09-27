import type { CreateStarterTenantResult } from '@celebix/saas-contracts';
import { normalizeOnboardingScope, type RegistrationAuthorityScope, type OnboardingAccessSnapshot, type OnboardingJobRepository, type FinishOnboardingJob,type OnboardingJob } from './types.ts';
import type {OnboardingAuditInput} from './audit.ts';
export type CompletionOutcome = {kind:'completed';result:CreateStarterTenantResult}|{kind:'pending'|'retry'|'attention_required'};
export interface OnboardingTickDependencies {
 repository: OnboardingJobRepository;
 complete(attemptId:string):Promise<CompletionOutcome>;
 probe(scope:RegistrationAuthorityScope,result:CreateStarterTenantResult,attemptId:string):Promise<OnboardingAccessSnapshot>;
 clock?:()=>Date;
 audit?:(event:OnboardingAuditInput)=>void;
}
export async function runOnboardingTick(input:{scope:RegistrationAuthorityScope;now:Date;limit?:number},dependencies:OnboardingTickDependencies) {
 const scope=normalizeOnboardingScope(input.scope);const limit=input.limit??25;
 if(!Number.isInteger(limit)||limit<1||limit>25||!Number.isFinite(input.now.getTime()))throw new Error('onboarding_tick_invalid');
 const counts={claimed:0,ready:0,pending:0,retry:0,attentionRequired:0,stale:0};
 async function consume(job:OnboardingJob){
   let state:FinishOnboardingJob['state']='retry',safeCode:FinishOnboardingJob['safeCode']='completion_unavailable';let snapshot:OnboardingAccessSnapshot|undefined;
   try{
    const completion=await dependencies.complete(job.attemptId);
    if(completion.kind==='completed'){
     snapshot=await dependencies.probe(scope,completion.result,job.attemptId);
     if(snapshot.attemptId!==job.attemptId||snapshot.storeId!==completion.result.store.id)throw new Error('onboarding_authority_invalid');
     state=snapshot.state==='ready'?'ready':'retry';safeCode=snapshot.state==='ready'?'access_ready':snapshot.state==='pending'?'access_pending':'access_unavailable';
     if(snapshot.safeCodes.includes('authority_invalid')){state='attention_required';safeCode='authority_invalid';}
    }else{state=completion.kind;safeCode=state==='pending'?'completion_pending':state==='attention_required'?'completion_failed':'completion_unavailable';}
   }catch{snapshot=undefined;}
   const now=dependencies.clock?.()??input.now;
   const saved=await dependencies.repository.finish({scope,attemptId:job.attemptId,leaseToken:job.leaseToken,now,state,safeCode,snapshot});
   if(saved)try{dependencies.audit?.({attemptId:job.attemptId,stage:snapshot?'access_probe':'tenant_completion',code:safeCode,retry:state==='retry'?Math.min(10,job.failureCount+1):job.failureCount,ageSeconds:Math.max(0,Math.floor((+now-Date.parse(job.createdAt))/1000))});}catch{/* Diagnostics cannot change the committed job. */}
   if(!saved)counts.stale++;else if(state==='attention_required'||(state==='retry'&&job.failureCount>=9))counts.attentionRequired++;else counts[state]++;
 }
 let heartbeatPending=false;
 let heartbeat:ReturnType<typeof setInterval>|undefined;
 function startHeartbeat(){heartbeat=setInterval(()=>{
  if(heartbeatPending)return;heartbeatPending=true;
  void dependencies.repository.heartbeat(scope,dependencies.clock?.()??input.now).catch(()=>undefined).finally(()=>{heartbeatPending=false;});
 },15000);}
 try{
  let remaining=limit;
  while(remaining>0){
   const requested=Math.min(2,remaining);const now=dependencies.clock?.()??input.now;
   const jobs=await dependencies.repository.claim({scope,now,limit:requested});
   if(jobs.length>requested)throw new Error('onboarding_claim_invalid');
   if(!heartbeat){await dependencies.repository.heartbeat(scope,now);startHeartbeat();}
   counts.claimed+=jobs.length;remaining-=jobs.length;
   if(jobs.length===0)break;
   const settled=await Promise.allSettled(jobs.map(consume));
   const failed=settled.find(result=>result.status==='rejected');
   if(failed?.status==='rejected')throw failed.reason;
   if(jobs.length<requested)break;
  }
 }finally{clearInterval(heartbeat);}
 await dependencies.repository.heartbeat(scope,dependencies.clock?.()??input.now);
 return Object.freeze(counts);
}
