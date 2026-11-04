import assert from 'node:assert/strict';
import test from 'node:test';
import {approvalTokenFromScan} from './loyalty-scanner.ts';
test('scanner accepts only full entropy Celebix approvals, never arbitrary links or short numbers',()=>{
 const token='a'.repeat(64);assert.equal(approvalTokenFromScan(`celebix-loyalty:${token}`),token);assert.equal(approvalTokenFromScan(token),token);
 for(const value of['123456','https://example.test/'+token,'celebix-loyalty:'+token+'a','celebix-loyalty:'+token.toUpperCase()])assert.equal(approvalTokenFromScan(value),null);
});
