import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePlatformMutation } from './validation.ts';
test('requires explicit version, recognized command and bounded retry key',()=>{
 const body={action:'billing.receipt.record',payload:{storeId:'00000000-0000-4000-8000-000000000001',amountCents:500000},expectedVersion:1};
 assert.equal(parsePlatformMutation(body,'stable-key-123').expectedVersion,1);
 for(const value of [{...body,expectedVersion:undefined},{...body,expectedVersion:-1},{...body,action:'registry.grant'},{...body,payload:[]}]) assert.throws(()=>parsePlatformMutation(value,'stable-key-123'));
 assert.throws(()=>parsePlatformMutation(body,null));
 assert.throws(()=>parsePlatformMutation(body,'bad\nkey'));
});
