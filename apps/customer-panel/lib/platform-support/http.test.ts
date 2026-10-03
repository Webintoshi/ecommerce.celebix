import assert from 'node:assert/strict';
import test from 'node:test';
import {supportHttpHandlers} from './http.ts';
import {supportRedemptionCredential} from './credential.ts';
const host='admin.example.test',token='a'.repeat(64),credential='b'.repeat(64);
function request(path:string,origin=`https://${host}`,extra:Record<string,string>={}){return new Request(`http://127.0.0.1:3000/api/support/${path}`,{method:'POST',headers:{host,origin,'Content-Type':'application/json',...extra},body:JSON.stringify({handoff:token})});}
test('HTTPS support redemption uses public Host behind an HTTP reverse proxy',async()=>{
 const calls:unknown[]=[];const handlers=supportHttpHandlers(async(action,values)=>{calls.push([action,values]);return {credential,expiresAt:new Date(Date.now()+600_000).toISOString()};},()=>credential);
 const response=await handlers.redeemSupport(request('redeem'));
 assert.equal(response.status,200);assert.deepEqual(calls,[['redeem',[token,host,credential]]]);assert.deepEqual(await response.json(),{ok:true});
 assert.match(response.headers.get('Set-Cookie')??'',new RegExp(`^__Host-celebix_support=${credential};`));assert.match(response.headers.get('Set-Cookie')??'',/HttpOnly; Secure; SameSite=Strict/);
});
test('support CSRF rejects foreign, missing and internal origins before database access',async()=>{
 let calls=0;const handlers=supportHttpHandlers(async()=>{calls++;throw Error('unexpected database call');});
 for(const origin of ['https://foreign.example.test','http://127.0.0.1:3000','http://admin.example.test','']){
  assert.equal((await handlers.redeemSupport(request('redeem',origin,{'X-Forwarded-Host':'foreign.example.test'}))).status,403);
  assert.equal((await handlers.endSupport(request('end',origin,{'Cookie':`__Host-celebix_support=${credential}`}))).status,403);
 }
 assert.equal(calls,0);
});
test('ending support behind the proxy binds native revocation to the public host and clears only support',async()=>{
 const calls:unknown[]=[];const handlers=supportHttpHandlers(async(action,values)=>{calls.push([action,values]);return {ok:true};},()=>credential);
 const response=await handlers.endSupport(request('end',`https://${host}`,{'Cookie':`__Host-celebix_panel=normal; __Host-celebix_support=${credential}`}));
 assert.equal(response.status,200);assert.deepEqual(calls,[['end',[credential,host]]]);assert.match(response.headers.get('Set-Cookie')??'',/^__Host-celebix_support=; Path=\/; Max-Age=0;/);assert.doesNotMatch(response.headers.get('Set-Cookie')??'',/__Host-celebix_panel/);
});
test('a lost redemption response retries the same server credential and recovers its cookie',async()=>{
 const key=Buffer.alloc(32,7).toString('base64url'),calls:unknown[]=[];let committed=false;
 const derive=(handoff:string,hostname:string)=>supportRedemptionCredential(handoff,hostname,key);
 const handlers=supportHttpHandlers(async(action,values)=>{calls.push([action,values]);if(!committed){committed=true;throw Error('commit response lost');}return {credential:values[2],expiresAt:new Date(Date.now()+600_000).toISOString()};},derive);
 assert.equal((await handlers.redeemSupport(request('redeem'))).status,503);
 const recovered=await handlers.redeemSupport(request('redeem'));assert.equal(recovered.status,200);assert.deepEqual(calls[0],calls[1]);assert.match(recovered.headers.get('Set-Cookie')??'',new RegExp(`^__Host-celebix_support=${derive(token,host)};`));
 assert.notEqual(derive(token,host),supportRedemptionCredential(token,'foreign.example.test',key));assert.notEqual(derive(token,host),supportRedemptionCredential('c'.repeat(64),host,key));
 for(const invalid of ['',Buffer.alloc(31).toString('base64url'),Buffer.alloc(33).toString('base64url')])assert.throws(()=>supportRedemptionCredential(token,host,invalid));
});
