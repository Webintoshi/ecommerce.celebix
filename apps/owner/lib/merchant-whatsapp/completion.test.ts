import assert from 'node:assert/strict';import test from 'node:test';
import {createMerchantSignupCompletion,createMerchantSessionCompletion} from './completion.ts';
test('signup transfers one deterministic prepared handoff and retains the original session expiry on retry',async()=>{
 const op='12345678-1234-4234-8234-123456789abc',credential='v1.session1.'+Buffer.alloc(32,3).toString('base64url'),calls:any[]=[];let saved:any=null;
 const transfer=createMerchantSignupCompletion({secret:Buffer.alloc(32,4),handoffKeyId:'handoff1',clock:()=>new Date('2026-10-13T10:00:00.000Z'),randomBytes:size=>new Uint8Array(size).fill(5),repository:{async recoverIssuedHandoff(input){calls.push({action:'recover',...input});return saved??{kind:'unauthenticated'};},async issuePreparedHandoff(input){calls.push({action:'issue',...input});saved=Object.freeze({kind:'handoff_issued',credential:input.candidateCredential,destinationOrigin:'https://admin.shop.com',expiresAt:'2026-10-13T10:02:00.000Z'});return saved;}}});
 const input={operationId:op,request:new Request('https://owner.example.com/api/self-serve/register'),completion:{purpose:'signup' as const,sessionId:op,sessionCredential:credential,sessionIssuedAt:'2026-10-13T09:00:00.000Z',sessionExpiresAt:'2026-10-13T17:00:00.000Z',destinationStoreId:op,destinationOrigin:'https://admin.shop.com'}};
 const first=await transfer(input),again=await transfer(input);assert.equal(first.status,200);assert.equal(again.status,200);assert.equal(calls.filter(c=>c.action==='issue').length,1);assert.equal(calls[0].credential,calls.at(-1).credential);assert.equal(calls.find(c=>c.action==='issue').currentCredential,credential);assert.equal(calls.find(c=>c.action==='issue').destinationHostname,'admin.shop.com');assert.match(await first.text(),/action="https:\/\/admin.shop.com\/auth\/handoff"/);assert.equal(first.headers.has('set-cookie'),false);await assert.rejects(transfer({...input,completion:{...input.completion,purpose:'login'}}));
});

test('verified WhatsApp login and signup transfer thirty-day sessions without widening invalid authority',async()=>{
 const issued=new Date('2026-10-13T10:00:00.000Z'),expiry=new Date(issued.getTime()+2592000000),op='12345678-1234-4234-8234-123456789abc';
 for(const purpose of ['signup','login']as const){
  const calls:any[]=[];let saved:any=null;
  const transfer=createMerchantSessionCompletion({secret:Buffer.alloc(32,4),handoffKeyId:'handoff1',allowedPurpose:purpose,clock:()=>issued,randomBytes:size=>new Uint8Array(size).fill(5),repository:{async recoverIssuedHandoff(input){calls.push({action:'recover',...input});return saved??{kind:'unauthenticated'};},async issuePreparedHandoff(input){calls.push({action:'issue',...input});saved={kind:'handoff_issued',credential:input.candidateCredential,destinationOrigin:'https://admin.shop.com',expiresAt:new Date(issued.getTime()+120000).toISOString()};return saved;}}});
  const input={operationId:op,request:new Request('https://owner.example.com/auth/merchant-phone/complete'),completion:{purpose,sessionId:op,sessionCredential:'v1.session1.'+Buffer.alloc(32,3).toString('base64url'),sessionIssuedAt:issued.toISOString(),sessionExpiresAt:expiry.toISOString(),destinationStoreId:op,destinationOrigin:'https://admin.shop.com'}};
  for(const invalidExpiry of [issued.toISOString(),new Date(expiry.getTime()+1).toISOString()])await assert.rejects(transfer({...input,completion:{...input.completion,sessionExpiresAt:invalidExpiry}}));
  assert.equal(calls.length,0,'invalid authority must not create or recover a handoff');
  assert.equal((await transfer(input)).status,200);assert.equal((await transfer(input)).status,200);
  assert.equal(calls.filter(call=>call.action==='issue').length,1,'replay must retain the same handoff');
 }
});
