import assert from 'node:assert/strict';
import test from 'node:test';
import {parseInStoreStaffGrant} from './index.ts';
const ID='25900000-0000-4000-8000-000000000001';
const v6={membershipId:ID,label:'Kasiyer',role:'cashier',enabled:true,locationIds:[ID],discountLimitBps:0,version:1,canEditPrice:false,canSellOnCredit:false,canCollectReceivables:false,canManageAccounting:false,commissionEnabled:false,commissionRateBps:0};
test('staff seven requires an explicit orders grant without changing older projections',()=>{
 for(const canManageOrders of [false,true]){const value={...v6,canManageOrders};assert.deepEqual(parseInStoreStaffGrant(value,7 as never),value);assert.ok(Object.isFrozen(parseInStoreStaffGrant(value,7 as never)));}
 for(const value of [v6,{...v6,canManageOrders:1},{...v6,canManageOrders:true,storeId:ID}])assert.throws(()=>parseInStoreStaffGrant(value,7 as never));
 assert.deepEqual(parseInStoreStaffGrant(v6,6),v6);assert.throws(()=>parseInStoreStaffGrant({...v6,canManageOrders:true},6));
});
