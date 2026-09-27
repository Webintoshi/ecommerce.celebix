import {normalizeOnboardingScope,SAFE_CODES,type RegistrationAuthorityScope,type OnboardingSafeCode} from '../onboarding-jobs/types.ts';
import type {OnboardingAuditInput} from '../onboarding-jobs/audit.ts';
export interface OnboardingOperationRow {attemptId:string;state:'pending'|'leased'|'ready'|'attention_required';safeCode:OnboardingSafeCode;failureCount:number;dueAt:string;createdAt:string;updatedAt:string;version:number}
export type RetryOutcome='queued'|'busy'|'conflict';
export interface OperationsRepository {
 listOperations(input:{scope:RegistrationAuthorityScope;now:Date;limit:number}):Promise<OnboardingOperationRow[]>;
 readHealth(scope:RegistrationAuthorityScope,now:Date):Promise<unknown>;
 requestRetry(input:{scope:RegistrationAuthorityScope;attemptId:string;expectedVersion:number;now:Date}):Promise<RetryOutcome>;
}
export interface OperatorAuthority {superAdmin:boolean}
export interface OperationsData {
 workerState:'healthy'|'degraded';counts:{pending:number;ready:number;attentionRequired:number};oldestAgeSeconds:number;
 jobs:{jobId:string;state:OnboardingOperationRow['state'];safeCode:OnboardingSafeCode;retryCount:number;nextDueAt:string;updatedAt:string;version:number;ageSeconds:number;severity:'normal'|'warning'|'alert';canRetry:boolean}[];
}
const validId=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(value);
const date=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
export function createOnboardingOperationsService(input:{scope:RegistrationAuthorityScope;repository:OperationsRepository;isCompletionActive:(id:string)=>Promise<boolean>;audit?:(event:OnboardingAuditInput)=>void}){
 const scope=normalizeOnboardingScope(input.scope);
 return {
  async list(authority:OperatorAuthority,now:Date):Promise<{kind:'ok';data:OperationsData}|{kind:'forbidden'|'unavailable'}>{
   if(authority.superAdmin!==true)return {kind:'forbidden'};
   try{
    if(!Number.isFinite(+now))throw new Error('invalid_time');
    const [rows,health]=await Promise.all([input.repository.listOperations({scope,now,limit:50}),input.repository.readHealth(scope,now)]);
    const h=health as Record<string,unknown>;
    if(!h||!['healthy','degraded'].includes(String(h.workerState))||!['pending','ready','attentionRequired'].every(k=>Number.isSafeInteger(h[k])&&Number(h[k])>=0)||rows.length>50)throw new Error('invalid_read');
    const jobs=rows.map(row=>{
     if(!validId(row.attemptId)||!['pending','leased','ready','attention_required'].includes(row.state)||!SAFE_CODES.includes(row.safeCode)||!Number.isInteger(row.failureCount)||row.failureCount<0||row.failureCount>10||!Number.isSafeInteger(row.version)||row.version<1||![row.createdAt,row.updatedAt,row.dueAt].every(date)||Date.parse(row.createdAt)>+now)throw new Error('invalid_row');
     const ageSeconds=Math.max(0,Math.floor((+now-Date.parse(row.createdAt))/1000));
     const waiting=row.state!=='ready';
     return {jobId:row.attemptId,state:row.state,safeCode:row.safeCode,retryCount:row.failureCount,nextDueAt:row.dueAt,updatedAt:row.updatedAt,version:row.version,ageSeconds,
      severity:(waiting&&ageSeconds>=900?'alert':waiting&&ageSeconds>=300?'warning':'normal') as 'normal'|'warning'|'alert',canRetry:row.state==='pending'||row.state==='attention_required'};
    });
    return {kind:'ok',data:{workerState:h.workerState as OperationsData['workerState'],counts:{pending:Number(h.pending),ready:Number(h.ready),attentionRequired:Number(h.attentionRequired)},oldestAgeSeconds:Math.max(0,...jobs.filter(j=>j.state!=='ready').map(j=>j.ageSeconds)),jobs}};
   }catch{return {kind:'unavailable'};}
  },
  async retry(authority:OperatorAuthority,command:{jobId:string;expectedVersion:number},now:Date):Promise<{kind:RetryOutcome|'forbidden'|'invalid'|'unavailable'}>{
   if(authority.superAdmin!==true)return {kind:'forbidden'};
   if(!validId(command.jobId)||!Number.isSafeInteger(command.expectedVersion)||command.expectedVersion<1||!Number.isFinite(+now))return {kind:'invalid'};
   try{
    if(await input.isCompletionActive(command.jobId))return {kind:'busy'};
    const outcome=await input.repository.requestRetry({scope,attemptId:command.jobId,expectedVersion:command.expectedVersion,now});
    if(!['queued','busy','conflict'].includes(outcome))return {kind:'unavailable'};
    if(outcome==='queued')try{input.audit?.({attemptId:command.jobId,stage:'operator_retry',code:'completion_pending'});}catch{/* A diagnostic cannot reverse the committed retry. */}
    return {kind:outcome};
   }catch{return {kind:'unavailable'};}
  },
 };
}
export type OnboardingOperationsService=ReturnType<typeof createOnboardingOperationsService>;
