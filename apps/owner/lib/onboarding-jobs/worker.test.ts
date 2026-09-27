import assert from 'node:assert/strict';
import test from 'node:test';
import type { FinishOnboardingJob, OnboardingJobRepository } from './types.ts';
const scope = {ownerOrigin:'https://owner.example.test',panelOrigin:'https://panel.example.test',platformDomainSuffix:'example.test'};
const now = new Date('2026-09-27T00:00:00Z');
async function worker() {
  try { return await import('./worker.ts'); } catch { assert.fail('durable worker is not implemented'); }
}
function fixture(count=1) {
  const finished: FinishOnboardingJob[]=[];
  const repository: OnboardingJobRepository = {
    async claim(){return Array.from({length:count},(_,i)=>({attemptId:`attempt_${String(i).padStart(16,'0')}`,leaseToken:`lease-${i}`,failureCount:0,createdAt:now.toISOString()}));},
    async finish(input){finished.push(input);return true;},async heartbeat(){},async readSnapshot(){return undefined;},
  };
  return {repository,finished};
}
test('pending completion preserves retry budget and never probes',async()=>{
  const {runOnboardingTick}=await worker();const f=fixture();
  const counts=await runOnboardingTick({scope,now},{...f,complete:async()=>({kind:'pending'}),probe:async()=>assert.fail('pending probed')});
  assert.equal(counts.pending,1);assert.equal(f.finished[0].state,'pending');
});
test('worker bounds concurrency at two and scrubs thrown errors',async()=>{
  const {runOnboardingTick}=await worker();const f=fixture(7);let active=0,max=0;
  const counts=await runOnboardingTick({scope,now},{...f,complete:async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;throw new Error('private diagnostic');},probe:async()=>assert.fail('failure probed')});
  assert.equal(max,2);assert.equal(counts.retry,7);assert.equal(JSON.stringify(f.finished).includes('private diagnostic'),false);
});
test('expired worker finish CAS is reported stale',async()=>{
  const {runOnboardingTick}=await worker();const f=fixture();f.repository.finish=async()=>false;
  const counts=await runOnboardingTick({scope,now},{...f,complete:async()=>({kind:'pending'}),probe:async()=>assert.fail()});
  assert.equal(counts.stale,1);assert.equal(counts.pending,0);
});
test('nonretryable authority failure requests attention',async()=>{
  const {runOnboardingTick}=await worker();const f=fixture();
  await runOnboardingTick({scope,now},{...f,complete:async()=>({kind:'attention_required'}),probe:async()=>assert.fail()});
  assert.equal(f.finished[0].state,'attention_required');
});
test('claim failure cannot advertise a healthy worker heartbeat',async()=>{
 const {runOnboardingTick}=await worker();const f=fixture();let heartbeats=0;f.repository.heartbeat=async()=>{heartbeats++;};f.repository.claim=async()=>{throw new Error('unavailable');};
 await assert.rejects(()=>runOnboardingTick({scope,now},{...f,complete:async()=>({kind:'pending'}),probe:async()=>assert.fail()}));
 assert.equal(heartbeats,0);
});
test('wrong-tenant access proof requests attention instead of retrying an authority mismatch',async()=>{
 const {runOnboardingTick}=await worker();const f=fixture();const storeId='00000000-0000-4000-8000-000000000001';
 await runOnboardingTick({scope,now},{...f,complete:async()=>({kind:'completed',result:{store:{id:storeId}} as import('@celebix/saas-contracts').CreateStarterTenantResult}),probe:async(_scope,_result,attemptId)=>({attemptId,storeId,checkedAt:now.toISOString(),state:'unavailable',safeCodes:['authority_invalid']})});
 assert.equal(f.finished[0].state,'attention_required');assert.equal(f.finished[0].safeCode,'authority_invalid');
});
test('job audit uses only final safe code and bounded age/retry; failed logging cannot reverse saved state',async()=>{
 const {runOnboardingTick}=await worker();const f=fixture();const observed:unknown[]=[];
 const counts=await runOnboardingTick({scope,now},{...f,complete:async()=>({kind:'pending'}),probe:async()=>assert.fail(),audit:event=>{observed.push(event);throw new Error('private sink');}});
 assert.equal(counts.pending,1);assert.deepEqual(observed,[{attemptId:'attempt_0000000000000000',stage:'tenant_completion',code:'completion_pending',retry:0,ageSeconds:0}]);
});
