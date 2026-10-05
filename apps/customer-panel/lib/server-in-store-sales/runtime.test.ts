import assert from 'node:assert/strict';
import test from 'node:test';
import type {InStoreSalesRepository} from '@celebix/saas-data';
import type {ServerPanelAccessRuntime} from '../server-panel-access/runtime.ts';
import {registerServerInStoreSalesRepository,resolveServerInStoreSalesRuntime} from './runtime.ts';
function access():ServerPanelAccessRuntime{return {readiness:{mode:'approved_staging'},panelOrigin:'https://panel.example.test',resolveCredential:async()=>({kind:'unauthenticated'}),rotateCredential:async()=>({kind:'unavailable'}),revokeCredential:async()=>({kind:'unavailable'})};}
function repository() {return Object.fromEntries(['searchCustomers','createCustomer','bootstrap','searchProducts','listSales','getSale','getOperation','createSale','updateSale','holdSale','prepareSale','confirmPayment','completeSale','cancelSale','takeoverSale','listStaff','setStaffGrant'].map(method=>[method,async()=>({})])) as unknown as InStoreSalesRepository;}
test('register resolve and call preserves new discard binding with no pool exposure',async()=>{
 const a=access();const marker={private:true};const r={...repository(),pool:marker,async discardSale(this:{pool:unknown}){assert.equal(this.pool,marker);return {sale:{status:'cancelled'}};}} as unknown as InStoreSalesRepository;
 registerServerInStoreSalesRepository(a,r);const resolved=resolveServerInStoreSalesRuntime(a);assert.ok(resolved);
 assert.equal('pool' in resolved.sales,false);assert.equal(Object.isFrozen(resolved.sales),true);
 assert.equal((await resolved.sales.discardSale({} as never)).sale.status,'cancelled');
 assert.equal(resolveServerInStoreSalesRuntime(access()),null);
});
test('legacy registration keeps required methods and incomplete registration fails closed',()=>{
 const a=access();registerServerInStoreSalesRepository(a,repository());assert.equal(typeof resolveServerInStoreSalesRuntime(a)?.sales.cancelSale,'function');
 assert.throws(()=>registerServerInStoreSalesRepository(access(),{} as InStoreSalesRepository));
 assert.throws(()=>registerServerInStoreSalesRepository(a,repository()));
});
