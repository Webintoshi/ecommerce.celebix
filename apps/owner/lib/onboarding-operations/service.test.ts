import assert from 'node:assert/strict';
import test from 'node:test';
import {createOnboardingOperationsService} from './service.ts';
import {createOnboardingAudit,createRegistrationCompletionAudit} from '../onboarding-jobs/audit.ts';
const scope={ownerOrigin:'https://owner.saas-staging.celebix.net',panelOrigin:'https://panel.saas-staging.celebix.net',platformDomainSuffix:'saas-staging.celebix.net'};
const now=new Date('2026-09-28T08:00:00Z');
function fixture(overrides:Record<string,unknown>={}){
 const calls:unknown[]=[];
 const repository={
  listOperations:async()=>[{attemptId:'job-1',state:'pending',safeCode:'access_pending',failureCount:2,dueAt:now.toISOString(),createdAt:new Date(+now-900_000).toISOString(),updatedAt:now.toISOString(),version:3,email:'private@example.invalid'}],
  readHealth:async()=>({workerState:'degraded',pending:1,ready:0,attentionRequired:0,password:'secret'}),
  requestRetry:async(input:unknown)=>{calls.push(input);return 'queued' as const;},
  ...overrides,
 };
 return {calls,service:createOnboardingOperationsService({scope,repository:repository as never,isCompletionActive:async()=>false})};
}
test('operations allow only explicit super-admin authority and expose sanitized age alarms',async()=>{
 const {service}=fixture();
 assert.equal((await service.list({superAdmin:false},now)).kind,'forbidden');
 const result=await service.list({superAdmin:true},now);
 assert.equal(result.kind,'ok');if(result.kind!=='ok')return;
 assert.equal(result.data.jobs[0]?.severity,'alert');
 assert.equal(result.data.jobs[0]?.ageSeconds,900);
 assert.equal(result.data.workerState,'degraded');
 assert.equal(JSON.stringify(result).includes('private@'),false);
 assert.equal(JSON.stringify(result).includes('password'),false);
 assert.equal(result.data.oldestAgeSeconds,900);
});
test('retry uses current scope and expected version, never overrides active completion or a job lease',async()=>{
 const {service,calls}=fixture();
 assert.equal((await service.retry({superAdmin:false},{jobId:'job-1',expectedVersion:3},now)).kind,'forbidden');
 assert.equal((await service.retry({superAdmin:true},{jobId:'job-1',expectedVersion:3},now)).kind,'queued');
 assert.deepEqual(calls,[{scope,attemptId:'job-1',expectedVersion:3,now}]);
 const busy=createOnboardingOperationsService({scope,repository:fixture().service as never,isCompletionActive:async()=>true});
 assert.equal((await busy.retry({superAdmin:true},{jobId:'job-1',expectedVersion:3},now)).kind,'busy');
 const conflict=fixture({requestRetry:async()=> 'conflict'});
 assert.equal((await conflict.service.retry({superAdmin:true},{jobId:'job-1',expectedVersion:2},now)).kind,'conflict');
 assert.equal((await service.retry({superAdmin:true},{jobId:'job-1',expectedVersion:0},now)).kind,'invalid');
});
test('failed or malformed reads stay unavailable; five-minute waiting jobs warn',async()=>{
 const failed=fixture({readHealth:async()=>{throw new Error('contains private details');}});
 assert.deepEqual(await failed.service.list({superAdmin:true},now),{kind:'unavailable'});
 const malformed=fixture({listOperations:async()=>[{attemptId:'job-1',state:'pending',safeCode:'raw-provider-error',failureCount:0,dueAt:now.toISOString(),createdAt:now.toISOString(),updatedAt:now.toISOString(),version:1}]});
 assert.equal((await malformed.service.list({superAdmin:true},now)).kind,'unavailable');
 const warning=fixture({listOperations:async()=>[{attemptId:'job-1',state:'pending',safeCode:'completion_pending',failureCount:0,dueAt:now.toISOString(),createdAt:new Date(+now-300_000).toISOString(),updatedAt:now.toISOString(),version:1}]});
 const result=await warning.service.list({superAdmin:true},now);
 assert.equal(result.kind==='ok'&&result.data.jobs[0]?.severity,'warning');
});
test('audit is purpose separated and copies only bounded safe fields, with logging failure isolation',()=>{
 const events:unknown[]=[];const key=new Uint8Array(32).fill(4);
 const audit=createOnboardingAudit({key,write:event=>events.push(event)});
 audit({attemptId:'job-1',stage:'tenant_recovery',code:'completion_pending',retry:2,ageSeconds:400,email:'private@example.invalid'} as never);
 audit({attemptId:'job-1',stage:'tenant_recovery',code:'raw exception with password'} as never);
 assert.equal(events.length,1);assert.equal(JSON.stringify(events).includes('private'),false);
 assert.equal(JSON.stringify(events).includes('job-1'),false);
 assert.match((events[0] as {correlation:string}).correlation,/^[a-f0-9]{24}$/);
 const other:unknown[]=[];createOnboardingAudit({key:new Uint8Array(32).fill(5),write:event=>other.push(event)})({attemptId:'job-1',stage:'tenant_recovery',code:'completion_pending'});
 assert.notEqual((events[0] as {correlation:string}).correlation,(other[0] as {correlation:string}).correlation);
 assert.doesNotThrow(()=>createOnboardingAudit({key,write:()=>{throw new Error('log sink failed');}})({attemptId:'job-1',stage:'tenant_recovery',code:'completion_pending'}));
 const completion:unknown[]=[];createRegistrationCompletionAudit(event=>completion.push(event))({operation:'resume_tenant_creation',outcome:'completed',password:'private',state:'private'} as never);
 createRegistrationCompletionAudit(event=>completion.push(event))({operation:'raw error',outcome:'password private'} as never);assert.equal(completion.length,1);
 assert.deepEqual(completion,[{schemaVersion:1,event:'onboarding_completion',stage:'resume_tenant_creation',code:'completed'}]);
});
