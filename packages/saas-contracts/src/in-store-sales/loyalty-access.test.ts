import assert from 'node:assert/strict';
import test from 'node:test';
import {parseInStoreStaffGrant} from './index.ts';
const ID='50200000-0000-4000-8000-000000000001';
const old={membershipId:ID,label:'Kasiyer',role:'cashier',enabled:true,locationIds:[ID],discountLimitBps:0,version:1,canEditPrice:false,canSellOnCredit:false,canCollectReceivables:false,canManageAccounting:false,commissionEnabled:false,commissionRateBps:0,canManageOrders:false,canViewOverview:false};
test('staff version nine requires an explicit loyalty permission while older contracts stay exact',()=>{
 for(const canManageLoyalty of [true,false])assert.deepEqual(parseInStoreStaffGrant({...old,canManageLoyalty},9 as never),{...old,canManageLoyalty});
 assert.throws(()=>parseInStoreStaffGrant(old,9 as never));assert.throws(()=>parseInStoreStaffGrant({...old,canManageLoyalty:'yes'},9 as never));assert.throws(()=>parseInStoreStaffGrant({...old,canManageLoyalty:true},8));assert.deepEqual(parseInStoreStaffGrant(old,8),old);
});
