import assert from 'node:assert/strict';
import test from 'node:test';
import type {TenantContext} from '@celebix/saas-contracts';
import type {InStoreSalesRepository} from '@celebix/saas-data';
import type {ServerPanelAccessRuntime} from '../server-panel-access/runtime.ts';
import {registerServerInStoreSalesRepository} from '../server-in-store-sales/runtime.ts';
import {readOverviewAccess} from './permission.ts';

function access():ServerPanelAccessRuntime{return{readiness:{mode:'approved_staging'},panelOrigin:'https://panel.example.test',resolveCredential:async()=>({kind:'unauthenticated'}),rotateCredential:async()=>({kind:'unavailable'}),revokeCredential:async()=>({kind:'unavailable'})};}
function register(a:ServerPanelAccessRuntime,read?:()=>Promise<unknown>){
 const methods=['searchCustomers','createCustomer','bootstrap','searchProducts','listSales','getSale','getOperation','createSale','updateSale','holdSale','prepareSale','confirmPayment','completeSale','cancelSale','takeoverSale','listStaff','setStaffGrant'];
 registerServerInStoreSalesRepository(a,{...Object.fromEntries(methods.map(method=>[method,async()=>({})])),...(read?{getOverviewAccess:read}:{})} as unknown as InStoreSalesRepository);
}
const context={membership:{role:'cashier'}} as TenantContext,NOW=new Date('2026-10-22T12:00:00Z');
test('fresh Overview authority observes a revoked grant on the next read',async()=>{
 const a=access();let granted=true,reads=0;register(a,async()=>{reads++;return{canViewOverview:granted};});
 assert.deepEqual(await readOverviewAccess(context,a,NOW),{canViewOverview:true});granted=false;
 assert.deepEqual(await readOverviewAccess(context,a,NOW),{canViewOverview:false});assert.equal(reads,2);
});
test('legacy unavailable and malformed Overview readers fail closed without evaluating accessors',async()=>{
 let evaluated=false;
 for(const value of [undefined,null,{},[],{canViewOverview:'true'},{canViewOverview:true,storeId:'forged'},{get canViewOverview(){evaluated=true;return true;}},new Error('private')]){
  const a=access();register(a,value===undefined?undefined:async()=>{if(value instanceof Error)throw value;return value;});
  assert.deepEqual(await readOverviewAccess(context,a,NOW),{canViewOverview:false});
 }
 assert.equal(evaluated,false);assert.deepEqual(await readOverviewAccess(context,access(),NOW),{canViewOverview:false});
});
test('ordinary panel roles retain existing Overview access without a delegated cashier read',async()=>{
 const a=access();register(a,async()=>{throw Error('must not query');});
 for(const role of ['store_owner','admin','editor','analyst'])assert.deepEqual(await readOverviewAccess({membership:{role}} as TenantContext,a,NOW),{canViewOverview:true});
});
