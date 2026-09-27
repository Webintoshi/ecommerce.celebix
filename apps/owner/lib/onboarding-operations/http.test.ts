import assert from 'node:assert/strict';
import test from 'node:test';
import {createOnboardingOperationsHandler} from './http.ts';
const origin='https://owner.saas-staging.celebix.net';
const path='/api/internal/onboarding/operations';
const post=(body:unknown,headers:HeadersInit={origin,'content-type':'application/json','x-celebix-csrf':'onboarding-operations-v1'})=>new Request(origin+path,{method:'POST',headers,body:JSON.stringify(body)});
test('operations gate super admin before backend; GET has no query authority or secrets',async()=>{
 let calls=0;const handler=createOnboardingOperationsHandler({origin,authorize:async()=>false,resolve:async()=>{calls++;throw new Error('private');},now:()=>new Date()});
 assert.equal((await handler(new Request(origin+path))).status,403);assert.equal(calls,0);
 const allowed=createOnboardingOperationsHandler({origin,authorize:async()=>true,resolve:async()=>({list:async()=>({kind:'ok',data:{workerState:'healthy'}})} as never),now:()=>new Date()});
 assert.equal((await allowed(new Request(origin+path+'?storeId=another'))).status,404);
 const response=await allowed(new Request(origin+path));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('referrer-policy'),'no-referrer');
});
test('retry rejects missing/foreign Origin, missing CSRF, extra input and oversized body',async()=>{
 let calls=0;const handler=createOnboardingOperationsHandler({origin,authorize:async()=>true,resolve:async()=>({retry:async()=>{calls++;return {kind:'queued'};}} as never),now:()=>new Date()});
 const command={jobId:'job-1',expectedVersion:3};
 for(const headers of [{'content-type':'application/json','x-celebix-csrf':'onboarding-operations-v1'},{origin:'https://hostile.invalid','content-type':'application/json','x-celebix-csrf':'onboarding-operations-v1'},{origin,'content-type':'application/json'}] as HeadersInit[])assert.equal((await handler(post(command,headers))).status,403);
 assert.equal((await handler(post({...command,storeId:'another'}))).status,400);
 assert.equal((await handler(post({...command,jobId:'a'.repeat(2048)}))).status,413);
 assert.equal(calls,0);
 assert.equal((await handler(post(command))).status,202);assert.equal(calls,1);
 let cancelled=false;
 const body=new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(600));},cancel(){cancelled=true;}});
 const streamed=new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json','x-celebix-csrf':'onboarding-operations-v1'},body,duplex:'half'} as RequestInit);
 assert.equal((await handler(streamed)).status,413);assert.equal(cancelled,true);assert.equal(calls,1);
});
test('busy and version conflicts are bounded409; raw failures never leave the handler',async()=>{
 for(const kind of ['busy','conflict'] as const){const handler=createOnboardingOperationsHandler({origin,authorize:async()=>true,resolve:async()=>({retry:async()=>({kind})} as never),now:()=>new Date()});assert.equal((await handler(post({jobId:'job-1',expectedVersion:3}))).status,409);}
 const handler=createOnboardingOperationsHandler({origin,authorize:async()=>{throw new Error('password private');},resolve:async()=>null,now:()=>new Date()});
 const response=await handler(new Request(origin+path));assert.equal(response.status,503);assert.equal((await response.text()).includes('password'),false);
});
