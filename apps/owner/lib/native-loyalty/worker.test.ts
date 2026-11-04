import assert from 'node:assert/strict';
import test from 'node:test';
import {createLoyaltyWorker,loyaltyWorkerDelay} from './worker.ts';
test('loyalty worker is bounded to twenty, uses workflow role and refuses overlapping ticks',async()=>{
 const calls:{sql:string;values?:unknown[]}[]=[];let finish:()=>void=()=>{};const barrier=new Promise<void>(resolve=>{finish=resolve;});let closed=0;
 const pool={async connect(){return{async query(sql:string,values?:unknown[]){calls.push({sql,values});if(sql.includes('loyalty_process_pending_v1')){await barrier;return{rows:[{result:{processed:2,failed:0}}],rowCount:1};}return{rows:[],rowCount:0};},release(){closed++;}};}};
 const worker=createLoyaltyWorker({pool:pool as never,now:()=>new Date('2026-11-04T12:00:00.000Z')});const pending=worker.runOnce();assert.equal(await worker.runOnce(),null);finish();assert.deepEqual(await pending,{processed:2,failed:0});assert.equal(closed,1);assert.ok(calls.some(x=>x.sql==='SET LOCAL ROLE celebix_saas_workflow'));assert.deepEqual(calls.find(x=>x.sql.includes('loyalty_process_pending_v1'))?.values?.slice(1),[20]);
});
test('worker malformed counts roll back; empty and repeated failure delays avoid tight polling',async()=>{
 const calls:string[]=[],pool={async connect(){return{async query(sql:string){calls.push(sql);return sql.includes('loyalty_process_pending_v1')?{rows:[{result:{processed:21,failed:0}}],rowCount:1}:{rows:[],rowCount:0};},release(){}};}};
 await assert.rejects(createLoyaltyWorker({pool:pool as never,now:()=>new Date()}).runOnce(),/loyalty_worker_invalid/);assert.ok(calls.includes('ROLLBACK'));assert.equal(loyaltyWorkerDelay({processed:0,failed:0},0),30_000);assert.equal(loyaltyWorkerDelay({processed:1,failed:0},0),5_000);assert.equal(loyaltyWorkerDelay(null,20),300_000);
});
