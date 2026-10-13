import assert from 'node:assert/strict';
import test from 'node:test';
import {createInvitationInternalHandler} from './http.ts';
import {createInvitationTransport,INVITATION_INTERNAL_PATH} from '../../../../packages/saas-data/src/platform-invitations/transport.ts';
const ownerOrigin='https://owner.example.test',clock=()=>new Date('2026-10-13T04:00:00Z');
const transport=createInvitationTransport({key:new Uint8Array(32).fill(42),keyId:'test-key',clock});
function fixture(){const calls:unknown[]=[];const handler=createInvitationInternalHandler(async()=>({ownerOrigin,transport,service:{async start(...args:unknown[]){calls.push(args);return {ok:true};},async complete(...args:unknown[]){calls.push(args);return {ok:true};}} as never}));return {handler,calls};}
function proxied(action:Record<string,unknown>,host='owner.example.test',protocol='https:'){
 const signed=transport.sign(ownerOrigin+INVITATION_INTERNAL_PATH,action);signed.headers.set('host',host);
 return new Request(`${protocol}//localhost:3100${INVITATION_INTERNAL_PATH}`,signed);
}
test('signed start and complete preserve canonical Host behind internal HTTPS proxy',async()=>{
 for(const body of [{action:'start',adminHost:'qa.admin.example.test',token:'test-invitation-token'},{action:'complete',binding:'test-binding',code:'test-code',state:'test-state'}]){
  const f=fixture();const r=await f.handler(proxied(body));assert.equal(r.status,200);assert.equal(f.calls.length,1);assert.equal(r.headers.get('cache-control'),'no-store');
 }
 const http=fixture();assert.equal((await http.handler(proxied({action:'start',adminHost:'qa.admin.example.test',token:'test-invitation-token'},'owner.example.test','http:'))).status,200);assert.equal(http.calls.length,1);
});
test('wrong or missing public Host, unsigned payload and wrong path cannot reach invitation service',async()=>{
 const body={action:'start',adminHost:'qa.admin.example.test',token:'test-invitation-token'};
 const wrongHost=proxied(body,'attacker.example.test'),missingHost=proxied(body);missingHost.headers.delete('host');
 const unsigned=proxied(body);unsigned.headers.delete('x-celebix-invitation-signature');
 const signed=proxied(body),wrongPath=new Request('https://localhost:3100/api/internal/wrong',signed);
 for(const request of [wrongHost,missingHost,unsigned,wrongPath]){const f=fixture();assert.equal((await f.handler(request)).status,403);assert.equal(f.calls.length,0);}
});
