import assert from 'node:assert/strict';
import test from 'node:test';
import type {QueryResult} from 'pg';
import type {TenantContext} from '@celebix/saas-contracts';
import type {PostgresClientLike} from '../postgres/pool.ts';
import {PostgresCommercialPlanRepository} from './repository.ts';
const ID='11111111-1111-4111-8111-111111111111',PLAN='00000000-0000-4000-8000-000000000003',TARGET='00000000-0000-4000-8000-000000000006',NOW=new Date('2026-10-17T12:00:00.000Z');
const context={schemaVersion:1,requestId:'test',principal:{id:ID,issuer:'https://auth.test/oidc',subject:'test'},store:{id:ID,slug:'test',status:'active'},membership:{id:ID,role:'store_owner',status:'active'},entitlements:{schemaVersion:1,planId:PLAN,planCode:'free_starter',version:2,status:'active',features:['orders'],limits:{products:100,staff:1,storageBytes:1000},validFrom:'2026-01-01T00:00:00.000Z'},locale:'tr-TR'} as TenantContext;
const overview={plan:{planId:PLAN,planCode:'free_starter',version:2},usage:{products:1,variants:1,staff:1,storageBytes:0,monthlyOrders:0,customDomains:0}};
const receipt={requestId:ID,storeId:ID,planId:TARGET,status:'pending',createdAt:NOW.toISOString(),replayed:false};
class Client implements PostgresClientLike{
 queries:{text:string;values?:unknown[]}[]=[];released:unknown[]=[];
 constructor(readonly result:unknown,readonly loseCommit=false){}
 async query(text:string,values?:unknown[]):Promise<QueryResult<Record<string,unknown>>>{this.queries.push({text,values});if(text==='COMMIT'&&this.loseCommit)throw Error('private transport');const rows=text.includes('AS result')?[{result:this.result}]:[];return {rows,rowCount:rows.length,command:'SELECT',oid:0,fields:[]};}
 release(value?:boolean|Error){this.released.push(value);}
}
function repo(client:Client){return new PostgresCommercialPlanRepository({pool:{connect:async()=>client},role:'celebix_saas_app',timeouts:{poolCheckoutMs:100,statementMs:200,lockMs:100,idleTransactionMs:200}});}
test('plan read uses a restricted transaction and trusted seven-field authority',async()=>{const c=new Client(overview);assert.deepEqual(await repo(c).read({tenantContext:context,now:NOW}),overview);const call=c.queries.find(q=>q.text.includes('commercial_plan_read'))!;assert.deepEqual(call.values,[ID,ID,ID,PLAN,'free_starter',2,NOW]);assert.equal(c.queries[0]?.text,'BEGIN READ ONLY');assert.ok(c.queries.some(q=>q.text==='SET LOCAL ROLE celebix_saas_app'));});
test('cross-plan or cross-store response cannot commit',async()=>{for(const result of [{...overview,plan:{...overview.plan,planId:TARGET}},{...overview,request:{...receipt,storeId:TARGET}}]){const c=new Client(result);await assert.rejects(()=>repo(c).read({tenantContext:context,now:NOW}));assert.equal(c.queries.at(-1)?.text,'ROLLBACK');}});
test('requests require owner and validate exact intent before connecting',async()=>{let connects=0;const r=new PostgresCommercialPlanRepository({pool:{connect:async()=>{connects++;return new Client(receipt);}},role:'celebix_saas_app',timeouts:{poolCheckoutMs:100,statementMs:200,lockMs:100,idleTransactionMs:200}});await assert.rejects(()=>r.request({tenantContext:{...context,membership:{...context.membership,role:'admin'}},now:NOW,intent:{planId:TARGET,operationId:ID}}));await assert.rejects(()=>r.request({tenantContext:context,now:NOW,intent:{planId:TARGET,operationId:ID,storeId:ID}as never}));assert.equal(connects,0);});
test('lost request commit never replays a write and reports safe uncertainty',async()=>{const c=new Client(receipt,true);await assert.rejects(()=>repo(c).request({tenantContext:context,now:NOW,intent:{planId:TARGET,operationId:ID}}),e=>(e as {code?:string}).code==='commit_unknown');assert.equal(c.queries.filter(q=>q.text.includes('commercial_upgrade_request')).length,1);assert.deepEqual(c.released,[true]);});
