import assert from 'node:assert/strict';
import test from 'node:test';
import {isMerchantActionAllowed} from './actions.ts';

test('finance actions belong only to owners and administrators, never broad cashier authority',()=>{
  for(const role of ['store_owner','admin','editor','analyst','cashier'] as const){
    for(const action of ['accounting.read','accounting.manage'] as const){
      assert.equal(isMerchantActionAllowed(role,action as never),role==='store_owner'||role==='admin',`${role}:${action}`);
    }
  }
});
