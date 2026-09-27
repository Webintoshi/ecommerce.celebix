import type { CreateStarterTenantResult } from '@celebix/saas-contracts';
import { normalizeOnboardingScope, type RegistrationAuthorityScope, type OnboardingAccessSnapshot, type OnboardingJobRepository, type FinishOnboardingJob } from './types.ts';
export type CompletionOutcome = {kind:'completed';result:CreateStarterTenantResult}|{kind:'pending'|'retry'|'attention_required'};
export interface OnboardingTickDependencies {
 repository: OnboardingJobRepository;
 complete(attemptId:string):Promise<CompletionOutcome>;
 probe(scope:RegistrationAuthorityScope,result:CreateStarterTenantResult,attemptId:string):Promise<OnboardingAccessSnapshot>;
 clock?:()=>Date;
}
export async function runOnboardingTick(input:{scope:RegistrationAuthorityScope;now:Date;limit?:number},dependencies:OnboardingTickDependencies) {
 const scope=normalizeOnboardingScope(input.scope);const limit=input.limit??25;
 if(!Number.isInteger(limit)||limit<1||limit>25||!Number.isFinite(input.now.getTime()))throw new Error('onboarding_tick_invalid');
 const counts={claimed:0,ready:0,pending:0,retry:0,attentionRequired:0,stale:0};
 const jobs=await dependencies.repository.claim({scope,now:input.now,limit});counts.claimed=jobs.length;
 await dependencies.repository.heartbeat(scope,input.now);
 let cursor=0;
 async function consume(){
  for(;;){const job=jobs[cursor++];if(!job)return;
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
   if(!saved)counts.stale++;else if(state==='attention_required'||(state==='retry'&&job.failureCount>=9))counts.attentionRequired++;else counts[state]++;
  }
 }
 let heartbeatPending=false;
 const heartbeat=setInterval(()=>{
  if(heartbeatPending)return;heartbeatPending=true;
  void dependencies.repository.heartbeat(scope,dependencies.clock?.()??input.now).catch(()=>undefined).finally(()=>{heartbeatPending=false;});
 },15000);
 try{await Promise.all([consume(),consume()]);}finally{clearInterval(heartbeat);}
 await dependencies.repository.heartbeat(scope,dependencies.clock?.()??input.now);
 return Object.freeze(counts);
}
