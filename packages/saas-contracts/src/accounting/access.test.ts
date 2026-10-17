import assert from 'node:assert/strict';
import test from 'node:test';
import * as accounting from './index.ts';
import {parseInStoreStaffGrant} from '../in-store-sales/index.ts';
const ID='11111111-1111-4111-8111-111111111111';
test('accounting access is a strict immutable pair of independent durable grants',()=>{
 const parse=(accounting as any).parseAccountingAccess;assert.equal(typeof parse,'function');
 for(const canManageAccounting of[false,true])for(const canCollectReceivables of[false,true]){const value={canManageAccounting,canCollectReceivables};assert.deepEqual(parse(value),value);assert.ok(Object.isFrozen(parse(value)));}
 let invoked=0;for(const invalid of[{canManageAccounting:true},{canManageAccounting:1,canCollectReceivables:false},{canManageAccounting:true,canCollectReceivables:false,role:'admin'},{get canManageAccounting(){invoked++;return true;},canCollectReceivables:false}])assert.throws(()=>parse(invalid));assert.equal(invoked,0);
});
test('staff version five requires the new boolean and older staff projections cannot receive it',()=>{
 const v4={membershipId:ID,label:'Kasiyer',role:'cashier',enabled:true,locationIds:[ID],discountLimitBps:0,version:1,canEditPrice:false,canSellOnCredit:false,canCollectReceivables:true};
 for(const canManageAccounting of[false,true])assert.equal(parseInStoreStaffGrant({...v4,canManageAccounting},5 as never).canManageAccounting,canManageAccounting);
 assert.throws(()=>parseInStoreStaffGrant(v4,5 as never));assert.throws(()=>parseInStoreStaffGrant({...v4,canManageAccounting:'true'},5 as never));assert.throws(()=>parseInStoreStaffGrant({...v4,canManageAccounting:true},4));assert.deepEqual(parseInStoreStaffGrant(v4,4),v4);
});
