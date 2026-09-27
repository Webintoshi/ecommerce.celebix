import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import test from 'node:test';
async function load(){try{return await import('./onboarding-supervisor.cjs');}catch{assert.fail('worker supervisor missing');}}
test('worker crash restarts with bounded backoff and shutdown kills child and cancels restart',async()=>{
 const {superviseOnboardingWorker}=await load();const children=[];const waits=[];let pending;
 const controller=superviseOnboardingWorker({spawn:()=>{const child=new EventEmitter();child.kill=signal=>child.killed=signal;children.push(child);return child;},schedule:(fn,ms)=>{waits.push(ms);pending=fn;return 7;},cancel:()=>{pending=undefined;},log:()=>{}});
 for(let i=0;i<9;i++){children.at(-1).emit('exit',1,null);const fire=pending;pending=undefined;fire();}
 assert.equal(waits[0],1000);assert.equal(waits.at(-1),30000);
 controller.stop();assert.equal(children.at(-1).killed,'SIGTERM');assert.equal(pending,undefined);
});
test('spawn failure stays degraded and schedules retry',async()=>{
 const {superviseOnboardingWorker}=await load();let retries=0;
 const controller=superviseOnboardingWorker({spawn:()=>{throw new Error('private');},schedule:()=>{retries++;return 1;},cancel:()=>{},log:()=>{}});
 assert.equal(retries,1);controller.stop();
});
