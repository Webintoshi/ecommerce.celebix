import assert from 'node:assert/strict';
import test from 'node:test';
import {createMerchantWhatsAppCodec} from './codec.ts';
import {createOwnerMerchantWhatsAppService} from './service.ts';
import {parseMerchantWhatsAppCommand} from '../../../../packages/saas-contracts/src/merchant-whatsapp/validation.ts';
import type {MerchantWhatsAppResult} from '../../../../packages/saas-contracts/src/merchant-whatsapp/types.ts';
const key=Buffer.alloc(32,4),credential='v1.session1.'+Buffer.alloc(32,7).toString('base64url');
const input={schemaVersion:1 as const,action:'staff_delete' as const,purpose:'login' as const,hostname:'shop.admin.example.com',sessionCredential:credential,operationId:'11111111-1111-4111-8111-111111111111',payload:{staffId:'22222222-2222-4222-8222-222222222222',expectedVersion:4}};
function fixture(outcome:MerchantWhatsAppResult['outcome']='deleted'){
 const calls:any[]=[];const codec=createMerchantWhatsAppCodec({environment:'staging',masterKeyId:'master-v1',masterKeys:new Map([['master-v1',Buffer.alloc(32,1)]]),phoneLookupKeyId:'phone-v1',phoneLookupKey:Buffer.alloc(32,2),recipientRateKey:Buffer.alloc(32,3),sessionKeyId:'session1',sessionKeys:new Map([['session1',key]])});
 const service=createOwnerMerchantWhatsAppService({codec,repository:{async command(command){calls.push(parseMerchantWhatsAppCommand(command));return{outcome,authority:['deleted','operation_replayed'].includes(outcome)?{version:1,staff:[]}:null};}},recipientRateKey:Buffer.alloc(32,3),sessionKeys:new Map([['session1',key]]),clock:()=>new Date('2026-10-15T00:00:00Z'),delivery:async()=>{throw Error('deletion_must_not_send');}});return{calls,service};
}
test('delete calls native directly so removed-row durable replay remains recoverable',async()=>{for(const outcome of ['deleted','operation_replayed'] as const){const f=fixture(outcome),r=await f.service.command(input);assert.equal(r.code,'ok');assert.deepEqual(r.state,{version:1,staff:[],enabled:true});assert.equal(f.calls.length,1);assert.equal(f.calls[0].action,'staff_delete');assert.deepEqual(Object.keys(f.calls[0].input).sort(),['actorTokenDigest','actorTokenKeyId','expectedVersion','operationId','staffId']);assert.equal(f.calls[0].input.actorTokenKeyId,'session1');assert.match(f.calls[0].input.actorTokenDigest,/^[a-f0-9]{64}$/);}});
test('delete rejects extra payload and missing actor before repository access',async()=>{for(const changes of [{payload:{...input.payload,enabled:false}},{sessionCredential:undefined}]){const f=fixture();assert.equal((await f.service.command({...input,...changes})).code,'unavailable');assert.equal(f.calls.length,0);}});
test('native deletion failure codes preserve their public meaning',async()=>{for(const [outcome,code] of [['staff_not_disabled','staff_not_disabled'],['version_conflict','version_conflict'],['owner_required','unauthorized']] as const){const f=fixture(outcome);assert.equal((await f.service.command(input)).code,code);}});
