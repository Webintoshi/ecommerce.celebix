import assert from 'node:assert/strict';
import test from 'node:test';
import {createAccountLoyaltyRoutes} from './loyalty-route.ts';
const id='6e000000-0000-4000-8000-000000000001',csrf='c'.repeat(43),host='shop.example.test';
function request(overrides:Record<string,string>={}){return new Request(`https://${host}/api/account/loyalty`,{method:'POST',headers:{origin:`https://${host}`,'content-type':'application/json','x-celebix-account-csrf':csrf,cookie:`__Host-celebix_account_csrf=${csrf}`,...overrides},body:JSON.stringify({action:'prepare-reward',operationId:id,payload:{rewardId:id}})});}
test('loyalty reward mutations require same origin and an unambiguous account CSRF token',async()=>{
 let calls=0;const routes=createAccountLoyaltyRoutes({selectAuthority:()=>({kind:'trusted',hostname:host}),resolveRuntime:async()=>({command:async()=>{calls++;return{};}})as never});
 assert.equal((await routes.POST(request({origin:'https://other.test'}))).status,400);
 assert.equal((await routes.POST(request({'x-celebix-account-csrf':'wrong'}))).status,403);
 assert.equal((await routes.POST(request({cookie:`__Host-celebix_account_csrf=${csrf}; __Host-celebix_account_csrf=${csrf}`}))).status,403);
 assert.equal(calls,0);
});
test('a prepared reward response retains its stable operation and never caches private account data',async()=>{
 const value={operationId:id,rewardId:id,code:`L-${'a'.repeat(32)}`,reward:{kind:'discount',amountMinor:15000},expiresAt:null,giftProductId:null};
 const routes=createAccountLoyaltyRoutes({selectAuthority:()=>({kind:'trusted',hostname:host}),resolveRuntime:async()=>({command:async()=>value})as never});
 const response=await routes.POST(request());assert.equal(response.status,200);assert.deepEqual(await response.json(),value);assert.equal(response.headers.get('cache-control'),'no-store');
});
