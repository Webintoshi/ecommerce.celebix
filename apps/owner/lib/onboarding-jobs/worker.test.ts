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
 let claimed=0;
 const repository: OnboardingJobRepository = {
    async claim(input){const size=Math.min(count-claimed,input.limit);const start=claimed;claimed+=size;return Array.from({length:size},(_,i)=>({attemptId:`attempt_${String(start+i).padStart(16,'0')}`,leaseToken:`lease-${start+i}`,failureCount:0,createdAt:now.toISOString()}));},
    async finish(input){finished.push(input);return true;},async heartbeat(){},async readSnapshot(){return undefined;},
  };
  return {repository,finished};
}
test('pending completion preserves retry budget and never probes',async()=>{
  const {runOnboardingTick}=await worker();const f=fixture();
  const counts=await runOnboardingTick({scope,now},{...f,complete:async()=>({kind:'pending'}),probe:async()=>assert.fail('pending probed')});
  assert.equal(counts.pending,1);assert.equal(f.finished[0].state,'pending');
});
test('backlog leases are claimed only when two consumers can start, with fresh time and max25 total',async()=>{
 const {runOnboardingTick}=await worker();let time=+now,remaining=25,index=0;const leases=new Map<string,number>(),limits:number[]=[];
 const repository:OnboardingJobRepository={
  async claim(input){limits.push(input.limit);const count=Math.min(remaining,input.limit);remaining-=count;return Array.from({length:count},()=>{const leaseToken=`lease-${index++}`;leases.set(leaseToken,+input.now+60000);return {attemptId:`attempt_${String(index).padStart(16,'0')}`,leaseToken,failureCount:0,createdAt:now.toISOString()};});},
  async finish(input){return +input.now<leases.get(input.leaseToken)!;},async heartbeat(){},async readSnapshot(){return undefined;},
 };
 const result={store:{id:'00000000-0000-4000-8000-000000000001'}} as import('@celebix/saas-contracts').CreateStarterTenantResult;
 const counts=await runOnboardingTick({scope,now},{repository,clock:()=>new Date(time),complete:async()=>{time+=10000;return {kind:'completed',result};},probe:async(_scope,_result,attemptId)=>({attemptId,storeId:result.store.id,checkedAt:new Date(time).toISOString(),state:'ready',safeCodes:['access_ready']})});
 assert.equal(counts.claimed,25);assert.equal(counts.ready,25);assert.equal(counts.stale,0);assert.ok(limits.every(limit=>limit<=2));assert.equal(remaining,0);
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
test('a failed finish waits for the other active job before ending the tick',async()=>{
 const {runOnboardingTick}=await worker();const f=fixture(2);let release!:()=>void,started!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});const starting=new Promise<void>(resolve=>{started=resolve;});
 f.repository.finish=async input=>{if(input.attemptId.endsWith('0'))throw new Error('database_unavailable');return true;};
 let settled=false;
 const tick=runOnboardingTick({scope,now},{...f,complete:async attempt=>{if(attempt.endsWith('1')){started();await gate;}return {kind:'pending'};},probe:async()=>assert.fail()});
 const result=tick.then(()=>{settled=true;return null;},error=>{settled=true;return error;});
 await starting;await new Promise<void>(resolve=>setImmediate(resolve));const endedBeforeOtherJob=settled;
 release();assert.match(String(await result),/database_unavailable/);assert.equal(endedBeforeOtherJob,false);
});
