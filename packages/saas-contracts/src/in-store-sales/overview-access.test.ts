import assert from 'node:assert/strict';
import test from 'node:test';
import * as contracts from './index.ts';
const ID='26200000-0000-4000-8000-000000000001';
const v7={membershipId:ID,label:'Kasiyer',role:'cashier',enabled:true,locationIds:[ID],discountLimitBps:0,version:1,canEditPrice:false,canSellOnCredit:false,canCollectReceivables:false,canManageAccounting:false,commissionEnabled:false,commissionRateBps:0,canManageOrders:true};
test('staff eight requires an independent overview boolean while seven stays exact',()=>{
 for(const canViewOverview of[false,true]){const value={...v7,canViewOverview};assert.deepEqual(contracts.parseInStoreStaffGrant(value,8 as never),value);assert.ok(Object.isFrozen(contracts.parseInStoreStaffGrant(value,8 as never)));}
 for(const value of[v7,{...v7,canViewOverview:1},{...v7,canViewOverview:true,storeId:ID}])assert.throws(()=>contracts.parseInStoreStaffGrant(value,8 as never));
 assert.deepEqual(contracts.parseInStoreStaffGrant(v7,7),v7);assert.throws(()=>contracts.parseInStoreStaffGrant({...v7,canViewOverview:true},7));
});
test('overview access exposes only the exact server boolean without executing accessors',()=>{
 const parse=(contracts as unknown as {parseOverviewAccess:(value:unknown)=>unknown}).parseOverviewAccess;
 assert.equal(typeof parse,'function');
 for(const canViewOverview of[false,true]){assert.deepEqual(parse({canViewOverview}),{canViewOverview});assert.ok(Object.isFrozen(parse({canViewOverview})));}
 let reads=0;for(const value of[{},null,{canViewOverview:1},{canViewOverview:true,canManageOrders:true},{get canViewOverview(){reads++;return true;}}])assert.throws(()=>parse(value));assert.equal(reads,0);
});
