import test from 'node:test';
import assert from 'node:assert/strict';
import {createMerchantWhatsAppCodec} from './codec.ts';

const operationId='840ebd20-9c5f-4c25-9bc5-97c7fe747fe8';
const browser=Buffer.alloc(32,6).toString('base64url'),host='shop.admin.example.test';
const options={environment:'test',masterKeyId:'adm1',masterKeys:new Map([['adm1',Buffer.alloc(32,1)]]),phoneLookupKeyId:'phone-v1',phoneLookupKey:Buffer.alloc(32,2),recipientRateKey:Buffer.alloc(32,3),sessionKeyId:'session-v1',sessionKeys:new Map([['session-v1',Buffer.alloc(32,4)]])};
const prepare={phone:'+1 (202) 555-0123',operationId,browserCredential:browser,destinationHostname:host,purpose:'login' as const};

test('phone prepare is deterministic for recovery and stores no password or fabricated identity',()=>{
 const codec=createMerchantWhatsAppCodec(options),a=codec.prepare(prepare),b=codec.prepare({...prepare,phone:'+12025550123'});
 assert.deepEqual(a,b);assert.match(a.code,/^[0-9]{6}$/);assert.match(a.command.codeDigest,/^[a-f0-9]{64}$/);
 assert.equal(a.command.phoneKeyId,'phone-v1');assert.equal(a.command.purpose,'login');
 assert.equal(codec.openPhone(a.command.phoneCiphertext,a.command.phoneKeyId,a.command.phoneDigest),'+12025550123');
 assert.equal(JSON.stringify(a.command).includes('+12025550123'),false);
 for(const forbidden of ['principalId','issuer','subject','email','emailVerified','passwordProofDigest'])assert.equal(forbidden in a.command,false);
 assert.equal(codec.codeDigest(a.pending,a.command.challengeId,a.code),a.command.codeDigest);
});

test('phone identity and global rate digest survive encryption master rotation',()=>{
 const one=createMerchantWhatsAppCodec(options),a=one.prepare(prepare);
 const rotated=createMerchantWhatsAppCodec({...options,masterKeyId:'adm2',masterKeys:new Map([...options.masterKeys,['adm2',Buffer.alloc(32,5)]])});
 const b=rotated.prepare(prepare);
 assert.equal(a.command.phoneDigest,b.command.phoneDigest);assert.equal(a.command.recipientBudgetDigest,b.command.recipientBudgetDigest);
 assert.notEqual(a.command.pendingDigest,b.command.pendingDigest);assert.notEqual(a.command.phoneCiphertext,b.command.phoneCiphertext);
 assert.equal(rotated.openPhone(a.command.phoneCiphertext,a.command.phoneKeyId,a.command.phoneDigest),'+12025550123');
});

test('pending credential is sealed to browser environment and exact registered host',()=>{
 const codec=createMerchantWhatsAppCodec(options),a=codec.prepare(prepare);
 assert.deepEqual(codec.openPending(a.cookie,browser,host),a.pending);
 assert.equal(codec.openPending(a.cookie,Buffer.alloc(32,7).toString('base64url'),host),null);
 assert.equal(codec.openPending(a.cookie,browser,'other.admin.example.test'),null);
 assert.equal(createMerchantWhatsAppCodec({...options,environment:'other'}).openPending(a.cookie,browser,host),null);
 const parts=a.cookie.split('.');parts[3]=(parts[3][0]==='A'?'B':'A')+parts[3].slice(1);assert.equal(codec.openPending(parts.join('.'),browser,host),null);
 assert.equal(a.cookie.includes('+12025550123'),false);
});

test('pending and original session material remain recoverable across retained key rotation',()=>{
 const first=createMerchantWhatsAppCodec(options),a=first.prepare(prepare),material=first.session(a.pending,operationId);
 const rotated=createMerchantWhatsAppCodec({...options,masterKeyId:'adm2',masterKeys:new Map([...options.masterKeys,['adm2',Buffer.alloc(32,5)]]),sessionKeyId:'session-v2',sessionKeys:new Map([...options.sessionKeys,['session-v2',Buffer.alloc(32,8)]])});
 const recovered=rotated.openPending(a.cookie,browser,host);
 assert.deepEqual(recovered,a.pending);
 assert.deepEqual(rotated.session(recovered!,operationId),material);
});

test('verification session material is stable per operation and completion cannot cross contexts',()=>{
 const codec=createMerchantWhatsAppCodec(options),a=codec.prepare(prepare),m=codec.session(a.pending,operationId);
 assert.deepEqual(m,codec.session(a.pending,operationId));assert.match(m.sessionCredential,/^v1\.session-v1\.[A-Za-z0-9_-]{43}$/);
 assert.match(m.tokenDigest,/^[a-f0-9]{64}$/);assert.notEqual(m.sessionId,m.familyId);
 assert.equal(codec.openCompletion(m.completionCiphertext,a.pending,operationId)?.sessionCredential,m.sessionCredential);
 assert.equal(codec.openCompletion(m.completionCiphertext,a.pending,'840ebd20-9c5f-4c25-9bc5-97c7fe747fe9'),null);
 assert.equal(codec.codeDigest(a.pending,a.command.challengeId,'001234').length,64);
 assert.throws(()=>codec.codeDigest(a.pending,a.command.challengeId,'1234'));
});

test('lookup rate encryption and session keys must be independently configured',()=>{
 for(const patch of [{phoneLookupKey:Buffer.alloc(32,1)},{recipientRateKey:Buffer.alloc(32,2)},{recipientRateKey:Buffer.alloc(31,3)},{phoneLookupKeyId:'bad.key'},{masterKeyId:'absent'}])assert.throws(()=>createMerchantWhatsAppCodec({...options,...patch}));
 assert.throws(()=>createMerchantWhatsAppCodec(options).prepare({...prepare,phone:'not-a-phone'}));
 assert.throws(()=>createMerchantWhatsAppCodec(options).prepare({...prepare,destinationHostname:'https://evil.example.test'}));
});
