import assert from 'node:assert/strict';
import test from 'node:test';
import type {TenantContext} from '@celebix/saas-contracts';
import {PostgresLoyaltyRepository,PostgresLoyaltyCustomerRepository} from './repository.ts';
const ID='50200000-0000-4000-8000-000000000001',NOW=new Date('2026-11-04T12:00:00.000Z');
const context={schemaVersion:1,requestId:ID,principal:{id:ID,issuer:'https://identity.test',subject:'loyalty'},store:{id:ID,slug:'atlas',status:'active'},membership:{id:ID,role:'store_owner',status:'active'},entitlements:{schemaVersion:1,planId:ID,planCode:'growth',version:2,status:'active',features:['promotions'],limits:{products:100,staff:5,storageBytes:1024},validFrom:'2026-01-01T00:00:00.000Z'},locale:'tr-TR'} as TenantContext;
const options={role:'celebix_saas_app' as const,timeouts:{poolCheckoutMs:1000,statementMs:1000,lockMs:1000,idleTransactionMs:1000}};
function fixture(responses:unknown[],failCommit=false){const calls:{text:string;values?:unknown[]}[]=[];let connection=0;return{calls,pool:{async connect(){const n=connection++;return{async query(text:string,values?:unknown[]){calls.push({text,values});if(text==='COMMIT'&&n===0&&failCommit)throw Error('lost commit acknowledgment');if(text.includes('loyalty_admin_command_v1')||text.includes('loyalty_customer_command_v1'))return{rows:[responses.shift()],rowCount:1};return{rows:[],rowCount:0};},release(){}};}}};}
test('admin uses resolved tenant authority, bounded native command, and rejects malformed native output',async()=>{
 const f=fixture([{outcome:'found',result_payload:{programs:[]}}]);const repo=new PostgresLoyaltyRepository({...options,pool:f.pool as never});assert.deepEqual(await repo.command({tenantContext:context,now:NOW,action:'list',payload:{}}),{programs:[]});
 const call=f.calls.find(x=>x.text.includes('loyalty_admin_command_v1'))!;assert.equal(call.values?.[0],ID);assert.equal(call.values?.[7],'list');assert.ok(f.calls.some(x=>x.text==='BEGIN READ ONLY'));
 const malformed=fixture([{outcome:'found',result_payload:{programs:[],private:'leak'}}]);await assert.rejects(new PostgresLoyaltyRepository({...options,pool:malformed.pool as never}).command({tenantContext:context,now:NOW,action:'list',payload:{}}),/unavailable/);
});
test('cashier cannot edit programs merely because it knows the tenant id',async()=>{
 const f=fixture([]),repo=new PostgresLoyaltyRepository({...options,pool:f.pool as never});await assert.rejects(repo.command({tenantContext:{...context,membership:{...context.membership,role:'cashier'}},now:NOW,action:'adjust',operationId:ID,payload:{programId:ID,customerId:ID,delta:1,reason:'Düzeltme'}}),/membership_denied/);assert.equal(f.calls.length,0);
});
test('lost COMMIT acknowledgment recovers the exact recorded command without replaying the effect',async()=>{
 const result={operationId:ID,customerId:ID,programId:ID,progress:3};const f=fixture([{outcome:'committed',result_payload:result},{outcome:'operation_replayed',result_payload:result}],true),repo=new PostgresLoyaltyRepository({...options,pool:f.pool as never});
 assert.deepEqual(await repo.command({tenantContext:context,now:NOW,action:'adjust',operationId:ID,payload:{programId:ID,customerId:ID,delta:1,reason:'Düzeltme'}}),result);
 assert.deepEqual(f.calls.filter(x=>x.text.includes('loyalty_admin_command_v1')).map(x=>x.values?.[7]),['adjust','recover']);
});
test('customer native owner denial stays denied and untrusted customerId cannot be supplied',async()=>{
 const f=fixture([{outcome:'membership_denied',result_payload:null}]);const repo=new PostgresLoyaltyCustomerRepository({...options,role:'celebix_saas_host_resolver',pool:f.pool as never}),base={hostname:'atlas.celebix.site',now:NOW,candidates:[{keyId:'account-current',digest:'a'.repeat(64)}],action:'prepare-reward' as const,operationId:ID};
 await assert.rejects(repo.command({...base,payload:{rewardId:ID}}),/membership_denied/);
 await assert.rejects(repo.command({...base,payload:{rewardId:ID,customerId:ID} as never}),/invalid_input/);
});
