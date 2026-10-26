import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import test from 'node:test';
import {verifyPlatformIyzicoHppWebhook} from './webhook.ts';

const SECRET='only-a-webhook-test-secret';
const ATTEMPT='c66a2e06-3157-43e6-9f6c-fb57c30be94e';
const TOKEN='d00b47f6-627a-43ac-aeb7-e4373d82b67a';
function event(overrides:Record<string,unknown>={}){return{paymentConversationId:ATTEMPT,merchantId:'12345',token:TOKEN,status:'SUCCESS',iyziReferenceCode:'7f9cb9ba-5533-4180-a21b-8fe046963f74',iyziEventType:'CHECKOUT_FORM_AUTH',iyziEventTime:1793016000000,iyziPaymentId:25760123,...overrides};}
function signature(value:Record<string,unknown>,secret=SECRET){return createHmac('sha256',secret).update([secret,value.iyziEventType,value.iyziPaymentId,value.token,value.paymentConversationId,value.status].join('')).digest('hex');}
function verify(value:Record<string,unknown>){return verifyPlatformIyzicoHppWebhook({body:Buffer.from(JSON.stringify(value)),signature:signature(value),secretKey:SECRET});}

test('V3 HPP authenticates official ordered fields and normalizes the attempt trigger',()=>{
 const value=event();assert.deepEqual(verify(value),{attemptId:ATTEMPT,token:TOKEN,paymentId:'25760123',eventType:'CHECKOUT_FORM_AUTH',status:'SUCCESS',eventReference:value.iyziReferenceCode});
 assert.ok(Object.isFrozen(verify(value)));
 assert.deepEqual(verify(event({iyziPaymentId:'25760123',status:'FAILURE'})),{attemptId:ATTEMPT,token:TOKEN,paymentId:'25760123',eventType:'CHECKOUT_FORM_AUTH',status:'FAILURE',eventReference:value.iyziReferenceCode});
});
test('documented scalar variations and unsigned metadata never become payment authority',()=>{
 const value=event({paymentId:'25760123',merchantId:12345,iyziReferenceCode:undefined,additionalProviderMetadata:{approved:true,totalCents:1}});
 assert.deepEqual(verify(value),{attemptId:ATTEMPT,token:TOKEN,paymentId:'25760123',eventType:'CHECKOUT_FORM_AUTH',status:'SUCCESS',eventReference:null});
 const result=verify(value)!;assert.equal('totalCents'in result,false);assert.equal('approved'in result,false);assert.equal('merchantId'in result,false);
 assert.equal(verify(event({paymentId:'25760124'})),null);
});
test('tampering any signed tuple field fails even when the event remains well formed',()=>{
 const value=event(),signed=signature(value);
 for(const change of [{paymentConversationId:'bac47ad6-6bbb-4e43-8e94-5f801d751faa'},{token:'5fcf6356-1a20-4d31-b7c4-41eeb2fbfe87'},{iyziPaymentId:25760124},{status:'FAILURE'},{iyziEventType:'API_AUTH'}]){
  assert.equal(verifyPlatformIyzicoHppWebhook({body:Buffer.from(JSON.stringify({...value,...change})),signature:signed,secretKey:SECRET}),null);
 }
});
test('incorrect, missing, noncanonical and legacy signature values fail closed',()=>{
 const value=event(),body=Buffer.from(JSON.stringify(value)),signed=signature(value);
 for(const proof of [null,'','0'.repeat(64),signed.toUpperCase(),signed.slice(1),' '+signed,signed+', '+signed,Buffer.from(signed,'hex').toString('base64')])assert.equal(verifyPlatformIyzicoHppWebhook({body,signature:proof,secretKey:SECRET}),null);
 for(const secretKey of ['',SECRET+' ',SECRET+'\n','other-test-secret'])assert.equal(verifyPlatformIyzicoHppWebhook({body,signature:signed,secretKey}),null);
});
test('only this Checkout Form terminal event set is accepted despite a valid bank signature',()=>{
 for(const override of [{iyziEventType:'PAYMENT_API'},{iyziEventType:'API_AUTH'},{iyziEventType:'BANK_TRANSFER_AUTH'},{iyziEventType:'subscription.order.success'},{status:'success'},{status:'INIT_THREEDS'},{status:'PENDING_CREDIT'}])assert.equal(verify(event(override)),null);
});
test('ambiguous, imprecise and malformed identifiers cannot select an attempt',()=>{
 for(const override of [{paymentConversationId:ATTEMPT.toUpperCase()},{paymentConversationId:' '+ATTEMPT},{paymentConversationId:'not-an-id'},{token:'short'},{token:TOKEN+'?'},{iyziPaymentId:0},{iyziPaymentId:-1},{iyziPaymentId:1.5},{iyziPaymentId:Number.MAX_SAFE_INTEGER+1},{iyziPaymentId:'025760123'},{iyziPaymentId:'1e6'},{iyziPaymentId:'9223372036854775808'},{iyziPaymentId:null}])assert.equal(verify(event(override)),null,JSON.stringify(override));
 const missing=event();delete (missing as Record<string,unknown>).token;assert.equal(verify(missing),null);
});
test('malformed JSON, duplicate fields, invalid UTF8 and oversized bodies return null without leaking errors',()=>{
 const value=event(),signed=signature(value);
 for(const raw of ['not-json-secret','[]','null',JSON.stringify(value).replace('"status":"SUCCESS"','"status":"FAILURE","status":"SUCCESS"'),JSON.stringify({...value,unused:'x'.repeat(65_536)})])assert.equal(verifyPlatformIyzicoHppWebhook({body:Buffer.from(raw),signature:signed,secretKey:SECRET}),null);
 assert.equal(verifyPlatformIyzicoHppWebhook({body:new Uint8Array([0xff,0xfe]),signature:signed,secretKey:SECRET}),null);
 assert.equal(verifyPlatformIyzicoHppWebhook({body:'not-bytes' as never,signature:signed,secretKey:SECRET}),null);
});
test('HPP signature uses no separators and includes secretKey as both HMAC key and first field',()=>{
 const value=event(),body=Buffer.from(JSON.stringify(value));
 for(const message of [[value.iyziEventType,value.iyziPaymentId,value.token,value.paymentConversationId,value.status].join(''),[SECRET,value.iyziEventType,value.iyziPaymentId,value.token,value.paymentConversationId,value.status].join(':')]){
  const proof=createHmac('sha256',SECRET).update(message).digest('hex');assert.equal(verifyPlatformIyzicoHppWebhook({body,signature:proof,secretKey:SECRET}),null);
 }
 assert.ok(verify(value));
});
