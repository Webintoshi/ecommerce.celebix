import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as validation from './validation.ts';
test('rejects unknown command keys and plaintext secrets before persistence',()=>{
 const parse=(validation as Record<string,unknown>).parseAdminLoginSecurityCommand;
 assert.equal(typeof parse,'function');
 assert.throws(()=> (parse as Function)({action:'read',input:{pendingId:'bad',phone:'+905550000000',otp:'123456'}}));
});
test('accepts digest-only bound commands and rejects added bearer plaintext',()=>{
 const binding={pendingId:'11111111-1111-4111-8111-111111111111',pendingDigest:'a'.repeat(64),browserDigest:'b'.repeat(64),environment:'test'};
 assert.deepEqual(validation.parseAdminLoginSecurityCommand({action:'read',input:binding}),{action:'read',input:binding});
 for(const injected of [{otp:'123456'},{phone:'+905550000000'},{principalId:'11111111-1111-4111-8111-111111111111'},{pendingDigest:null},{environment:'test\nattack'}])assert.throws(()=>validation.parseAdminLoginSecurityCommand({action:'read',input:{...binding,...injected}}));
});
test('backup login rejects trust minting and backup replacement requires ten distinct digests',()=>{
 const input={pendingId:'11111111-1111-4111-8111-111111111111',pendingDigest:'a'.repeat(64),browserDigest:'b'.repeat(64),environment:'test',operationId:'22222222-2222-4222-8222-222222222222',sessionId:'33333333-3333-4333-8333-333333333333',familyId:'44444444-4444-4444-8444-444444444444',tokenKeyId:'k1',tokenDigest:'c'.repeat(64),backupDigest:'d'.repeat(64)};
 validation.parseAdminLoginSecurityCommand({action:'verify_backup',input});
 assert.throws(()=>validation.parseAdminLoginSecurityCommand({action:'verify_backup',input:{...input,rememberTrustDigest:'e'.repeat(64)}}));
 assert.throws(()=>validation.parseAdminLoginSecurityCommand({action:'regenerate_backups',input:{pendingId:input.pendingId,pendingDigest:input.pendingDigest,browserDigest:input.browserDigest,environment:'test',operationId:input.operationId,backupDigests:Array(10).fill('f'.repeat(64))}}));
});

test('security state accepts a bounded canonical destination hostname',()=>{const input={tokenKeyId:'k1',tokenDigest:'a'.repeat(64),destinationHostname:'admin.example.test'};assert.deepEqual(validation.parseAdminLoginSecurityCommand({action:'security_state',input}),{action:'security_state',input});for(const destinationHostname of ['https://admin.example.test','ADMIN.example.test','admin.example.test/'])assert.throws(()=>validation.parseAdminLoginSecurityCommand({action:'security_state',input:{...input,destinationHostname}}));});


test('management operations and forget require immutable operation binding and ciphertext-only completion',()=>{
 const input={tokenKeyId:'k1',tokenDigest:'a'.repeat(64),operationId:'11111111-1111-4111-8111-111111111111'};
 assert.throws(()=>validation.parseAdminLoginSecurityCommand({action:'forget_devices',input:{tokenKeyId:input.tokenKeyId,tokenDigest:input.tokenDigest}}));
 validation.parseAdminLoginSecurityCommand({action:'forget_devices',input});
 const management={...input,purpose:'manage',destinationHostname:'admin.example.test',environment:'test',browserDigest:'b'.repeat(64)};
 for(const action of ['prepare_management','read_management'])assert.deepEqual(validation.parseAdminLoginSecurityCommand({action,input:management}),{action,input:management});
 validation.parseAdminLoginSecurityCommand({action:'finish_management',input:{...management,completionCiphertext:'encrypted.bridge'}});
 for(const added of [{authorizationUrl:'https://id.test?secret=x'},{purpose:'login'},{browserDigest:'raw-browser'}])assert.throws(()=>validation.parseAdminLoginSecurityCommand({action:'prepare_management',input:{...management,...added}}));
 assert.throws(()=>validation.parseAdminLoginSecurityCommand({action:'finish_management',input:management}));
});
