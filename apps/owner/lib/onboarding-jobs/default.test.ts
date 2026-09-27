import assert from 'node:assert/strict';
import test from 'node:test';
async function load(){try{return await import('./default.ts');}catch{assert.fail('onboarding recovery adapter missing');}}
test('fenced recovery uses separate recovery port after absence and never resets original attempt',async()=>{
 const {completeOnboardingAttempt}=await load();const calls:string[]=[];
 const outcome=await completeOnboardingAttempt('attempt_0000000000000001',{resumeTenantCreation:async()=>{calls.push('resume');return {kind:'reconciliation_required'};},reconcileUnknownCommit:async()=>{calls.push('reconcile');return {kind:'recovery_absent',state:'ready'};}},{resumeRecoveredTenantCreation:async()=>{calls.push('fenced');return {kind:'in_progress'};}});
 assert.equal(outcome.kind,'pending');assert.deepEqual(calls,['resume','reconcile','fenced']);
});
test('active completion lease remains pending without recovery writes',async()=>{
 const {completeOnboardingAttempt}=await load();
 let reconciled=0;
 assert.equal((await completeOnboardingAttempt('attempt_0000000000000001',{resumeTenantCreation:async()=>({kind:'in_progress'}),reconcileUnknownCommit:async()=>{reconciled++;return {kind:'pending'};}},{resumeRecoveredTenantCreation:async()=>assert.fail()})).kind,'pending');assert.equal(reconciled,1);
});
test('crashed creating workflow reconciles old commit or fenced absence instead of remaining pending forever',async()=>{
 const {completeOnboardingAttempt}=await load();const calls:string[]=[];
 const result={schemaVersion:1,store:{id:'00000000-0000-4000-8000-000000000001'}} as import('@celebix/saas-contracts').CreateStarterTenantResult;
 const committed=await completeOnboardingAttempt('attempt_0000000000000001',{resumeTenantCreation:async()=>({kind:'in_progress'}),reconcileUnknownCommit:async()=>{calls.push('reconcile-commit');return {kind:'tenant_recovered',result};}},{resumeRecoveredTenantCreation:async()=>assert.fail()});
 assert.deepEqual(committed,{kind:'completed',result});
 const absent=await completeOnboardingAttempt('attempt_0000000000000001',{resumeTenantCreation:async()=>({kind:'in_progress'}),reconcileUnknownCommit:async()=>{calls.push('reconcile-absent');return {kind:'recovery_absent',state:'ready'};}},{resumeRecoveredTenantCreation:async()=>{calls.push('fenced-retry');return {kind:'tenant_created',result};}});
 assert.deepEqual(absent,{kind:'completed',result});assert.deepEqual(calls,['reconcile-commit','reconcile-absent','fenced-retry']);
});
test('completed tenant access refresh never re-enters completion or session creation',async()=>{
 const {createDefaultOnboardingWorker}=await load();const now=new Date();let probed=0;
 const result={store:{id:'00000000-0000-4000-8000-000000000001'}} as import('@celebix/saas-contracts').CreateStarterTenantResult;
 const worker=createDefaultOnboardingWorker({scope:{ownerOrigin:'https://owner.example.test',panelOrigin:'https://panel.example.test',platformDomainSuffix:'example.test'},repository:{heartbeat:async()=>{},claim:async()=>[{attemptId:'attempt_0000000000000001',leaseToken:'token',failureCount:0,createdAt:now.toISOString()}],finish:async()=>true,readSnapshot:async()=>undefined},completion:{resumeTenantCreation:async()=>assert.fail('completion invoked for completed result'),reconcileUnknownCommit:async()=>assert.fail()},recovery:{resumeRecoveredTenantCreation:async()=>assert.fail()},readCompletedTenant:async()=>result,probe:async(_scope,_result,attemptId)=>{probed++;return {attemptId,storeId:result.store.id,checkedAt:now.toISOString(),state:'ready',safeCodes:['access_ready']};}});
 const counts=await worker.tick();assert.equal(counts.ready,1);assert.equal(probed,1);
});
test('bounded housekeeping follows a successful tick and cannot alter provisioning outcome',async()=>{
 const {createDefaultOnboardingWorker}=await load();let cleaned=0;const diagnostics:string[]=[];
 const worker=createDefaultOnboardingWorker({scope:{ownerOrigin:'https://owner.example.test',panelOrigin:'https://panel.example.test',platformDomainSuffix:'example.test'},repository:{heartbeat:async()=>{},claim:async()=>[],finish:async()=>true,readSnapshot:async()=>undefined},completion:{resumeTenantCreation:async()=>assert.fail(),reconcileUnknownCommit:async()=>assert.fail()},recovery:{resumeRecoveredTenantCreation:async()=>assert.fail()},probe:async()=>assert.fail(),cleanup:async()=>{cleaned++;throw new Error('private details');},diagnostic:code=>diagnostics.push(code)});
 assert.equal((await worker.tick()).claimed,0);assert.equal(cleaned,1);assert.deepEqual(diagnostics,['onboarding_housekeeping_unavailable']);
});
