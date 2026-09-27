import {createHmac} from 'node:crypto';
import {SAFE_CODES, type OnboardingSafeCode} from './types.ts';
import type {RegistrationCompletionAuditEvent} from '../self-serve-registration-completion.ts';
export const ONBOARDING_AUDIT_STAGES=['tenant_completion','tenant_recovery','access_probe','operator_retry'] as const;
export interface OnboardingAuditInput {attemptId:string;stage:typeof ONBOARDING_AUDIT_STAGES[number];code:OnboardingSafeCode;retry?:number;ageSeconds?:number}
export function createOnboardingAudit(input:{key:Uint8Array;write:(event:Readonly<Record<string,string|number>>)=>void}){
 if(input.key.length!==32)throw new Error('onboarding_audit_key_invalid');
 const key=Buffer.from(input.key);
 return (event:OnboardingAuditInput):void=>{
  if(!event||typeof event.attemptId!=='string'||event.attemptId.length>256||!ONBOARDING_AUDIT_STAGES.includes(event.stage)||!SAFE_CODES.includes(event.code))return;
  const output:Record<string,string|number>={schemaVersion:1,event:'onboarding_operation',stage:event.stage,code:event.code,
   correlation:createHmac('sha256',key).update('celebix:onboarding-audit:v1\0').update(event.attemptId).digest('hex').slice(0,24)};
  if(Number.isSafeInteger(event.retry)&&event.retry!>=0&&event.retry!<=10)output.retry=event.retry!;
  if(Number.isSafeInteger(event.ageSeconds)&&event.ageSeconds!>=0)output.ageSeconds=Math.min(event.ageSeconds!,31_536_000);
  try{input.write(Object.freeze(output));}catch{/* Diagnostics do not change a durable outcome. */}
 };
}
export function createRegistrationCompletionAudit(write:(event:Readonly<Record<string,string|number>>)=>void){
 return (event:RegistrationCompletionAuditEvent):void=>{
  if(!['record_verified_identity','resume_tenant_creation','reconcile_unknown_commit'].includes(event.operation)||!['completed','rejected','pending','absent','failed','commit_unknown'].includes(event.outcome))return;
  try{write(Object.freeze({schemaVersion:1,event:'onboarding_completion',stage:event.operation,code:event.outcome}));}catch{/* Diagnostics are independent of completion. */}
 };
}
