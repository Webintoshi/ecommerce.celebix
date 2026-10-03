import test from 'node:test';
import assert from 'node:assert/strict';
import {createInvitationService} from './service.ts';
import {createAes256GcmPayloadCipher} from '../saas-persistence/identity-crypto.ts';
import {createInvitationTransport} from '../../../../packages/saas-data/src/platform-invitations/transport.ts';
import type {OidcAuthorizationRequest,OidcProviderCallbackInput} from '../self-serve-oidc.ts';
function fixture(){
 const clock=()=>new Date('2026-10-04T00:00:00Z'),codec=createInvitationTransport({key:Buffer.alloc(32,8),keyId:'fixture',clock});
 const calls:{name:string;values:unknown[]}[]=[];let saved:unknown[]=[];let count=0;let completed=false;let unverified=false;
 const service=createInvitationService({issuer:'https://identity.example.test/',audience:'common-admin',callbackUrl:'https://panel.example.test/auth/callback',clock,seal:codec.seal,
 cipher:createAes256GcmPayloadCipher({currentKeyId:'fixture',resolveKey:()=>Buffer.alloc(32,9)}),
 provider:{buildAuthorizationUrl(input:OidcAuthorizationRequest){const url=new URL('https://identity.example.test/oidc/auth');url.searchParams.set('state',input.state);url.searchParams.set('redirect_uri',input.redirectUri);url.searchParams.set('code_challenge',input.codeChallenge);return url;},async verifyCallback(input:OidcProviderCallbackInput){count++;return {issuer:input.expectedIssuer,subject:'new-verified-identity',audience:[input.expectedAudience],nonce:input.expectedNonce,email:'invited@example.test',emailVerified:!unverified};}},
 repository:{async execute(name,values){calls.push({name,values});if(name==='start'){saved=values;return {id:values[0]};}if(name==='claim'){if(completed)return {outcome:'replayed',result:{storeId:'existing-store',redirectUrl:'https://shop.admin.example.test/invitations/accepted'}};return {outcome:'claimed',id:saved[0],encryptedPayload:JSON.parse(String(saved[5]))};}completed=true;return {outcome:'committed',result:{storeId:'existing-store',redirectUrl:'https://shop.admin.example.test/invitations/accepted'}};}}
 });
 return {service,codec,calls,count:()=>count,unverified(){unverified=true;}};
}
test('invitation flow preserves PKCE and encrypts nonce/verifier; completed callback replay never re-exchanges code',async()=>{
 const f=fixture(),started=await f.service.start('a'.repeat(72),'shop.admin.example.test');
 const bootstrap=f.codec.open(started.ticket,'https://panel.example.test');const state=new URL(bootstrap.authorizationUrl).searchParams.get('state')!;
 assert.match(state,/^inv_[A-Za-z0-9_-]{43}$/);assert.match(String(f.calls[0].values[3]),/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(f.calls[0].values).includes(bootstrap.binding),false);
 const encrypted=JSON.parse(String(f.calls[0].values[5]));assert.deepEqual(Object.keys(encrypted).sort(),['ciphertext','iv','keyId']);
 const result=await f.service.complete(state,'verified-code',bootstrap.binding);assert.equal(result.outcome,'committed');assert.equal(f.count(),1);
 assert.deepEqual(f.calls[2],{name:'complete',values:[f.calls[0].values[0],'https://identity.example.test/','new-verified-identity','invited@example.test',true]});
 assert.equal((await f.service.complete(state,'same-code',bootstrap.binding)).outcome,'replayed');assert.equal(f.count(),1);
 assert.deepEqual([...new Set(f.calls.map(c=>c.name))],['start','claim','complete']);
});
test('unverified provider identity and absent browser binding cannot accept an invitation',async()=>{
 const f=fixture();f.unverified();const started=await f.service.start('a'.repeat(72),'shop.admin.example.test');const b=f.codec.open(started.ticket,'https://panel.example.test');const state=new URL(b.authorizationUrl).searchParams.get('state')!;
 await assert.rejects(()=>f.service.complete(state,'code',b.binding),/invitation_denied/);assert.equal(f.calls.some(c=>c.name==='complete'),false);
 await assert.rejects(()=>f.service.complete(state,'code',''),/invitation_denied/);
});
